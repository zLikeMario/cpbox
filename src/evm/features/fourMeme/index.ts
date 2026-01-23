/**
 * @name FourMeme
 * @description four.meme 的买卖程序
 * @link https://four-meme.gitbook.io/four.meme/brand/protocol-integration
 *
 * @member fourMemeHelper
 *  获取用户信息, 执行预计算
 *  @method getTokenInfo 获取 token 信息
 *  @tryBuy 尝试购买并预估结果
 *  @trySell 尝试出售并预估结果
 *
 * @member fourMemeV1
 *  仍然用于交易旧堤币，但无法创建新代币
 *  @method purchaseTokenAMAP 购买 “特定BNB” 和 “最小得到代币数量”
 *  @method purchaseToken 购买 ”特定代币数量“ 和 ”最大BNB花费“
 *  @method saleToken 出售 “特定代币数量”
 *
 * @member fourMemeV2
 *  用于交易新代币，(2024年9月5日之后创建的代币)
 *  @method buyTokenAMAP(address,address,uint256,uint256) 为 “特定地址” 购买 “特定BNB” 和 “最小得到代币数量”
 *  @method buyTokenAMAP(address,uint256,uint256) 购买 “特定BNB” 和 “最小得到代币数量”
 *  @method buyTokenAMAP(uint256,address,uint256,uint256) 购买 “特定BNB” 和 “最小得到代币数量” (第一个参数给 0)
 *  @method buyToken(address,address,uint256,uint256) 为 “特定地址” 购买 ”特定代币数量“ 和 ”最大BNB花费“
 *  @method buyToken(address,uint256,uint256) 购买 ”特定代币数量“ 和 ”最大BNB花费“
 *  @method sellToken 出售 “特定代币数量”
 *  @method sellToken(uint256,address,uint256,uint256) 出售 “特定代币数量” 和 “最小得到的 BNB” (第一个参数给 0)
 *
 * @implements
 *  1. 使用 bsc_helper 的 getTokenInfo 获取 token 信息
 *  2. 如果 liquidityAdded 是 true，则需要通过 pancake 购买
 */

import fourMemeHelper from "../../abi/fourMemeHelper";
import fourMemeV2 from "../../abi/fourMeme";
import LikeErc20 from "../../lib/likeErc20";
import { BigNumber } from "@zlikemario/helper/number";
import { createToken, getUserNonce, loginFourMeme, uploadTokenImage } from "./api";
import { Contract, type CallOverride } from "../../lib";
import { getCreate2Address, parseUnits, type Address, type Chain, type EIP1193Provider, type Hex } from "viem";
import { FACTORY_ADDRESS, FOURMEME, FOURMEME_HELPER, FOURMEME_TOKEN_CODE } from "./config";
import type { NumberString } from "@zlikemario/helper/types";

export class FourMemeHelper extends Contract<typeof fourMemeHelper> {
  constructor(chain: Chain, rpcOrProvider?: string | EIP1193Provider) {
    super(chain, FOURMEME_HELPER, fourMemeHelper, rpcOrProvider);
  }
}

class FourMeme extends Contract<typeof fourMemeV2> {
  constructor(chain: Chain, rpcOrProvider?: string | EIP1193Provider) {
    super(chain, FOURMEME, fourMemeV2, rpcOrProvider);
  }

  static aligningAmount(v: bigint) {
    return (v / 1000000000n) * 1000000000n;
  }

  static lpTradingFee = 0.0025;
  static tradeWithFee(bnb: bigint) {
    return BigInt(BigNumber(FourMeme.lpTradingFee).times(bnb).plus(bnb).dp(0).toString());
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

  async buyToken(
    tokenAddress: string,
    bnbAmount: bigint,
    minTokenAmount: bigint,
    providerOrPrivateKey?: EIP1193Provider | string,
    override?: CallOverride,
  ) {
    const walletClient = this.getWalletClient(providerOrPrivateKey);
    const contract = this.getWriteableContract(walletClient);
    const bnbValue = FourMeme.aligningAmount(bnbAmount);
    const hash = await contract.write.buyTokenAMAP([0n, tokenAddress as Address, bnbValue, minTokenAmount], {
      value: bnbValue,
      ...override,
    });
    return this.wrapWriteContractReturn(hash);
  }

  async sellToken(
    tokenAddress: string,
    tokenAmount: bigint,
    minBnbAmount: bigint,
    providerOrPrivateKey?: EIP1193Provider | string,
    override?: CallOverride,
  ) {
    const walletClient = this.getWalletClient(providerOrPrivateKey);
    const contract = this.getWriteableContract(walletClient);
    const hash = await contract.write.sellToken(
      [0n, tokenAddress as Address, FourMeme.aligningAmount(tokenAmount), minBnbAmount],
      override,
    );
    return this.wrapWriteContractReturn(hash);
  }

  async swap(
    inToken: string,
    outToken: string,
    inAmount: bigint,
    slippage: number,
    providerOrPrivateKey?: EIP1193Provider | string,
    override?: CallOverride,
  ) {}

  async creaetSignedPublishMemeTokenTransaction(
    tokenInfo: {
      image: File;
      name: string;
      symbol: string;
      description: string;
      website: string;
      twitter: string;
      telegram: string;
    },
    amount: NumberString = "0",
    providerOrPrivateKey?: EIP1193Provider | string,
    override?: CallOverride,
  ) {
    const walltClient = await this.getWalletClient(providerOrPrivateKey);
    const walletAddress = walltClient.account.address;
    const nonce = await getUserNonce(walletAddress);
    const accessToken = await loginFourMeme(walletAddress, nonce, (message) => walltClient.signMessage({ message }));
    const imageUrl = await uploadTokenImage(accessToken, tokenInfo.image);
    const { signature, createArg } = await createToken(accessToken, imageUrl, tokenInfo, amount);
    const contract = this.getWriteableContract(walltClient);
    const transaction = await contract.simulate.createToken([createArg as Hex, signature as Hex], {
      // FourMeme 部署成本 0.01BNB，参考 https://four.meme/create-token
      value: FourMeme.tradeWithFee(parseUnits(BigNumber(amount).plus("0.01").toString(), 18)),
      ...override,
    });
    return {
      imageUrl,
      transaction: await walltClient.signTransaction({ ...transaction.request, to: this.contractAddress as Address }),
      tokenAddress: FourMeme.computeTokenAddress(`0x${createArg.substring(130, 194)}`),
    };
  }

  static computeTokenAddress(salt: string) {
    return getCreate2Address({ from: FACTORY_ADDRESS, salt: salt as Hex, bytecode: FOURMEME_TOKEN_CODE });
  }
}

export default FourMeme;
