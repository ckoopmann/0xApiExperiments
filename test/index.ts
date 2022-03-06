import { expect } from "chai";
import { ethers } from "hardhat";
import { getMainnetSdk } from "@dethcrypto/eth-sdk-client";
import { getQuote, logQuote, obtainAndApproveBuyToken } from "./utils";

describe("0xAPI", function () {
    it("Execute swap directly", async function () {
        // Choose very large buy amount to force MultiHop
        const buyAmount = ethers.utils.parseEther("100");
        const sushiTokenAddress = "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2";
        const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
        // In case this is set to zero the multihop trade usually fails instead of underbuying
        const slippagePercentage = 0.05;
        const params = {
            buyToken: sushiTokenAddress,
            sellToken: daiAddress,
            buyAmount: buyAmount.toString(),
            slippagePercentage,
        };
        const quote = await getQuote(params);
        await logQuote(quote);

        const [taker] = await ethers.getSigners();
        const sdk = getMainnetSdk(taker);

        const transactionRequest = {
            to: quote.to,
            data: quote.data,
        };

        await obtainAndApproveBuyToken(sdk.tokens.dai, taker);

        console.log("Approving DAI to ", quote.allowanceTarget);
        await sdk.tokens.dai.approve(
            quote.allowanceTarget,
            ethers.constants.MaxUint256
        );

        const sushiToken = sdk.tokens.dai.attach(sushiTokenAddress);
        const sushiTokenBalanceBefore = await sushiToken.balanceOf(
            taker.address
        );

        console.log(
            "Sushi balance before: ",
            ethers.utils.formatEther(sushiTokenBalanceBefore)
        );

        console.log("\n\n###################EXECUTE SWAP##################");
        // Execute the transaction returned by the 0x API
        const tx = await taker.sendTransaction(transactionRequest);
        const receipt = await tx.wait();

        const sushiTokenBalanceAfter = await sushiToken.balanceOf(
            taker.address
        );
        const sushiTokensObtained = sushiTokenBalanceAfter.sub(
            sushiTokenBalanceBefore
        );
        console.log(
            "Sushi tokens obtained: ",
            ethers.utils.formatEther(sushiTokensObtained)
        );
        console.log("Buy Amount", ethers.utils.formatEther(buyAmount));
        const relDiff =
            ((100 * parseFloat(ethers.utils.formatEther(sushiTokensObtained))) /
            parseFloat(ethers.utils.formatEther(buyAmount))) - 100;
        console.log("Relative Difference in %: ", relDiff);
        console.log("Slippage percentage:", slippagePercentage * 100);
    });
});
