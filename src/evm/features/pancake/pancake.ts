/**
 * @name Pancake
 * @description 用于在 pancake 协议基础上交换代币
 * @version v4 暂时没部署到正式
 * @version smart smart 属于v3版本。官方介绍 smart 合约 v2,v3 都可以交易，会自动切换
 * @note {ROUTER_CONTRACT_ADDRESS.smart} 在通过路由器进行的所有交换结束时，应调用 refundETH。(https://developer.pancakeswap.finance/contracts/v3/smartrouter)
 * @contract permit2 智能授权，一次授权，永久可用
 *
 * @contract ROUTER_CONTRACT_ADDRESS.smart
 * @method exactInputSingle 精确的输入，最小的输出，比如想卖出 100 TOKEN, 最少输出 0.1 WBNB
 * @method exactOutputSingle 精确的输出，最大的花费，比如想买入 100 TOKEN，最大话费 0.1 WBNB
 * @method getApprovalType 获取授权状态
 * @method multicall 用来一键砸盘？
 * @method refundETH 路由器执行交换时，调用 refundETH
 * @method selfPermitIfNecessary
 * @method swapExactTokensForTokens
 * @method swapTokensForExactTokens
 */
import PANCAKE_SMART_ABI from "../../abi/pancakeSmart";
import FACTORY_ABI_V3 from "../../abi/pancakeFactoryV3";
import FACTORY_ABI_V2 from "../../abi/pancakeFactoryV2";
import POOL_ABI_V2 from "../../abi/pancakePoolV2";
import POOL_ABI_V3 from "../../abi/pancakePoolV3";
import { BigNumber } from "@zlikemario/helper/number";
import { Contract } from "~/evm/lib";
import { bsc } from "viem/chains";
import type { Address, EIP1193Provider } from "viem";
import { Memoize } from "@zlikemario/helper/decorator-old";

export class PancakeFactoryV2 extends Contract<typeof FACTORY_ABI_V2> {
  static fee = 2500;
  static poolFee = "0.0025"; // 0.25%
  constructor(rpcOrProvider?: string | EIP1193Provider) {
    super(bsc, "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", FACTORY_ABI_V2, rpcOrProvider);
  }

  @Memoize(0, (i, o) => `${i}-${o}`)
  async getPoolAddress(outToken: string, inToken: string) {
    return this.readableContract.read.getPair([outToken as Address, inToken as Address]);
  }
}

export class PancakeFactoryV3 extends Contract<typeof FACTORY_ABI_V3> {
  static poolFees = [100, 500, 2500, 10000]; // 0.25%
  constructor(rpcOrProvider?: string | EIP1193Provider) {
    super(bsc, "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865", FACTORY_ABI_V3, rpcOrProvider);
  }

  @Memoize(0, (i, o) => `${i}-${o}`)
  async getPoolAddressList(outToken: string, inToken: string) {
    const results = await Promise.allSettled(
      PancakeFactoryV3.poolFees.map(async (fee) => {
        const poolAddress = await this.readableContract.read.getPool([outToken as Address, inToken as Address, fee]);
        if (poolAddress === "0x0000000000000000000000000000000000000000") {
          throw new Error("pool not found");
        }
        return {
          poolAddress,
          fee,
          poolFee: BigNumber(fee)
            .div(10n ** 6n)
            .toString(),
        };
      })
    );
    return results
      .filter(
        (
          i
        ): i is PromiseFulfilledResult<{
          poolAddress: `0x${string}`;
          fee: number;
          poolFee: NumberString;
        }> => i.status === "fulfilled"
      )
      .map((i) => i.value);
  }
}

export class PancakePoolV2 extends Contract<typeof POOL_ABI_V2> {
  static poolFees = [100, 500, 2500, 10000]; // 0.25%
  constructor(poolAddress: string, rpcOrProvider?: string | EIP1193Provider) {
    super(bsc, poolAddress, POOL_ABI_V2, rpcOrProvider);
  }

  async getPrice() {
    const [reserveOut, reserveIn] = await this.readableContract.read.getReserves();
    return BigNumber(reserveOut).div(reserveIn).toString() as NumberString;
  }
}

export class PancakePoolV3 extends Contract<typeof POOL_ABI_V3> {
  static poolFees = [100, 500, 2500, 10000]; // 0.25%
  constructor(poolAddress: string, rpcOrProvider?: string | EIP1193Provider) {
    super(bsc, poolAddress, POOL_ABI_V3, rpcOrProvider);
  }

  async getPrice() {
    const result = await this.readableContract.read.slot0();
    const [sqrtPriceX96] = result;
    return BigNumber(sqrtPriceX96.toString())
      .div(2n ** 96n)
      .pow("2")
      .toString() as NumberString;
  }
}

class PancakeSwap extends Contract<typeof PANCAKE_SMART_ABI> {
  constructor(rpcOrProvider?: string | EIP1193Provider) {
    super(bsc, "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", PANCAKE_SMART_ABI, rpcOrProvider);
  }

  static computeMinOutTokenRawAmount(rawBNBAmount: bigint, price: NumberString, slippage: number) {
    const minOut = BigNumber(rawBNBAmount)
      .div(price)
      .times(1 - slippage)
      .dp(0, BigNumber.ROUND_DOWN)
      .toString();
    return BigInt(minOut);
  }

  @Memoize(0)
  async nativeAddress() {
    return await this.readableContract.read.WETH9();
  }

  @Memoize(0)
  async factoryV2Address() {
    return await this.readableContract.read.factoryV2();
  }

  @Memoize(0)
  async factoryV3Address() {
    return await this.readableContract.read.factory();
  }

  @Memoize(0, (b, q) => `${b}-${q}`)
  async getCachedPoolAddress(outToken: string, inToken: string) {
    const [factoryV2, factoryV3] = await Promise.all([this.factoryV2Address(), this.factoryV3Address()]);
    if (!factoryV2 && !factoryV3) throw new Error("no factory found on router");

    let isV3: boolean = false;
    let poolAddress: string;
    let poolFee = PancakeFactoryV2.poolFee;
    let fee = PancakeFactoryV2.fee;
    const factoryV2Contract = new PancakeFactoryV2(this.rpcOrProvider);
    poolAddress = await factoryV2Contract.getPoolAddress(outToken, inToken);
    if (!poolAddress || poolAddress === "0x0000000000000000000000000000000000000000") {
      isV3 = true;
      const factoryV3Contract = new PancakeFactoryV3(this.rpcOrProvider);
      /**
       * @refresh https://blog.pancakeswap.finance/articles/how-to-swap-on-pancake-swap-v3-a-comprehensive-guide?utm_source=chatgpt.com
       * @levels  100 → 0.01% | 500 → 0.05% | 2500 → 0.25% | 10000 → 1%
       */
      const pools = await factoryV3Contract.getPoolAddressList(outToken, inToken);
      if (!pools.length) throw new Error("pool not found");
      ({ poolAddress, fee, poolFee } = pools[0]);
    }
    if (!poolAddress) throw new Error("pair not found");

    return { poolAddress, isV3, poolFee, fee };
  }

  async getMinOutTokenRawAmount(outToken: string, inToken: string, inAmount: bigint, slippage: number) {
    const { isV3, poolAddress, poolFee, fee } = await this.getCachedPoolAddress(outToken, inToken);
    let price: NumberString;
    const realQuoteAmount = BigInt(BigNumber(inAmount).times(BigNumber(1).minus(poolFee)).toString());
    if (isV3) {
      const pool = new PancakePoolV3(poolAddress, this.rpcOrProvider);
      price = await pool.getPrice();
    } else {
      const pool = new PancakePoolV2(poolAddress, this.rpcOrProvider);
      price = await pool.getPrice();
    }
    return {
      minOutToken: PancakeSwap.computeMinOutTokenRawAmount(realQuoteAmount, price, slippage),
      fee,
    };
  }

  async swap(
    inToken: string,
    outToken: string,
    inAmount: bigint,
    slippage: number,
    providerOrPrivateKey?: EIP1193Provider | string
  ) {
    const walletClient = this.getWalletClient(providerOrPrivateKey);
    const contract = this.getWriteableContract(walletClient);
    const { minOutToken, fee } = await this.getMinOutTokenRawAmount(outToken, inToken, inAmount, slippage);
    const receiver = walletClient.account.address;
    const params = {
      tokenIn: inToken as Address,
      tokenOut: outToken as Address,
      fee,
      recipient: receiver,
      amountIn: inAmount,
      amountOutMinimum: minOutToken,
      sqrtPriceLimitX96: 0n,
    };
    contract.write.exactInputSingle([params]);
  }
}

export default PancakeSwap;
