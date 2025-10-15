import { describe, test, expect } from "vitest";
import Multicall from "./multicall";
import { sepolia } from "viem/chains";

const TEST_TOKEN = "0x6B7C2FcEde4015Ae7361311a90a0a831B26c63a8";

describe("Multicall (network, conditional)", () => {
  test("batchGetBalance returns an array matching addresses", async () => {
    const addrs = ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000001"];
    const res = await Multicall.batchGetBalance(sepolia, addrs);
    expect(Array.isArray(res)).toBeTruthy();
    expect(res.length).toBe(addrs.length);
  });

  test("batchGetTokenBalance returns balances for token when TEST_TOKEN provided", async () => {
    if (!TEST_TOKEN) {
      console.warn("TEST_TOKEN_ADDRESS not provided — skipping token balance test");
      return;
    }
    const addrs = ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000001"];
    const res = await Multicall.batchGetTokenBalance(sepolia, TEST_TOKEN, addrs);
    expect(Array.isArray(res)).toBeTruthy();
    expect(res.length).toBe(addrs.length);
  });

  test("batchGetAllowance returns allowances for token when TEST_TOKEN provided", async () => {
    if (!TEST_TOKEN) {
      console.warn("TEST_TOKEN_ADDRESS not provided — skipping allowance test");
      return;
    }
    const addrs = ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000001"];
    const res = await Multicall.batchGetAllowance(sepolia, TEST_TOKEN, addrs);
    expect(Array.isArray(res)).toBeTruthy();
    expect(res.length).toBe(addrs.length);
  });
});
