import { describe, expect, test } from "vitest";
import { createPublicClient, http, parseEther, type Hex, zeroAddress } from "viem";
import { sepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import Flashbots from "./index";

const SEPOLIA_RPC = import.meta.env.VITE_SEPOLIA_RPC;
const FLASHBOTS_AUTH_PRIVATE_KEY = import.meta.env.VITE_FLASHBOTS_AUTH_PRIVATE_KEY as Hex;
const FLASHBOTS_TX_PRIVATE_KEY = import.meta.env.VITE_FLASHBOTS_TX_PRIVATE_KEY as Hex;

const hasRequiredEnv = Boolean(FLASHBOTS_AUTH_PRIVATE_KEY && FLASHBOTS_TX_PRIVATE_KEY);

describe("Flashbots Sepolia", () => {
  test.skipIf(!hasRequiredEnv)("sendBundle should submit signed tx bundle to sepolia relay", async () => {
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(SEPOLIA_RPC),
    });

    const latestBlock = await publicClient.getBlockNumber();
    const targetBlock = `0x${(latestBlock + 1n).toString(16)}`;
    const txAccount = privateKeyToAccount(FLASHBOTS_TX_PRIVATE_KEY);
    const nonce = await publicClient.getTransactionCount({ address: txAccount.address });
    const gasPrice = await publicClient.getGasPrice();
    const signedTx = await txAccount.signTransaction({
      chainId: sepolia.id,
      to: zeroAddress,
      value: parseEther("0.00000000000001"),
      gas: 21_000n,
      nonce,
      gasPrice,
    });

    const flashbots = new Flashbots({
      relayUrl: Flashbots.relayUrls.sepolia,
      authPrivateKey: FLASHBOTS_AUTH_PRIVATE_KEY,
    });

    const result = await flashbots.sendBundle({
      txs: [signedTx],
      blockNumber: targetBlock,
    });

    expect(result.bundleHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });
});
