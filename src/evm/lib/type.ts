import type { TransactionRequestGeneric } from "viem";

export type CallOverride<Payable extends boolean = false> = Omit<
  TransactionRequestGeneric<Payable extends true ? bigint : undefined>,
  "type" | "blobs" | "blobVersionedHashes" | "maxFeePerBlobGas" | "gasPrice"
>;
