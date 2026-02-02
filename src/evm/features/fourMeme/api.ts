import type { NumberString } from "@zlikemario/helper/types";
import request from "~/api/request";

export async function getUserNonce(address: string) {
  const response = await request.post<{ data: string; msg: string }>(
    "https://four.meme/meme-api/v1/private/user/nonce/generate",
    {
      accountAddress: address, // "user wallet address"
      verifyType: "LOGIN",
      networkCode: "BSC",
    },
    { headers: { "content-type": "application/json" } },
  );
  const result = response.data;
  if (!result?.data) throw new Error(`FourMeme Generate Nonce Failed: ${result.msg}`);
  return result.data as string;
}

export async function loginFourMeme(address: string, nonce: string, sign: (message: string) => Promise<string>) {
  const signature = await sign(`You are sign in Meme ${nonce}`);
  const response = await request.post<{ data: string; msg: string }>(
    "https://four.meme/meme-api/v1/private/user/login/dex",
    {
      region: "WEB",
      langType: "EN",
      loginIp: "",
      inviteCode: "",
      verifyInfo: { address: address, networkCode: "BSC", signature: signature, verifyType: "LOGIN" },
      walletName: "MetaMask",
    },
    {
      headers: { "content-type": "application/json" },
    },
  );
  const result = response.data;
  if (!result?.data) throw new Error(`FourMeme Login Failed: ${result.msg}`);
  return result.data as string;
}

export async function uploadTokenImage(accessToken: string, file: File) {
  const data = new FormData();
  data.set("file", file);
  const response = await request.post<{ data: string; msg: string }>(
    "https://four.meme/meme-api/v1/private/token/upload",
    data,
    {
      headers: { "meme-web-access": accessToken },
    },
  );
  const result = response.data;
  if (!result?.data) throw new Error(`FourMeme Upload Token Image Failed: ${result.msg}`);
  return result.data as string;
}

const createTokenFixedParams = {
  lpTradingFee: 0.0025,
  rushMode: false,
  onlyMPC: false, // 是否创建一个只能使用币安MPC钱包交易的令牌
  totalSupply: 1000000000,
  raisedAmount: 18,
  saleRate: 0.8,
  reserveRate: 0,
  funGroup: false,
  clickFun: false,
  symbol: "BNB",
  dexType: "PANCAKE_SWAP",
  raisedToken: {
    symbol: "BNB",
    nativeSymbol: "BNB",
    symbolAddress: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    deployCost: "0",
    buyFee: "0.01",
    sellFee: "0.01",
    minTradeFee: "0",
    b0Amount: "8",
    totalBAmount: "24",
    totalAmount: "1000000000",
    logoUrl: "https://static.four.meme/market/68b871b6-96f7-408c-b8d0-388d804b34275092658264263839640.png",
    tradeLevel: ["0.1", "0.5", "1"],
    status: "PUBLISH",
    buyTokenLink: "https://pancakeswap.finance/swap",
    reservedNumber: 10,
    saleRate: "0.8",
    networkCode: "BSC",
    platform: "MEME",
  },
};
export async function createToken(
  accessToken: string,
  imageUrl: string,
  tokenInfo: {
    name: string;
    symbol: string;
    description: string;
    website?: string;
    twitter?: string;
    telegram?: string;
  },
  creatorBuyAmount: NumberString = "0", // 0 为不买入
) {
  const response = await request.post<{ data: { createArg: string; signature: string }; msg: string }>(
    "https://four.meme/meme-api/v1/private/token/create",
    {
      ...createTokenFixedParams,
      name: tokenInfo.name,
      shortName: tokenInfo.symbol,
      desc: tokenInfo.description,
      launchTime: Date.now(),
      label: "Meme", // Meme/AI/Defi/Games/Infra/De-Sci/Social/Depin/Charity/Others
      webUrl: tokenInfo.website || void 0, // 如果没有不能传空字符串
      twitterUrl: tokenInfo.twitter || void 0, // 如果没有不能传空字符串
      telegramUrl: tokenInfo.telegram || void 0, // 如果没有不能传空字符串
      preSale: creatorBuyAmount,
      imgUrl: imageUrl,
    },
    { headers: { "content-type": "application/json", "meme-web-access": accessToken } },
  );
  const result = response.data;
  if (!result?.data) throw new Error(`FourMeme Create Token Failed: ${result.msg}`);
  return result.data as { createArg: string; signature: string };
}
