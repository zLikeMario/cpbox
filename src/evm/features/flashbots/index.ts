/**
 * @RPC relay.flashbots.net
 * 速率限制
 * eth_sendBundle     1800 / IP / 1 min
 * mev_sendBundle     1800 / IP / 1 min
 * eth_cancelBundle    600 / IP / 1 min
 * mev_simBundle       300 / IP / 1 min
 * eth_callBundle      300 / IP / 1 min
 * All others          120 / IP / 1 min
 */
import request from "~/api/request";
import { keccak256, stringToBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type FlashbotsRpcId = string | number;

export interface FlashbotsAuthSigner {
  address: `0x${string}`;
  signMessage: (payloadHash: Hex) => Promise<Hex>;
}

export interface FlashbotsSendBundleParams {
  txs: string[];
  blockNumber: string;
  minTimestamp?: number;
  maxTimestamp?: number;
  revertingTxHashes?: string[];
  replacementUuid?: string;
  builders?: string[];
}

export interface FlashbotsCallBundleParams {
  txs: string[];
  blockNumber: string;
  stateBlockNumber: string;
  timestamp?: number;
}

export interface FlashbotsMevInclusion {
  block: string;
  maxBlock?: string;
}

export interface FlashbotsMevRefund {
  bodyIdx: number;
  percent: number;
}

export interface FlashbotsMevRefundConfig {
  address: string;
  percent: number;
}

export type FlashbotsMevHint =
  | "calldata"
  | "contract_address"
  | "logs"
  | "function_selector"
  | "hash"
  | "tx_hash"
  | "full";

export interface FlashbotsMevBundleParams {
  version: "v0.1";
  inclusion: FlashbotsMevInclusion;
  body: Array<{ hash: string } | { tx: string; canRevert: boolean } | { bundle: FlashbotsMevBundleParams }>;
  validity?: {
    refund?: FlashbotsMevRefund[];
    refundConfig?: FlashbotsMevRefundConfig[];
  };
  privacy?: {
    hints?: FlashbotsMevHint[];
    builders?: string[];
  };
  metadata?: {
    originId?: string;
  };
}

export interface FlashbotsMevSimBundleParams {
  version: "beta-1";
  inclusion: FlashbotsMevInclusion;
  body: Array<{ hash: string } | { tx: string; canRevert: boolean } | { bundle: FlashbotsMevSimBundleParams }>;
  validity: {
    refund: FlashbotsMevRefund[];
    refundConfig: FlashbotsMevRefundConfig[];
  };
  privacy?: {
    hints?: FlashbotsMevHint[];
    builders?: string[];
  };
  metadata?: {
    originId?: string;
  };
  simOptions?: {
    parentBlock?: string | number;
    blockNumber?: number;
    coinbase?: string;
    timestamp?: number;
    gasLimit?: number;
    baseFee?: bigint;
    timeout?: number;
  };
}

export interface FlashbotsPrivateTxPreferences {
  fast?: boolean;
  privacy?: {
    hints?: Array<"contract_address" | "function_selector" | "calldata" | "logs" | "hash">;
    builders?: Array<"default" | "flashbots">;
  };
  validity?: {
    refund?: Array<{
      address: string;
      percent: number;
    }>;
  };
}

export interface FlashbotsPrivateTxParams {
  tx: string;
  maxBlockNumber?: string;
  preferences?: FlashbotsPrivateTxPreferences;
}

export interface FlashbotsDelayedRefundsParams {
  recipient: string;
  blockRangeFrom?: string;
  blockRangeTo?: string;
  cursor?: string;
  hash?: string;
}

export interface FlashbotsFeeRefundsByRecipientParams {
  recipient: string;
  cursor?: string;
}

export interface FlashbotsFeeRefundsByBundleParams {
  bundle_hash: string;
}

export interface FlashbotsFeeRefundsByBlockParams {
  block_number: string;
}

export interface FlashbotsRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface FlashbotsRpcSuccess<T> {
  jsonrpc: "2.0";
  id: FlashbotsRpcId;
  result: T;
}

interface FlashbotsRpcFailure {
  jsonrpc: "2.0";
  id: FlashbotsRpcId | null;
  error: FlashbotsRpcError;
}

type FlashbotsRpcResponse<T> = FlashbotsRpcSuccess<T> | FlashbotsRpcFailure;

export interface FlashbotsOptions {
  relayUrl?: string;
  authSigner?: FlashbotsAuthSigner;
  authPrivateKey?: Hex;
}

/**
 * Flashbots RPC 客户端。
 *
 * 主要用途：
 * - 提交 bundle（`eth_sendBundle` / `mev_sendBundle`）
 * - 模拟 bundle（`eth_callBundle` / `mev_simBundle`）
 * - 提交与取消私有交易
 *
 * 说明：
 * - 大多数方法需要鉴权签名头 `X-Flashbots-Signature`
 * - `authPrivateKey` 只用于请求鉴权，不要求一定与交易发送地址相同
 */
class Flashbots {
  static readonly relayUrls = {
    mainnet: "https://relay.flashbots.net",
    sepolia: "https://relay-sepolia.flashbots.net",
  };

  relayUrl: string;
  authSigner?: FlashbotsAuthSigner;

  /**
   * 创建 Flashbots 客户端。
   *
   * @param options.relayUrl relay 地址；默认 mainnet，可使用 `Flashbots.relayUrls.sepolia`
   * @param options.authPrivateKey 鉴权私钥（Hex）
   * @param options.authSigner 自定义签名器，优先级高于 `authPrivateKey`
   */
  constructor(options: FlashbotsOptions = {}) {
    this.relayUrl = options.relayUrl ?? Flashbots.relayUrls.mainnet;
    this.authSigner = options.authSigner;

    if (!this.authSigner && options.authPrivateKey) {
      const account = privateKeyToAccount(options.authPrivateKey);
      this.authSigner = {
        address: account.address,
        signMessage: async (payloadHash) => {
          return await account.signMessage({ message: { raw: payloadHash } });
        },
      };
    }
  }

  setAuthSigner(signer?: FlashbotsAuthSigner) {
    this.authSigner = signer;
  }

  private async getAuthHeader(body: string): Promise<string | undefined> {
    if (!this.authSigner) return;
    const payloadHash = keccak256(stringToBytes(body));
    const signature = await this.authSigner.signMessage(payloadHash);
    return `${this.authSigner.address}:${signature}`;
  }

  private async rpc<T>(
    method: string,
    params: unknown[],
    requireAuth = true,
    id: FlashbotsRpcId = Date.now(),
  ): Promise<T> {
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    const authHeader = await this.getAuthHeader(body);
    if (requireAuth && !authHeader) {
      throw new Error(`[Flashbots] ${method} requires authentication signer`);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (authHeader) {
      headers["X-Flashbots-Signature"] = authHeader;
    }

    const { data } = await request.post<FlashbotsRpcResponse<T>>(this.relayUrl, body, { headers });

    if ("error" in data) {
      throw new Error(`[Flashbots:${method}] ${data.error.code} ${data.error.message}`);
    }

    return data.result;
  }

  /**
   * 提交原子 bundle 到 Flashbots（`eth_sendBundle`）。
   *
   * @param params.txs 已签名原始交易数组（`0x...`）
   * @param params.blockNumber 目标区块号（16进制字符串，如 `0xabc123`）
   * @param params.minTimestamp 可选，最小生效时间（秒）
   * @param params.maxTimestamp 可选，最大生效时间（秒）
   * @param params.revertingTxHashes 可选，允许回滚的 tx hash
   * @param params.replacementUuid 可选，用于后续取消/替换 bundle
   * @param params.builders 可选，指定 builder 列表
   * @param id JSON-RPC id，可不传
   *
   * @returns `{ bundleHash, smart? }`
   *
   * @example
   * ```ts
   * const flashbots = new Flashbots({
   *   relayUrl: Flashbots.relayUrls.sepolia,
   *   authPrivateKey: process.env.VITE_FLASHBOTS_AUTH_PRIVATE_KEY as `0x${string}`,
   * });
   *
   * const res = await flashbots.sendBundle({
   *   txs: [signedTx],
   *   blockNumber: "0x123456",
   * });
   *
   * console.log(res.bundleHash);
   * ```
   */
  async sendBundle(params: FlashbotsSendBundleParams, id?: FlashbotsRpcId) {
    return await this.rpc<{ bundleHash: string; smart?: "true" | "false" }>("eth_sendBundle", [params], true, id);
  }

  /**
   * 模拟 bundle（`eth_callBundle`），用于在正式提交前预估执行结果。
   *
   * 常见用法：先 `callBundle` 看是否会 revert、gas/coinbase 收益是否符合预期，再 `sendBundle`。
   */
  async callBundle(params: FlashbotsCallBundleParams, id?: FlashbotsRpcId) {
    return await this.rpc<{
      bundleGasPrice: string;
      bundleHash: string;
      coinbaseDiff: string;
      ethSentToCoinbase: string;
      gasFees: string;
      results: Array<{
        coinbaseDiff: string;
        ethSentToCoinbase: string;
        fromAddress: string;
        gasFees: string;
        gasPrice: string;
        gasUsed: number;
        toAddress: string;
        txHash: string;
        value: string;
      }>;
      stateBlockNumber: number;
      totalGasUsed: number;
    }>("eth_callBundle", [params], true, id);
  }

  /**
   * 取消已提交 bundle（`eth_cancelBundle`）。
   *
   * 注意：只有你在提交时传了 `replacementUuid`，这里才能按该 UUID 取消。
   */
  async cancelBundle(replacementUuid: string, id?: FlashbotsRpcId) {
    return await this.rpc<boolean>("eth_cancelBundle", [{ replacementUuid }], true, id);
  }

  /**
   * 提交 MEV-Share 新格式 bundle（`mev_sendBundle`）。
   *
   * 适用于需要 `inclusion/body/validity/privacy` 等高级控制的场景。
   */
  async mevSendBundle(params: FlashbotsMevBundleParams, id?: FlashbotsRpcId) {
    return await this.rpc<{ bundleHash: string }>("mev_sendBundle", [params], true, id);
  }

  /**
   * 模拟 MEV-Share bundle（`mev_simBundle`）。
   *
   * 返回 `success/profit/gasUsed/logs` 等字段，可用于策略回测或下单前校验。
   */
  async mevSimBundle(params: FlashbotsMevSimBundleParams, id?: FlashbotsRpcId) {
    return await this.rpc<{
      success: boolean;
      stateBlock: string;
      mevGasPrice: string;
      profit: string;
      refundableValue: string;
      gasUsed: string;
      logs: unknown[];
    }>("mev_simBundle", [params], true, id);
  }

  /**
   * 发送私有交易（`eth_sendPrivateTransaction`）。
   *
   * 与公有 mempool 不同，此方式会通过 Flashbots 私有通道分发，减少被抢跑风险。
   */
  async sendPrivateTransaction(params: FlashbotsPrivateTxParams, id?: FlashbotsRpcId) {
    return await this.rpc<string>("eth_sendPrivateTransaction", [params], true, id);
  }

  /**
   * 发送私有原始交易（`eth_sendPrivateRawTransaction`）。
   *
   * @param tx 已签名原始交易（`0x...`）
   * @param preferences 可选私有偏好（如 `fast/privacy/validity`）
   */
  async sendPrivateRawTransaction(tx: string, preferences?: FlashbotsPrivateTxPreferences, id?: FlashbotsRpcId) {
    const params = preferences ? [tx, preferences] : [tx];
    return await this.rpc<string>("eth_sendPrivateRawTransaction", params, true, id);
  }

  /**
   * 取消私有交易（`eth_cancelPrivateTransaction`）。
   *
   * 参数是之前私有交易返回的 tx hash。
   */
  async cancelPrivateTransaction(txHash: string, id?: FlashbotsRpcId) {
    return await this.rpc<boolean>("eth_cancelPrivateTransaction", [{ txHash }], true, id);
  }

  /** 获取某地址的 fee refund 汇总（`pending/received/maxBlockNumber`）。 */
  async getFeeRefundTotalsByRecipient(recipient: string, id?: FlashbotsRpcId) {
    return await this.rpc<{ pending: string; received: string; maxBlockNumber: string }>(
      "flashbots_getFeeRefundTotalsByRecipient",
      [recipient],
      true,
      id,
    );
  }

  /** 分页查询某地址的 fee refund 明细。 */
  async getFeeRefundsByRecipient(params: FlashbotsFeeRefundsByRecipientParams, id?: FlashbotsRpcId) {
    return await this.rpc<{ refunds: unknown[]; cursor?: string }>(
      "flashbots_getFeeRefundsByRecipient",
      [params],
      true,
      id,
    );
  }

  /** 按 bundle hash 查询 fee refund 明细。 */
  async getFeeRefundsByBundle(params: FlashbotsFeeRefundsByBundleParams, id?: FlashbotsRpcId) {
    return await this.rpc<{ refunds: unknown[]; cursor?: string }>(
      "flashbots_getFeeRefundsByBundle",
      [params],
      true,
      id,
    );
  }

  /** 按区块查询 fee refund 明细。 */
  async getFeeRefundsByBlock(params: FlashbotsFeeRefundsByBlockParams, id?: FlashbotsRpcId) {
    return await this.rpc<{ refunds: unknown[]; cursor?: string }>(
      "flashbots_getFeeRefundsByBlock",
      [params],
      true,
      id,
    );
  }

  /**
   * 设置 fee refund 接收地址委托关系（from -> to）。
   *
   * 要求请求签名地址与 `fromAddress` 一致。
   */
  async setFeeRefundRecipient(fromAddress: string, toAddress: string, id?: FlashbotsRpcId) {
    return await this.rpc<{ from: string; to: string }>(
      "flashbots_setFeeRefundRecipient",
      [fromAddress, toAddress],
      true,
      id,
    );
  }

  /** 分页查询 delayed refund 明细。 */
  async getDelayedRefunds(params: FlashbotsDelayedRefundsParams, id?: FlashbotsRpcId) {
    return await this.rpc<{ refunds: unknown[]; nextCursor?: string; indexedUpTo: string }>(
      "buildernet_getDelayedRefunds",
      [params],
      true,
      id,
    );
  }

  /** 查询 delayed refund 汇总（`pending/received/indexedUpTo`）。 */
  async getDelayedRefundTotalsByRecipient(
    params: Omit<FlashbotsDelayedRefundsParams, "cursor" | "hash">,
    id?: FlashbotsRpcId,
  ) {
    return await this.rpc<{ pending: string; received: string; indexedUpTo: string }>(
      "buildernet_getDelayedRefundTotalsByRecipient",
      [params],
      true,
      id,
    );
  }

  /**
   * 查询某接收地址累计 MEV refund 总额。
   *
   * 此接口可匿名调用（不强制鉴权）。
   */
  async getMevRefundTotalByRecipient(recipient: string, id?: FlashbotsRpcId) {
    return await this.rpc<{ total: string }>("flashbots_getMevRefundTotalByRecipient", [recipient], false, id);
  }

  /** 查询某 sender 累计产生的 MEV refund 总额（可匿名调用）。 */
  async getMevRefundTotalBySender(sender: string, id?: FlashbotsRpcId) {
    return await this.rpc<{ total: string }>("flashbots_getMevRefundTotalBySender", [sender], false, id);
  }
}

export default Flashbots;
