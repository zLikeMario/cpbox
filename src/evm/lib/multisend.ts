import type { Address, Chain, EIP1193Provider } from "viem";
import multisend from "../abi/multisend";
import Contract from "./contract";
import type { CallOverride } from "./type";

const wrapTransferParams = (addressAndAmounts: { address: string; amount: bigint }[]) => {
  const addresses = [] as Address[];
  const amounts = [] as bigint[];
  let totalAmount = 0n;
  addressAndAmounts.forEach(({ address, amount }) => {
    addresses.push(address as Address);
    amounts.push(amount);
    totalAmount += amount;
  });
  return { addresses, amounts, totalAmount };
};

class Multisend extends Contract<typeof multisend> {
  constructor(chain: Chain, contractAddress: string, rpcOrProvider?: string | EIP1193Provider) {
    super(chain, contractAddress, multisend, rpcOrProvider);
  }

  async batchTransfer(
    addressAndAmounts: { address: string; amount: bigint }[],
    providerOrPrivateKey?: EIP1193Provider | string,
    callOverride?: CallOverride<true>
  ) {
    const { writeableContract, override } = await this.formatWriteParams(providerOrPrivateKey, callOverride);
    const { addresses, amounts, totalAmount } = wrapTransferParams(addressAndAmounts);
    const hash = await writeableContract.write.multiTransferETH([addresses, amounts], {
      value: totalAmount,
      ...override,
    });
    return this.wrapWriteContractReturn(hash);
  }

  async batchTransferToken(
    tokenAddress: string,
    addressAndAmounts: { address: string; amount: bigint }[],
    providerOrPrivateKey?: EIP1193Provider | string,
    callOverride?: CallOverride<true>
  ) {
    const { writeableContract, override } = await this.formatWriteParams(providerOrPrivateKey, callOverride);
    const { addresses, amounts } = wrapTransferParams(addressAndAmounts);
    const hash = await writeableContract.write.multiTransferToken(
      [tokenAddress as Address, addresses, amounts],
      override
    );
    return this.wrapWriteContractReturn(hash);
  }

  async batchTransferErc721(
    nftAddress: string,
    addressAndTokenIds: { address: string; tokenId: number }[],
    providerOrPrivateKey?: EIP1193Provider | string,
    callOverride?: CallOverride<true>
  ) {
    const addresses = [] as Address[];
    const tokenIds = [] as bigint[];
    addressAndTokenIds.forEach(({ address, tokenId }) => {
      addresses.push(address as Address);
      tokenIds.push(BigInt(tokenId));
    });
    const { writeableContract, override } = await this.formatWriteParams(providerOrPrivateKey, callOverride);
    const hash = await writeableContract.write.multiTransferERC721NFT(
      [nftAddress as Address, addresses, tokenIds],
      override
    );
    return this.wrapWriteContractReturn(hash);
  }

  async batchTransferErc1155(
    nftAddress: string,
    addressTokenIdAmounts: { address: string; tokenId: number; amount: bigint }[],
    providerOrPrivateKey?: EIP1193Provider | string,
    callOverride?: CallOverride<true>
  ) {
    const addresses = [] as Address[];
    const tokenIds = [] as bigint[];
    const amounts = [] as bigint[];
    addressTokenIdAmounts.forEach(({ address, tokenId, amount }) => {
      addresses.push(address as Address);
      tokenIds.push(BigInt(tokenId));
      amounts.push(amount);
    });
    const { writeableContract, override } = await this.formatWriteParams(providerOrPrivateKey, callOverride);
    const hash = await writeableContract.write.multiTransferERC1155NFT(
      [nftAddress as Address, addresses, tokenIds, amounts],
      override
    );
    return this.wrapWriteContractReturn(hash);
  }
}

export default Multisend;
