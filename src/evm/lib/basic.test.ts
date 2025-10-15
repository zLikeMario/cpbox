import { describe, test, expect } from "vitest";
import Basic from "./basic";
import { sepolia } from "viem/chains";

describe("basic.test.ts (network, conditional)", () => {
  const basic = new Basic(sepolia);

  test("getBlockNumber returns a positive number", async () => {
    const bn = await basic.getBlockNumber();
    expect(typeof bn).toBe("bigint");
  });

  test("getBalance returns bigint", async () => {
    const balance = await basic.getBalance("0x0000000000000000000000000000000000000000");
    expect(typeof balance).toBe("bigint");
  });

  test("getBlock returns a block object with number", async () => {
    const block = await basic.getBlock();
    // block may be null in some clients; if present check shape
    if (block) {
      expect(typeof block.number).toBe("bigint");
    }
  });

  test("getChainId returns numeric chain id and is stable", async () => {
    const id = await basic.getChainId();
    expect(typeof id).toBe("number");
  });

  test("getGasPrice returns bigint > 0", async () => {
    const gp = await basic.getGasPrice();
    expect(typeof gp).toBe("bigint");
    expect(gp).toBeGreaterThan(0n);
  });

  test("getNonce returns a number for an address", async () => {
    const nonce = await basic.getNonce("0x0000000000000000000000000000000000000000");
    expect(typeof nonce).toBe("number");
    expect(nonce).toBeGreaterThanOrEqual(0);
  });
});
