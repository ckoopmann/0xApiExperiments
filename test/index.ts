import { expect } from "chai";
import { ethers } from "hardhat";
import { getMainnetSdk } from "@dethcrypto/eth-sdk-client";
import axios from "axios";
import qs from "qs";

describe("0xAPI", function () {
  it("Can execute transaction", async function () {
    const sellAmount = ethers.utils.parseEther("1.0");
    const params = {
      buyToken: "DAI",
      sellToken: "WETH",
      sellAmount: sellAmount.toString(),
    };
    const response = await axios(
      `https://api.0x.org/swap/v1/quote?${qs.stringify(params)}`
    );
    const quote = response.data;
    console.log(response.data);

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
    console.log("Transaction receipt", tx);
  });
});
