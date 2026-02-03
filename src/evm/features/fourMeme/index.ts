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
import {
  formatUnits,
  getCreate2Address,
  parseUnits,
  zeroAddress,
  type Address,
  type Chain,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { FACTORY_ADDRESS, FOURMEME, FOURMEME_HELPER, FOURMEME_TOKEN_CODE } from "./config";
import type { NumberString } from "@zlikemario/helper/types";
import { Memoize } from "@zlikemario/helper/decorator-old";
import { bsc, bscTestnet } from "viem/chains";

interface TokenData {
  version: bigint;
  tokenManager: string;
  quote: string;
  lastPrice: bigint; // 代表 "一个Base" 是多少 "最小单位的quote"
  tradingFeeRate: number; // < 1
  minTradingFee: bigint;
  launchTime: bigint;
  offers: bigint;
  maxOffers: bigint;
  funds: bigint;
  maxFunds: bigint;
  liquidityAdded: boolean;
}

export interface TokenInfo {
  image: File;
  name: string;
  symbol: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
}

export class FourMemeHelper extends Contract<typeof fourMemeHelper> {
  constructor(chain: Chain, rpcOrProvider?: string | EIP1193Provider) {
    super(chain, FOURMEME_HELPER, fourMemeHelper, rpcOrProvider);
  }

  async getTokenInfo(tokenAddress: string): Promise<TokenData> {
    const [
      version,
      tokenManager,
      quote,
      lastPrice,
      tradingFeeRate,
      minTradingFee,
      launchTime,
      offers,
      maxOffers,
      funds,
      maxFunds,
      liquidityAdded,
    ] = await this.readableContract.read.getTokenInfo([tokenAddress as Address]);
    if (version === 0n) throw new Error("未找到 fourMeme 上的代币池子信息");
    return {
      version,
      tokenManager,
      quote,
      lastPrice, // 价格, 代表 "一个Base" 是多少 "最小单位的quote"
      tradingFeeRate: BigNumber(tradingFeeRate).div(10000).toNumber(),
      minTradingFee,
      launchTime,
      offers,
      maxOffers,
      funds,
      maxFunds,
      liquidityAdded,
    };
  }

  @Memoize()
  async getStaticTokenInfo(tokenAddress: string) {
    const tokenInfo = await this.getTokenInfo(tokenAddress);
    return {
      version: tokenInfo.version,
      tokenManager: tokenInfo.tokenManager,
      quote: tokenInfo.quote,
      launchTime: tokenInfo.launchTime,
      tradingFeeRate: tokenInfo.tradingFeeRate,
      minTradingFee: tokenInfo.minTradingFee,
    };
  }
}

class FourMeme extends Contract<typeof fourMemeV2> {
  static readonly mainnet = bsc;
  static readonly testnet = bscTestnet;
  fourMemeHelper: FourMemeHelper;
  proxyUrl: string | undefined;
  constructor(chain: Chain, rpcOrProvider?: string | EIP1193Provider, proxyUrl?: string) {
    super(chain, FOURMEME, fourMemeV2, rpcOrProvider);
    this.fourMemeHelper = new FourMemeHelper(chain, rpcOrProvider);
    this.proxyUrl = proxyUrl;
  }

  static computeTokenAddress(salt: string) {
    return getCreate2Address({ from: FACTORY_ADDRESS, salt: salt as Hex, bytecode: FOURMEME_TOKEN_CODE });
  }

  static readonly BNB = zeroAddress;

  static aligningAmount(v: bigint) {
    return (v / 1000000000n) * 1000000000n;
  }

  static readonly lpTradingFee = 0.0025;
  static tradeWithFee(bnb: bigint) {
    return BigInt(BigNumber(FourMeme.lpTradingFee).times(bnb).plus(bnb).dp(0).toString());
  }

  static computeMinOutTokenAmount(bnbAmount: bigint, price: bigint, slippage: number, tokenDecimals: number) {
    const minOut = BigNumber(bnbAmount)
      .div(price)
      .times(1 - slippage)
      .dp(0, BigNumber.ROUND_DOWN)
      .toString();
    return parseUnits(minOut, tokenDecimals);
  }

  static computeMinOutBnbAmount(tokenAmount: bigint, price: bigint, slippage: number, tokenDecimals: number) {
    const minOut = BigNumber(formatUnits(tokenAmount, tokenDecimals))
      .times(price)
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
    const hash = await contract.write.buyTokenAMAP(
      [0n, tokenAddress as Address, bnbValue, FourMeme.aligningAmount(minTokenAmount)],
      { value: bnbValue, ...override },
    );
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
      [0n, tokenAddress as Address, FourMeme.aligningAmount(tokenAmount), FourMeme.aligningAmount(minBnbAmount)],
      override,
    );
    return this.wrapWriteContractReturn(hash);
  }

  async getMinOutTokenAmount(
    tokenAddress: string,
    bnbAmount: bigint,
    slippage: number,
    tokenDecimals?: number,
    tokenData?: TokenData,
  ) {
    const _tokenData = tokenData ?? (await this.fourMemeHelper.getTokenInfo(tokenAddress));
    const likeErc20 = new LikeErc20(this.chain, tokenAddress, this.rpcOrProvider);
    const _tokenDecimals = tokenDecimals ?? (await likeErc20.getDecimals());
    // 买入时需要先扣除手续费，用剩余的BNB计算能买到的代币
    const tradingFee = BigNumber(bnbAmount).times(_tokenData.tradingFeeRate).dp(0, BigNumber.ROUND_UP);
    const actualFee = BigNumber.max(tradingFee, _tokenData.minTradingFee);
    const actualBuyBNB = BigNumber(bnbAmount).minus(actualFee).dp(0, BigNumber.ROUND_DOWN);
    if (!actualBuyBNB.isPositive()) throw new Error("支付金额不能低于最低手续费");
    return FourMeme.computeMinOutTokenAmount(
      BigInt(actualBuyBNB.toString()),
      _tokenData.lastPrice,
      slippage,
      _tokenDecimals,
    );
  }

  async getMinOutBnbAmount(
    tokenAddress: string,
    tokenAmount: bigint,
    slippage: number,
    tokenDecimals?: number,
    tokenData?: TokenData,
  ) {
    const _tokenData = tokenData ?? (await this.fourMemeHelper.getTokenInfo(tokenAddress));
    const likeErc20 = new LikeErc20(this.chain, tokenAddress, this.rpcOrProvider);
    const _tokenDecimals = tokenDecimals ?? (await likeErc20.getDecimals());
    const minOutBnb = FourMeme.computeMinOutBnbAmount(tokenAmount, _tokenData.lastPrice, slippage, _tokenDecimals);
    // 卖出时需要扣除手续费，确保返回值是扣除手续费后的最小 BNB
    const tradingFee = BigNumber(minOutBnb).times(_tokenData.tradingFeeRate).dp(0, BigNumber.ROUND_UP);
    const actualFee = BigNumber.max(tradingFee, _tokenData.minTradingFee);
    const minOutAfterFee = BigNumber(minOutBnb).minus(actualFee).dp(0, BigNumber.ROUND_DOWN);
    // 如果扣除手续费后为负数或0，返回0（这会导致交易验证失败，但不会报 GW 错误）
    return minOutAfterFee.isPositive() ? BigInt(minOutAfterFee.toString()) : 0n;
  }

  /**
   * buy: BNB => Token
   * sell: Token => BNB
   */
  async swap(
    inToken: string,
    outToken: string,
    inAmount: bigint,
    slippage: number, // < 1
    providerOrPrivateKey?: EIP1193Provider | string,
    override?: CallOverride,
  ) {
    if (inToken === FourMeme.BNB) {
      // buy
      const bnbAmount = inAmount;
      const tokenAddress = outToken;
      const minOutToken = await this.getMinOutTokenAmount(tokenAddress, bnbAmount, slippage);
      return await this.buyToken(tokenAddress, bnbAmount, minOutToken, providerOrPrivateKey, override);
    } else {
      // sell
      const tokenAmount = inAmount;
      const tokenAddress = inToken;
      const minOutBnb = await this.getMinOutBnbAmount(tokenAddress, tokenAmount, slippage);
      return await this.sellToken(tokenAddress, tokenAmount, minOutBnb, providerOrPrivateKey, override);
    }
  }

  /**
   *
   * @returns {string} accessToken
   */
  async login(providerOrPrivateKey?: EIP1193Provider | string, proxyUrl?: string) {
    const walltClient = await this.getWalletClient(providerOrPrivateKey);
    const walletAddress = walltClient.account.address;
    const nonce = await getUserNonce(walletAddress, proxyUrl);
    return await loginFourMeme(walletAddress, nonce, (message) => walltClient.signMessage({ message }), proxyUrl);
  }

  /**
   *
   * @returns { imageUrl: string, signature: string, createArg: string, tokenAddress: string, tokenInfo: TokenInfo }
   */
  async preparePublishToken(
    accessToken: string,
    tokenInfo: TokenInfo,
    amount: NumberString = "0", // 开发者买入
    proxyUrl?: string,
  ) {
    const imageUrl = await uploadTokenImage(accessToken, tokenInfo.image, proxyUrl);
    const result = await createToken(accessToken, imageUrl, tokenInfo, amount, proxyUrl);
    const tokenAddress = FourMeme.computeTokenAddress(`0x${result.createArg.substring(130, 194)}`);
    return { imageUrl, tokenInfo, tokenAddress, ...result };
  }

  async publishToken(
    tokenInfo: {
      image: File;
      name: string;
      symbol: string;
      description: string;
      website: string;
      twitter: string;
      telegram: string;
    },
    amount: NumberString = "0", // 开发者买入
    providerOrPrivateKey?: EIP1193Provider | string,
    override?: CallOverride,
  ) {
    // 登录
    const accessToken = await this.login(providerOrPrivateKey, this.proxyUrl);

    // 上传
    const { signature, createArg } = await this.preparePublishToken(accessToken, tokenInfo, amount, this.proxyUrl);

    // 发币
    const walltClient = this.getWalletClient(providerOrPrivateKey);
    const contract = this.getWriteableContract(walltClient);
    const hash = await contract.write.createToken([createArg as Hex, signature as Hex], {
      // FourMeme 部署成本 0.01BNB，参考 https://four.meme/create-token
      value: FourMeme.aligningAmount(FourMeme.tradeWithFee(parseUnits(BigNumber(amount).plus("0.01").toString(), 18))),
      ...override,
    });
    return this.wrapWriteContractReturn(hash);
  }
}

export default FourMeme;
