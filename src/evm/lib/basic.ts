import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  webSocket,
  type Address,
  type Chain,
  type EIP1193Provider,
  type Hex,
  type PrivateKeyAccount,
  type PublicClient,
  type Transport,
  type WebSocketTransport,
} from "viem";
import { waitForTransactionReceipt } from "viem/actions";
import { Memoize } from "@zlikemario/helper/decorator-old";
import { privateKeyToAccount } from "viem/accounts";
import type { MaybeUndefined } from "@zlikemario/helper/types";

class Basic {
  transport: Transport;
  wsTransport: MaybeUndefined<WebSocketTransport>;
  chain: Chain;
  rpcOrProvider?: string | EIP1193Provider;
  constructor(chain: Chain, rpcOrProvider?: string | EIP1193Provider) {
    this.chain = chain;
    this.rpcOrProvider = rpcOrProvider;
    this.transport = typeof rpcOrProvider === "string" || !rpcOrProvider ? http(rpcOrProvider) : custom(rpcOrProvider);
    this.wsTransport =
      typeof rpcOrProvider === "string" || !rpcOrProvider
        ? webSocket(rpcOrProvider?.replace(/^http(s?)/, (_, s) => `ws${s}`))
        : void 0;
  }

  async getBalance(address: string) {
    return await this.publicClient.getBalance({ address: address as Address });
  }

  async getBlock() {
    return await this.publicClient.getBlock();
  }

  async getBlockNumber() {
    return await this.publicClient.getBlockNumber();
  }

  @Memoize()
  async getChainId() {
    return await this.publicClient.getChainId();
  }

  @Memoize(10000)
  async getGasPrice() {
    return await this.publicClient.getGasPrice();
  }

  async getNonce(address: string) {
    return await this.publicClient.getTransactionCount({ address: address as Address });
  }

  @Memoize()
  get publicClient() {
    return createPublicClient({
      chain: this.chain,
      transport: this.transport,
    });
  }

  @Memoize()
  get wsClient() {
    return createPublicClient({
      chain: this.chain,
      transport: this.wsTransport ?? this.transport,
    }) as PublicClient<WebSocketTransport, Chain>;
  }

  @Memoize()
  get walletClient() {
    return createWalletClient<Transport, Chain, PrivateKeyAccount>({
      chain: this.chain,
      transport: this.transport,
    });
  }

  getWalletClient(providerOrPrivateKey?: EIP1193Provider | string) {
    if (!providerOrPrivateKey) {
      return createWalletClient<Transport, Chain, PrivateKeyAccount>({
        chain: this.chain,
        transport: this.transport,
      });
    }
    if (typeof providerOrPrivateKey === "string") {
      const privateKeyAccount = privateKeyToAccount(providerOrPrivateKey as Hex);
      return createWalletClient({
        chain: this.chain,
        transport: this.transport,
        account: privateKeyAccount,
      });
    }
    return createWalletClient<Transport, Chain, PrivateKeyAccount>({
      chain: this.chain,
      transport: custom(providerOrPrivateKey),
    });
  }

  async waitConfirmTransaction(hash: Hex, confirmBlockCount = 1) {
    const receipt = await waitForTransactionReceipt(this.publicClient, { hash, confirmations: confirmBlockCount });
    if (receipt.status === "reverted") {
      throw new Error(`Transaction Failed, Hash: ${receipt.transactionHash}`);
    }
    return receipt;
  }

  wrapWriteContractReturn(hash: Hex) {
    return { wait: (c?: number) => this.waitConfirmTransaction(hash, c), hash };
  }
}

export default Basic;
