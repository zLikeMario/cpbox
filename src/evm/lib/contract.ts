import {
  getContract,
  type Chain,
  type EIP1193Provider,
  type Address,
  type Abi,
  type WalletClient,
  type Account,
  type Transport,
  type PrivateKeyAccount,
  type GetContractReturnType,
} from "viem";
import Basic from "./basic";
import { Memoize } from "@zlikemario/helper/decorator-old";
import type { CallOverride } from "./type";

class Contract<A extends Abi> extends Basic {
  readonly contractAddress: string;
  readonly abi: A;
  constructor(chain: Chain, contractAddress: string, abi: A, rpcOrProvider?: string | EIP1193Provider) {
    super(chain, rpcOrProvider);
    this.contractAddress = contractAddress;
    this.abi = abi;
  }

  @Memoize()
  get wsContract(): GetContractReturnType<A, Contract<A>["publicClient"]> {
    return getContract({
      address: this.contractAddress as Address,
      abi: this.abi,
      client: this.wsClient,
    });
  }

  @Memoize()
  get readableContract(): GetContractReturnType<A, Contract<A>["publicClient"]> {
    return getContract({
      address: this.contractAddress as Address,
      abi: this.abi,
      client: this.publicClient,
    });
  }

  @Memoize()
  get writeableContract(): GetContractReturnType<A, Contract<A>["walletClient"]> {
    return getContract({
      address: this.contractAddress as Address,
      abi: this.abi,
      client: this.walletClient,
    });
  }

  getWriteableContract(
    client?: WalletClient<Transport, Chain, PrivateKeyAccount>,
  ): GetContractReturnType<A, Contract<A>["walletClient"]> {
    return getContract({
      address: this.contractAddress as Address,
      abi: this.abi,
      client: client ?? this.walletClient,
    });
  }

  formatWriteParams<T extends boolean>(
    providerOrPrivateKey?: EIP1193Provider | string,
    callOverride?: CallOverride<T>,
  ): {
    walletClient: ReturnType<Contract<A>["getWalletClient"]>;
    writeableContract: ReturnType<Contract<A>["getWriteableContract"]>;
    override: { account: Account; chain: Chain } & CallOverride<T>;
  } {
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
