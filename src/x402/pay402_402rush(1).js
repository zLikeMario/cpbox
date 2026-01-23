const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ethers } = require('ethers');
const cfg = require('./config.js');

// 配置（来自 config.js => rush402）
const ENDPOINT_URL = cfg.rush402?.url || 'https://api.402rush.fun/payment?address=0x0b282f1f49a4674769577cd21ed22be29166eb6f';
const PRIVATE_KEY = cfg.rush402?.privateKey || '';

// Base 主网 USDC
const BASE_CHAIN_ID = 8453;
const USDC_ADDRESS_BASE = cfg.rush402?.usdcAddress || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

function deriveResourceFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return `http://${u.host}${u.pathname}`;
  } catch (_) {
    if (typeof urlStr === 'string' && urlStr.length > 0) {
      const httpUrl = urlStr.replace(/^https:/i, 'http:');
      const noQuery = httpUrl.split('#')[0].split('?')[0];
      return noQuery;
    }
    return 'http://api.402rush.fun/payment';
  }
}

const PAYMENT_REQ = {
  scheme: 'exact',
  network: 'base',
  maxAmountRequired: cfg.rush402?.amount || '1000000', // 1 USDC
  resource: deriveResourceFromUrl(ENDPOINT_URL),
  description: '402Rush payment via 402 protocol',
  mimeType: 'application/json',
  payTo: cfg.rush402?.payTo || '0x0b282f1f49a4674769577cd21ed22be29166eb6f',
  maxTimeoutSeconds: Number(cfg.rush402?.maxTimeoutSeconds || 60),
  asset: USDC_ADDRESS_BASE,
  extra: { name: 'USD Coin', version: cfg.rush402?.usdcVersion || '2' }
};

function assertEnv() {
  if (!PRIVATE_KEY) throw new Error('请在 config.js 的 rush402.privateKey 中填写私钥');
}

function createNonce32() {
  const bytes = ethers.utils.randomBytes(32);
  return '0x' + Buffer.from(bytes).toString('hex');
}

async function buildTypedData(walletAddress) {
  const nowSec = Math.floor(Date.now() / 1000);
  const validAfter = ethers.BigNumber.from(nowSec - 5).toString();
  const validBefore = ethers.BigNumber.from(nowSec + PAYMENT_REQ.maxTimeoutSeconds).toString();
  const nonce = createNonce32();

  let domainVersion = PAYMENT_REQ.extra?.version || '2';
  const rpcUrl = cfg.rush402?.baseRpcUrl;
  if (rpcUrl) {
    try {
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      const versionAbi = [{ inputs: [], name: 'version', outputs: [{ internalType: 'string', name: '', type: 'string' }], stateMutability: 'view', type: 'function' }];
      const usdc = new ethers.Contract(USDC_ADDRESS_BASE, versionAbi, provider);
      domainVersion = await usdc.version();
    } catch (_) {}
  }

  const domain = {
    name: PAYMENT_REQ.extra?.name || 'USD Coin',
    version: domainVersion,
    chainId: BASE_CHAIN_ID,
    verifyingContract: PAYMENT_REQ.asset
  };

  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' }
    ]
  };

  const message = {
    from: walletAddress,
    to: PAYMENT_REQ.payTo,
    value: PAYMENT_REQ.maxAmountRequired,
    validAfter,
    validBefore,
    nonce
  };

  return { domain, types, message };
}

function buildPaymentHeader(signature, message) {
  const payload = {
    x402Version: 1,
    scheme: PAYMENT_REQ.scheme,
    network: PAYMENT_REQ.network,
    payload: { signature, authorization: message }
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

async function main() {
  assertEnv();
  const wallet = new ethers.Wallet(PRIVATE_KEY);
  const repeat = cfg.rush402?.repeat || { count: 1, intervalMs: 0, awaitResponseBetweenSends: true, stopOnSuccess: false, waitAllAtEnd: true };

  async function sendOnce(index) {
    const { domain, types, message } = await buildTypedData(wallet.address);
    const signature = await wallet._signTypedData(domain, types, message);
    const header = buildPaymentHeader(signature, message);
    console.log(`[${index}] 已生成 402 支付签名。地址:`, wallet.address);

    const resp = await axios.get(ENDPOINT_URL, {
      headers: {
        'X-PAYMENT': header,
        'Accept': 'application/json, text/plain, */*',
        'Access-Control-Expose-Headers': 'X-PAYMENT-RESPONSE',
        'Referer': 'https://402rush.fun/',
        'Sec-CH-UA': '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
      },
      responseType: 'arraybuffer',
      validateStatus: () => true
    });

    console.log(`[${index}] HTTP 状态:`, resp.status);
    const contentType = resp.headers['content-type'] || '';
    console.log(`[${index}] Content-Type:`, contentType);
    const paymentRespHeader = resp.headers['x-payment-response'];
    if (paymentRespHeader) console.log(`[${index}] X-PAYMENT-RESPONSE:`, paymentRespHeader);

    if (resp.status >= 200 && resp.status < 300) {
      if ((contentType || '').includes('application/json')) {
        try {
          const text = Buffer.from(resp.data).toString('utf8');
          const json = JSON.parse(text);
          const outJson = path.join(__dirname, `402rush_response_${index}.json`);
          fs.writeFileSync(outJson, JSON.stringify(json, null, 2));
          console.log(`[${index}] JSON 已保存:`, outJson);
        } catch (_) {
          const outFile = path.join(__dirname, `402rush_response_${index}.bin`);
          fs.writeFileSync(outFile, resp.data);
          console.log(`[${index}] 响应内容已保存到文件:`, outFile);
        }
      } else {
        const outFile = path.join(__dirname, contentType.includes('text/html') ? `402rush_response_${index}.html` : `402rush_response_${index}.bin`);
        fs.writeFileSync(outFile, resp.data);
        console.log(`[${index}] 响应内容已保存到文件:`, outFile);
      }
      return { ok: true };
    } else {
      console.error(`[${index}] 请求失败，预览(base64前256字节):`, Buffer.from(resp.data || '').toString('base64').slice(0, 256));
      return { ok: false };
    }
  }

  if (repeat.awaitResponseBetweenSends) {
    for (let i = 0; i < Number(repeat.count || 1); i++) {
      const res = await sendOnce(i);
      if (res.ok && repeat.stopOnSuccess) {
        console.log(`[${i}] 成功，按配置 stopOnSuccess=true，停止后续请求。`);
        break;
      }
      if (i < Number(repeat.count || 1) - 1 && Number(repeat.intervalMs || 0) > 0) {
        await new Promise((r) => setTimeout(r, Number(repeat.intervalMs)));
      }
    }
  } else {
    const tasks = [];
    for (let i = 0; i < Number(repeat.count || 1); i++) {
      const task = (async (idx) => {
        if (idx > 0 && Number(repeat.intervalMs || 0) > 0) {
          await new Promise((r) => setTimeout(r, Number(repeat.intervalMs) * idx));
        }
        return sendOnce(idx);
      })(i);
      tasks.push(task);
    }
    if (repeat.waitAllAtEnd) {
      await Promise.allSettled(tasks);
    }
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main };


