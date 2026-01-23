import { erc20Abi, type Address, type Chain, type EIP1193Provider } from "viem";
import multicall from "../abi/multicall";
import Basic from "./basic";

class Multicall {
  static async batchGetBalance(chain: Chain, walletAddressList: string[], rpcOrProvider?: string | EIP1193Provider) {
    const contract = new Basic(chain, rpcOrProvider);
    return await contract.publicClient.multicall({
      contracts: walletAddressList.map((address) => ({
        address: "0xca11bde05977b3631167028862be2a173976ca11" as Address,
        abi: multicall,
        functionName: "getEthBalance",
        args: [address],
      })),
    });
  }

  static async batchGetTokenBalance(
    chain: Chain,
    tokenAddress: string,
    walletAddressList: string[],
    rpcOrProvider?: string | EIP1193Provider,
  ) {
    const contract = new Basic(chain, rpcOrProvider);
    return await contract.publicClient.multicall({
      contracts: walletAddressList.map((address) => ({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      })),
    });
  }

  static async batchGetAllowance(
    chain: Chain,
    tokenAddress: string,
    spenderAddressList: string[],
    rpcOrProvider?: string | EIP1193Provider,
  ) {
    const contract = new Basic(chain, rpcOrProvider);
    return await contract.publicClient.multicall({
      contracts: spenderAddressList.map((address) => ({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [contract.walletClient.account.address, address],
      })),
    });
  }
}

export default Multicall;
