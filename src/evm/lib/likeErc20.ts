import { type Address, type EIP1193Provider, type Chain, erc20Abi } from "viem";
import Contract from "./contract";
import { Memoize } from "@zlikemario/helper/decorator-old";
import { type CallOverride } from "./type";

class LikeErc20 extends Contract<typeof erc20Abi> {
  public tokenAddress: string;
  constructor(chain: Chain, tokenAddress: string, rpcOrProvider?: string | EIP1193Provider) {
    super(chain, tokenAddress, erc20Abi, rpcOrProvider);
    this.tokenAddress = tokenAddress;
  }

  @Memoize(0, Symbol("name"))
  async getName() {
    return await this.readableContract.read.name();
  }

  @Memoize(0, Symbol("symbol"))
  async getSymbol() {
    return await this.readableContract.read.symbol();
  }

  @Memoize(0, Symbol("decimals"))
  async getDecimals() {
    return await this.readableContract.read.decimals();
  }

  @Memoize(0, Symbol("totalSupply"))
  async getTotalSupply() {
    return await this.readableContract.read.totalSupply();
  }

  async getTokenBalance(address: string) {
    return await this.readableContract.read.balanceOf([address as Address]);
  }

  async getAllowce(address: string, spender: string) {
    return await this.readableContract.read.allowance([address as Address, spender as Address]);
  }

  async transfer(
    recipient: string,
    amount: bigint,
    providerOrPrivateKey?: EIP1193Provider | string,
    callOverride?: CallOverride
  ) {
    const { writeableContract, override } = await this.formatWriteParams(providerOrPrivateKey, callOverride);
    const hash = await writeableContract.write.transfer([recipient as Address, amount], override);
    return this.wrapWriteContractReturn(hash);
  }

  async transferFrom(
    recipient: string,
    amount: bigint,
    providerOrPrivateKey?: EIP1193Provider | string,
    callOverride?: CallOverride
  ) {
    const { walletClient, writeableContract, override } = await this.formatWriteParams(
      providerOrPrivateKey,
      callOverride
    );
    const [address] = await walletClient.getAddresses();
    const hash = await writeableContract.write.transferFrom([address, recipient as Address, amount], override);
    return this.wrapWriteContractReturn(hash);
  }

  async approve(
    amount: bigint,
    spender: string,
    providerOrPrivateKey?: EIP1193Provider | string,
    callOverride?: CallOverride
  ) {
    const { writeableContract, override } = await this.formatWriteParams(providerOrPrivateKey, callOverride);
    const hash = await writeableContract.write.approve([spender as Address, amount], override);
    return this.wrapWriteContractReturn(hash);
  }

  async approvePreCheckAllowance(
    amount: bigint,
    spender: string,
    providerOrPrivateKey?: EIP1193Provider | string,
    override?: CallOverride
  ) {
    const walletClient = this.getWalletClient(providerOrPrivateKey);
    const [address] = await walletClient.getAddresses();
    const allowance = await this.getAllowce(address, spender);
    if (allowance >= amount) return;
    return await this.approve(amount, spender, providerOrPrivateKey, override);
  }
}

export default LikeErc20;
