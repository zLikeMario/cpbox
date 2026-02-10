import { describe, test } from "vitest";
import FourMeme from "./index";

const TEST_TOKEN_ADDRESS = import.meta.env.VITE_TEST_TOKEN_ADDRESS;
const RPC = import.meta.env.VITE_BSC_RPC;
const PRIVATE_KEY = import.meta.env.VITE_COMPANY_PRIVATE_KEY;
const fourMeme = new FourMeme(FourMeme.testnet, RPC);

describe("FourMeme", () => {
  test("On New Tokens", async () => {
    const maxWaitMs = 30_000;
    const requiredLogs = 2;

    await new Promise<void>(async (resolve, reject) => {
      let count = 0;
      let finished = false;

      const cleanup = () => {
        if (finished) return;
        finished = true;
        stop?.();
        clearTimeout(timer);
      };

      const stop = await fourMeme.onTokenCreate({
        onCallback: (token) => {
          count += 1;
          console.log(token);
          if (count >= requiredLogs) {
            cleanup();
            resolve();
          }
        },
      });

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Only received ${count} logs within ${maxWaitMs}ms`));
      }, maxWaitMs);
    });
  });
});
