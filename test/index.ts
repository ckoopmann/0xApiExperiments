import { expect } from "chai";
import { ethers } from "hardhat";
import { getMainnetSdk } from "@dethcrypto/eth-sdk-client";
import axios from "axios";
import qs from "qs";

const API_QUOTE_URL = "https://api.0x.org/swap/v1/quote";
async function getQuote(params: any) {
  const response = await axios(
    `https://api.0x.org/swap/v1/quote?${qs.stringify(params)}`
  );
  return response.data;
}

describe("0xAPI", function () {
  it("Execute swap directly", async function () {
    const sellAmount = ethers.utils.parseEther("1.0");
    const params = {
      buyToken: "DAI",
      sellToken: "WETH",
      sellAmount: sellAmount.toString(),
    };
    const quote = await getQuote(params);

    const [taker] = await ethers.getSigners();
    const sdk = getMainnetSdk(taker);
    const transactionRequest = {
      to: quote.to,
      data: quote.data,
    };
    console.log("Querying weth balance");
    const wethBalanceBefore = await sdk.tokens.weth.balanceOf(taker.address);
    console.log("Weth balance before mint", wethBalanceBefore.toString());
    await sdk.tokens.weth.deposit({ value: sellAmount });
    const wethBalanceAfter = await sdk.tokens.weth.balanceOf(taker.address);
    console.log("Weth balance after mint", wethBalanceAfter.toString());

    console.log("Approving WETH to ", quote.allowanceTarget);
    await sdk.tokens.weth.approve(quote.allowanceTarget, sellAmount);

    console.log("Fill Order");
    const tx = await taker.sendTransaction(transactionRequest);
    console.log("Transaction", tx);
    const receipt = await tx.wait();
    console.log("Transaction receipt", receipt);
  });

  it("Swap from contract", async function () {
    const [owner] = await ethers.getSigners();
    const sdk = getMainnetSdk(owner);
    const contractFactory = await ethers.getContractFactory("SimpleTokenSwap");
    const contract = await contractFactory.deploy(sdk.tokens.weth.address);

    // Convert sellAmount from token units to wei.
    const sellAmount = "1.0";
    const sellAmountWei = ethers.utils.parseEther(sellAmount);

    // Deposit some WETH into the contract. This function accepts ETH and
    // wraps it to WETH on the fly.
    console.info(`Depositing ${sellAmount} ETH (WETH) into the contract`);
    const depositTx = await contract.depositETH({
      value: sellAmountWei,
    });
    await depositTx.wait();

    // Get a quote from 0x-API to sell the WETH we just deposited into the contract.
    console.info(
      `Fetching swap quote from 0x-API to sell ${sellAmount} WETH for DAI...`
    );
    const quote = await getQuote({
      sellToken: "WETH",
      buyToken: "DAI",
      sellAmount: sellAmountWei.toString(),
    });
    console.info(`Received a quote with price ${quote.price}`);

    // Have the contract fill the quote, selling its own WETH.
    console.info(
      `Filling the quote through the contract at ${contract.address.bold}...`
    );
    const fillQuoteTx = await contract.fillQuote(
      quote.sellTokenAddress,
      quote.buyTokenAddress,
      quote.allowanceTarget,
      quote.to,
      quote.data,
      {
        value: quote.value,
        gasPrice: quote.gasPrice,
      }
    );
    const receipt = await fillQuoteTx.wait();

    console.info(
      `${"✔".bold} Successfully sold ${
        sellAmount.toString().bold
      } WETH for DAI!`,
      receipt
    );
    // The contract now has `boughtAmount` of DAI!
  });
});
