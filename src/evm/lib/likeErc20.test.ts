import { describe, test, expect } from "vitest";
import LikeErc20 from "./likeErc20";
import { sepolia } from "viem/chains";
import { sleep } from "@zlikemario/helper/utils";

// Optional for write tests
const PRIVATE_KEY = import.meta.env.VITE_SEPOLIA_PRIVATE_KEY;
const ADDRESS = "0x53B8a6d4eE550566BCd7a1a7AD64931Cb6c6304B"; // PRIVATE_KEY's address
const TEST_TOKEN = "0x6B7C2FcEde4015Ae7361311a90a0a831B26c63a8"; // token to query on sepolia
const SPENDER = "0x53B8a6d4eE550566BCd7a1a7AD64931Cb6c6304B"; // PRIVATE_KEY's address

describe("LikeErc20 (network, conditional)", () => {
  if (!TEST_TOKEN) {
    test("skip likeErc20 network tests when SEPOLIA_RPC or TEST_TOKEN_ADDRESS not provided", () => {
      console.warn("SEPOLIA_RPC or TEST_TOKEN_ADDRESS not provided — skipping LikeErc20 tests");
    });
    return;
  }

  const token = new LikeErc20(sepolia, TEST_TOKEN);

  test("getName/getSymbol/getDecimals/getTotalSupply should return expected types", async () => {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      token.getName(),
      token.getSymbol(),
      token.getDecimals(),
      token.getTotalSupply(),
    ]);
    expect(name).toBe("LZD");
    expect(symbol).toBe("ZhenDong");
    expect(decimals).toBe(18);
    // totalSupply may be bigint
    expect(totalSupply).toBe(1000000n * 10n ** 18n);
  });

  // Optional: run a permissive approve test only if PRIVATE_KEY and SPENDER provided
  if (PRIVATE_KEY && SPENDER) {
    const amount = 1n;
    test("approve should return write result shape (hash & wait)", async () => {
      // This is a live chain write - ensure you understand implications and costs
      // Use a provider containing the private key via viem wallet client env or provider implementation
      // LikeErc20 expects an EIP1193 provider; we keep this test as a placeholder to run manually if configured
      const result = await token.approve(amount, SPENDER, PRIVATE_KEY, undefined);
      // await result.wait(); // need rpc supported
      expect(result).toHaveProperty("hash");
      expect(typeof result.wait === "function").toBeTruthy();
    }, 15000);

    test("getAllowce should return fixed amount", async () => {
      await sleep(3000); // rpc unwait
      const allow = await token.getAllowce(ADDRESS, SPENDER);
      expect(allow).toBe(amount);
    });
  } else {
    test("skip approve live test (PRIVATE_KEY or SPENDER missing)", () => {
      console.warn("PRIVATE_KEY or TEST_SPENDER_ADDRESS not provided — skipping approve test");
    });
  }
});
