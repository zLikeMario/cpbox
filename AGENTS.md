# AGENTS.md

本文件面向 AI Agent，目标：
1. 快速定位“该用哪个方法”
2. 立刻知道“怎么调用、传什么参数”

## 1) 入口与模块

### 包导出
- `@zlikemario/cpbox`
- `@zlikemario/cpbox/evm`

### EVM 入口
```ts
import {
  // lib
  Basic, Contract, LikeErc20, Multicall, Multisend,
  // features
  Pancake, FourMeme, Flashbots,
  // helper
  lookForChain,
} from "@zlikemario/cpbox/evm";
```

### 已实现模块
- `evm/lib`: 基础链交互与合约封装
- `evm/features/pancake`: Pancake 交易与池子查询
- `evm/features/fourMeme`: four.meme 买卖、发币、事件监听
- `evm/features/flashbots`: Flashbots RPC（bundle / private tx / refund）

### 注意
- `src/solana/index.ts` 当前为空（无可用 API）

---

## 2) 场景 -> 方法（最快定位）

| 你的目标 | 直接使用 | 关键参数 |
|---|---|---|
| 查链基础信息（余额/区块/gas） | `Basic` | `chain`, `rpcOrProvider` |
| ERC20 授权/转账/余额 | `LikeErc20` | `tokenAddress`, `amount`, `spender/recipient` |
| 批量查余额/allowance | `Multicall.batchGet*` | `chain`, `tokenAddress`, 地址数组 |
| 批量转原生币/Token/NFT | `Multisend.batchTransfer*` | 地址+数量数组、可选 `providerOrPrivateKey` |
| Pancake 计算最小可得 + 交换 | `Pancake.getMinOutTokenAmount` + `Pancake.swap` | `inToken/outToken/inAmount/slippage` |
| four.meme 买卖 | `FourMeme.buyToken/sellToken/swap` | `tokenAddress`, 数量, `slippage` |
| four.meme 发币 | `FourMeme.publishToken` | `tokenInfo`, `amount`, 钱包 |
| Flashbots 提交 bundle | `Flashbots.sendBundle` | `txs`, `blockNumber`, 鉴权私钥 |
| Flashbots 模拟 bundle | `Flashbots.callBundle` / `mevSimBundle` | `txs`/`body`, block 参数 |
| Flashbots 私有交易 | `sendPrivateTransaction/sendPrivateRawTransaction` | 已签名 tx 或 tx 参数 |
| Flashbots 退款查询 | `getFeeRefund*` / `getMevRefund*` | 地址、分页 cursor、bundle/block |

---

## 3) 参数约定（通用）

- `providerOrPrivateKey?: EIP1193Provider | string`
  - 传 Provider：使用钱包注入（如浏览器钱包）
  - 传私钥字符串：内部会创建 wallet client
- `CallOverride`
  - 用于附加交易参数（如 `gas`, `maxFeePerGas`, `nonce`, `value`）
- 金额类型
  - 链上金额统一用 `bigint`
- 地址类型
  - 方法签名多数接收 `string`，内部再转 `Address`

---

## 4) 模块速查

## 4.1 Basic（链基础能力）

构造：
```ts
new Basic(chain, rpcOrProvider?)
```

常用方法：
- `getBalance(address)`
- `getBlock()`
- `getBlockNumber()`
- `getChainId()`
- `getGasPrice()`
- `getNonce(address)`
- `getWalletClient(providerOrPrivateKey?)`
- `waitConfirmTransaction(hash, confirmBlockCount?)`

---

## 4.2 LikeErc20（ERC20 快速操作）

构造：
```ts
new LikeErc20(chain, tokenAddress, rpcOrProvider?)
```

读方法：
- `getName()` / `getSymbol()` / `getDecimals()` / `getTotalSupply()`
- `getTokenBalance(address)`
- `getAllowce(address, spender)`

写方法：
- `transfer(recipient, amount, providerOrPrivateKey?, callOverride?)`
- `transferFrom(recipient, amount, providerOrPrivateKey?, callOverride?)`
- `approve(amount, spender, providerOrPrivateKey?, callOverride?)`
- `approvePreCheckAllowance(amount, spender, providerOrPrivateKey?, callOverride?)`

---

## 4.3 Multicall（批量读）

静态方法：
- `Multicall.batchGetBalance(chain, walletAddressList, rpcOrProvider?)`
- `Multicall.batchGetTokenBalance(chain, tokenAddress, walletAddressList, rpcOrProvider?)`
- `Multicall.batchGetAllowance(chain, tokenAddress, spenderAddressList, rpcOrProvider?)`

---

## 4.4 Multisend（批量转账）

构造：
```ts
new Multisend(chain, contractAddress, rpcOrProvider?)
```

方法：
- `batchTransfer([{ address, amount }], providerOrPrivateKey?, callOverride?)`
- `batchTransferToken(tokenAddress, [{ address, amount }], providerOrPrivateKey?, callOverride?)`
- `batchTransferErc721(nftAddress, [{ address, tokenId }], providerOrPrivateKey?, callOverride?)`
- `batchTransferErc1155(nftAddress, [{ address, tokenId, amount }], providerOrPrivateKey?, callOverride?)`

---

## 4.5 Pancake（BSC 上 swap）

构造：
```ts
new Pancake(rpcOrProvider?)
```

常用：
- `approve(tokenAddress, amount, providerOrPrivateKey?, override?)`
- `getPoolData(outToken, inToken)`
- `getMinOutTokenAmount(outToken, inToken, inAmount, slippage)`
- `swap(inToken, outToken, inAmount, slippage, providerOrPrivateKey?, callOverride?)`

说明：
- 自动识别 v2/v3 池子
- `slippage` 传 0~1 之间小数（例如 `0.01` 表示 1%）

---

## 4.6 FourMeme（four.meme）

构造：
```ts
new FourMeme(chain, rpcOrProvider?, proxyUrl?)
// chain 常用：FourMeme.mainnet / FourMeme.testnet
```

常用交易：
- `approve(tokenAddress, amount, providerOrPrivateKey?, override?)`
- `buyToken(tokenAddress, bnbAmount, minTokenAmount, providerOrPrivateKey?, override?)`
- `sellToken(tokenAddress, tokenAmount, minBnbAmount, providerOrPrivateKey?, override?)`
- `swap(inToken, outToken, inAmount, slippage, providerOrPrivateKey?, override?)`
- `getMinOutTokenAmount(tokenAddress, bnbAmount, slippage, tokenDecimals?, tokenData?)`
- `getMinOutBnbAmount(tokenAddress, tokenAmount, slippage, tokenDecimals?, tokenData?)`

发币流程：
1. `login(providerOrPrivateKey?, proxyUrl?)`
2. `preparePublishToken(accessToken, tokenInfo, amount?, proxyUrl?)`
3. `publishToken(tokenInfo, amount?, providerOrPrivateKey?, override?)`

事件监听：
- `onTokenCreate`
- `onLiquidityAdded`
- `onTokenPurchase`
- `onTokenSale`
- `onTradeStop`

---

## 4.7 Flashbots（Bundle / 私有交易 / 退款）

构造：
```ts
new Flashbots({
  relayUrl: Flashbots.relayUrls.mainnet | Flashbots.relayUrls.sepolia,
  authPrivateKey, // 推荐
  // 或 authSigner
})
```

常用：
- 提交 bundle：`sendBundle({ txs, blockNumber, ... })`
- 模拟 bundle：`callBundle({ txs, blockNumber, stateBlockNumber, timestamp? })`
- 取消 bundle：`cancelBundle(replacementUuid)`
- MEV-share：`mevSendBundle(params)` / `mevSimBundle(params)`
- 私有交易：`sendPrivateTransaction(params)` / `sendPrivateRawTransaction(tx, preferences?)`
- 取消私有交易：`cancelPrivateTransaction(txHash)`
- 退款查询：`getFeeRefundTotalsByRecipient`, `getFeeRefundsByRecipient`, `getMevRefundTotalByRecipient` 等

关键参数：
- `txs`: 已签名原始交易数组（`0x...`）
- `blockNumber`: 16 进制区块号字符串（例如 `0x123abc`）
- 鉴权：多数方法要求 `X-Flashbots-Signature`，由 `authPrivateKey/authSigner` 自动生成

---

## 5) 最小可用模板

## 5.1 Pancake 交换
```ts
const pancake = new Pancake(process.env.BSC_RPC);

const { minOutToken } = await pancake.getMinOutTokenAmount(
  outToken,
  inToken,
  1000000000000000000n,
  0.01,
);

await pancake.swap(
  inToken,
  outToken,
  1000000000000000000n,
  0.01,
  process.env.PRIVATE_KEY,
);
```

## 5.2 FourMeme 买入
```ts
const fourMeme = new FourMeme(FourMeme.mainnet, process.env.BSC_RPC);

const minOut = await fourMeme.getMinOutTokenAmount(tokenAddress, 10000000000000000n, 0.02);
await fourMeme.buyToken(tokenAddress, 10000000000000000n, minOut, process.env.PRIVATE_KEY);
```

## 5.3 Flashbots 发送 Bundle
```ts
const fb = new Flashbots({
  relayUrl: Flashbots.relayUrls.sepolia,
  authPrivateKey: process.env.VITE_FLASHBOTS_AUTH_PRIVATE_KEY as `0x${string}`,
});

await fb.sendBundle({
  txs: [signedTx],
  blockNumber: "0x123456",
});
```

---

## 6) AI 调用策略（建议）

- 先按“场景 -> 方法”表选最短路径方法
- 写交易前优先调用报价/模拟方法：
  - DEX 场景先 `getMinOut*`
  - Flashbots 先 `callBundle` / `mevSimBundle`
- 写方法统一返回 `hash + wait()` 风格时，优先提示调用方执行 `await result.wait()`
- 涉及授权时优先走 `approvePreCheckAllowance`，避免重复授权
