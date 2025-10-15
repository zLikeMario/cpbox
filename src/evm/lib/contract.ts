import {
  getContract,
  type Chain,
  type EIP1193Provider,
  type Address,
  type Abi,
  type WalletClient,
  type Account,
} from "viem";
import Basic from "./basic";
import { Memoize } from "@zlikemario/helper/decorator-old";
import type { CallOverride } from "./type";

abstract class Contract<A extends Abi> extends Basic {
  contractAddress: string;
  abi: A;
  constructor(chain: Chain, contractAddress: string, abi: A, rpcOrProvider?: string | EIP1193Provider) {
    super(chain, rpcOrProvider);
    this.contractAddress = contractAddress;
    this.abi = abi;
  }

  @Memoize()
  get readableContract() {
    return getContract({
      address: this.contractAddress as Address,
      abi: this.abi,
      client: this.publicClient,
    });
  }

  @Memoize()
  get writeableContract() {
    return getContract({
      address: this.contractAddress as Address,
      abi: this.abi,
      client: this.walletClient,
    });
  }

  getWriteableContract(client?: WalletClient) {
    return getContract({
      address: this.contractAddress as Address,
      abi: this.abi,
      client: client ?? this.walletClient,
    });
  }

  formatWriteParams<T extends boolean>(
    providerOrPrivateKey?: EIP1193Provider | string,
    callOverride?: CallOverride<T>
  ) {
    const walletClient = this.getWalletClient(providerOrPrivateKey);
    const writeableContract = this.getWriteableContract(walletClient);
    return {
      walletClient,
      writeableContract,
      override: {
        account: walletClient.account as Account,
        chain: this.walletClient.chain,
        ...callOverride,
      },
    };
  }
}

export default Contract;
