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
import { Contract, LikeErc20, type CallOverride } from "~/evm/lib";
import { bsc } from "viem/chains";
import { zeroAddress, type Address, type EIP1193Provider } from "viem";
import { Memoize } from "@zlikemario/helper/decorator-old";
import type { NumberString } from "@zlikemario/helper/types";

export class PancakeFactoryV2 extends Contract<typeof FACTORY_ABI_V2> {
  static readonly fee = 2500;
  static readonly poolFeeRate = "0.0025"; // 0.25%
  constructor(rpcOrProvider?: string | EIP1193Provider) {
    super(bsc, "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73", FACTORY_ABI_V2, rpcOrProvider);
  }

  @Memoize(0, (i, o) => `${i}-${o}`)
  async getPoolAddress(outToken: string, inToken: string) {
    return this.readableContract.read.getPair([outToken as Address, inToken as Address]);
  }
}

export class PancakeFactoryV3 extends Contract<typeof FACTORY_ABI_V3> {
  static readonly poolFees = [100, 500, 2500, 10000]; // 0.25%
  constructor(rpcOrProvider?: string | EIP1193Provider) {
    super(bsc, "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865", FACTORY_ABI_V3, rpcOrProvider);
  }

  @Memoize(0, (i, o) => `${i}-${o}`)
  async getPoolAddressList(outToken: string, inToken: string) {
    const results = await Promise.allSettled(
      PancakeFactoryV3.poolFees.map(async (fee) => {
        const poolAddress = await this.readableContract.read.getPool([outToken as Address, inToken as Address, fee]);
        if (poolAddress === zeroAddress) throw new Error("pool not found");

        return {
          poolAddress,
          fee,
          poolFeeRate: BigNumber(fee)
            .div(10n ** 6n)
            .toString(),
        };
      }),
    );
    return results
      .filter(
        (
          i,
        ): i is PromiseFulfilledResult<{
          poolAddress: `0x${string}`;
          fee: number;
          poolFeeRate: NumberString;
        }> => i.status === "fulfilled",
      )
      .map((i) => i.value);
  }
}

export class PancakePoolV2 extends Contract<typeof POOL_ABI_V2> {
  static readonly poolFees = [100, 500, 2500, 10000]; // 0.25%
  constructor(poolAddress: string, rpcOrProvider?: string | EIP1193Provider) {
    super(bsc, poolAddress, POOL_ABI_V2, rpcOrProvider);
  }

  async getPrice() {
    const [reserveOut, reserveIn] = await this.readableContract.read.getReserves();
    return BigNumber(reserveOut).div(reserveIn).toString() as NumberString;
  }
}

export class PancakePoolV3 extends Contract<typeof POOL_ABI_V3> {
  static readonly poolFees = [100, 500, 2500, 10000]; // 0.25%
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

class Pancake extends Contract<typeof PANCAKE_SMART_ABI> {
  constructor(rpcOrProvider?: string | EIP1193Provider) {
    super(bsc, "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", PANCAKE_SMART_ABI, rpcOrProvider);
  }

  static computeMinOutTokenAmount(inAmount: bigint, price: NumberString, slippage: number) {
    const minOut = BigNumber(inAmount)
      .div(price)
      .times(1 - slippage)
      .dp(0, BigNumber.ROUND_DOWN)
      .toString();
    return BigInt(minOut);
  }

  async approve(
    tokenAddress: string,
    amount: bigint,
    providerOrPrivateKey?: EIP1193Provider | string,
    override?: CallOverride,
  ) {
    const likeErc20 = new LikeErc20(this.chain, tokenAddress, this.rpcOrProvider);
    return await likeErc20.approvePreCheckAllowance(amount, this.contractAddress, providerOrPrivateKey, override);
  }

  @Memoize()
  async nativeAddress() {
    return await this.readableContract.read.WETH9();
  }

  @Memoize()
  async factoryV2Address() {
    return await this.readableContract.read.factoryV2();
  }

  @Memoize()
  async factoryV3Address() {
    return await this.readableContract.read.factory();
  }

  @Memoize(0, (b, q) => `${b}-${q}`)
  async getPoolData(outToken: string, inToken: string) {
    const [factoryV2, factoryV3] = await Promise.all([this.factoryV2Address(), this.factoryV3Address()]);
    if (!factoryV2 && !factoryV3) throw new Error("no factory found on router");

    let isV3: boolean = false;
    let poolAddress: string;
    let poolFeeRate = PancakeFactoryV2.poolFeeRate;
    let fee = PancakeFactoryV2.fee;
    const factoryV2Contract = new PancakeFactoryV2(this.rpcOrProvider);
    poolAddress = await factoryV2Contract.getPoolAddress(outToken, inToken);
    if (!poolAddress || poolAddress === zeroAddress) {
      isV3 = true;
      const factoryV3Contract = new PancakeFactoryV3(this.rpcOrProvider);
      /**
       * @refresh https://blog.pancakeswap.finance/articles/how-to-swap-on-pancake-swap-v3-a-comprehensive-guide?utm_source=chatgpt.com
       * @levels  100 → 0.01% | 500 → 0.05% | 2500 → 0.25% | 10000 → 1%
       */
      const pools = await factoryV3Contract.getPoolAddressList(outToken, inToken);
      if (!pools.length) throw new Error("pool not found");
      ({ poolAddress, fee, poolFeeRate } = pools[0]);
    }
    if (!poolAddress) throw new Error("pair not found");

    return { poolAddress, isV3, poolFeeRate, fee };
  }

  async getMinOutTokenAmount(outToken: string, inToken: string, inAmount: bigint, slippage: number) {
    const { isV3, poolAddress, poolFeeRate, fee } = await this.getPoolData(outToken, inToken);
    let price: NumberString;
    const realInAmount = BigInt(BigNumber(inAmount).times(BigNumber("1").minus(poolFeeRate)).toString());
    if (isV3) {
      const pool = new PancakePoolV3(poolAddress, this.rpcOrProvider);
      price = await pool.getPrice();
    } else {
      const pool = new PancakePoolV2(poolAddress, this.rpcOrProvider);
      price = await pool.getPrice();
    }
    return {
      minOutToken: Pancake.computeMinOutTokenAmount(realInAmount, price, slippage),
      fee,
    };
  }

  async swap(
    inToken: string,
    outToken: string,
    inAmount: bigint,
    slippage: number,
    providerOrPrivateKey?: EIP1193Provider | string,
    callOverride?: CallOverride,
  ) {
    const walletClient = this.getWalletClient(providerOrPrivateKey);
    const contract = this.getWriteableContract(walletClient);
    const { minOutToken, fee } = await this.getMinOutTokenAmount(outToken, inToken, inAmount, slippage);
    const receiver = walletClient.account.address;
    const nativeAddress = await this.nativeAddress();
    let value = 0n;
    if (inToken.toLocaleLowerCase() === nativeAddress.toLocaleLowerCase()) {
      value = inAmount;
    }
    const params = {
      tokenIn: inToken as Address,
      tokenOut: outToken as Address,
      fee,
      recipient: receiver,
      amountIn: inAmount,
      amountOutMinimum: minOutToken,
      sqrtPriceLimitX96: 0n,
    };
    const hash = await contract.write.exactInputSingle([params], { value, ...callOverride });
    return this.wrapWriteContractReturn(hash);
  }
}

export default Pancake;
