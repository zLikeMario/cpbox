import * as chains from "viem/chains";
export * from "./lib";
export * from "./features";

export const lookForChain = (chainId: number): chains.Chain | undefined => {
  return Object.values(chains).find((c) => c.id === chainId);
};
