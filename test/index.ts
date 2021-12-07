import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { getMainnetSdk } from "@dethcrypto/eth-sdk-client";
import axios from "axios";
import qs from "qs";

const API_QUOTE_URL = "https://api.0x.org/swap/v1/quote";

async function getQuote(params: any) {
    const url = `${API_QUOTE_URL}?${qs.stringify(params)}`;
    console.log(`Getting quote from ${params.sellToken} to ${params.buyToken}`);
    console.log("Sending quote request to:", url);
    const response = await axios(url);
    return response.data;
}

async function logQuote(quote: any) {
    console.log("Sell Amount:", quote.sellAmount);
    console.log("Buy Amount:", quote.buyAmount);
    console.log("Swap Target:", quote.to);
    console.log("Allowance Target:", quote.allowanceTarget);
    console.log(
        "Sources:",
        quote.sources.filter((source: any) => source.proportion > "0")
    );
    await decodeCallData(quote.data, quote.to);
}

async function decodeCallData(callData: string, proxyAddress: string) {
    const API_KEY = "X28YB9Z9TQD4KSSC6A6QTKHYGPYGIP8D7I";
    const ABI_ENDPOINT = `https://api.etherscan.io/api?module=contract&action=getabi&apikey=${API_KEY}&address=`;
    const proxyAbi = await axios
        .get(ABI_ENDPOINT + proxyAddress)
        .then((response) => JSON.parse(response.data.result));
    const proxyContract = await ethers.getContractAt(proxyAbi, proxyAddress);
    await proxyContract.deployed();
    const implementation = await proxyContract.getFunctionImplementation(
        callData.slice(0, 10)
    );
    console.log("Implementation Address: ", implementation);
    const abiResponse = await axios.get(ABI_ENDPOINT + implementation);
    const abi = JSON.parse(abiResponse.data.result);
    const iface = new ethers.utils.Interface(abi);
    const decodedTransaction = iface.parseTransaction({
        data: callData,
    });
    console.log("Called Function Signature: ", decodedTransaction.signature);
}

async function obtainAndApproveBuyToken(buyToken: any, userSigner: any) {
    // Obtaining the input token by taking it from a large holder introduces an external dependency
    // .i.e. the tests will fail if this address does not have enough input token (DAI) anymore
    // TODO: Review if this needs changing.
    const inputTokenWhaleAddress = "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503";
    const whaleTokenBalance = await buyToken.balanceOf(inputTokenWhaleAddress);

    if (whaleTokenBalance.gt(0)) {
        console.log(
            "\n\n###################OBTAIN INPUT TOKEN FROM WHALE##################"
        );
        await userSigner.sendTransaction({
            to: inputTokenWhaleAddress,
            value: ethers.utils.parseEther("2.0"),
        });
        console.log("Sent ether to whale");
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [inputTokenWhaleAddress],
        });
        console.log("Impersonated whale");
        const inputTokenWhaleSigner = ethers.provider.getSigner(
            inputTokenWhaleAddress
        );
        await buyToken
            .connect(inputTokenWhaleSigner)
            .transfer(userSigner.address, whaleTokenBalance);
        console.log(
            "New user balance",
            ethers.utils.formatEther(
                await buyToken.balanceOf(userSigner.address)
            )
        );
    }
}

describe("0xAPI", function () {
    it("Execute swap directly", async function () {
        const buyAmount = ethers.utils.parseEther("100000");
        const sushiTokenAddress = "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2";
        const daiAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
        const slippagePercentage = 0.1;
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

        console.log("Fill Order");
        const sushiToken = sdk.tokens.dai.attach(sushiTokenAddress);
        const sushiTokenBalanceBefore = await sushiToken.balanceOf(
            taker.address
        );
        console.log("Sushi balance before: ", ethers.utils.formatEther(sushiTokenBalanceBefore))
        const tx = await taker.sendTransaction(transactionRequest);
        const receipt = await tx.wait();
        const sushiTokenBalanceAfter = await sushiToken.balanceOf(
            taker.address
        );
        console.log("Sushi balance after: ", ethers.utils.formatEther(sushiTokenBalanceAfter))
        console.log("Buy Amount", ethers.utils.formatEther(buyAmount))
        const expectedMinBalance = sushiTokenBalanceBefore.add(buyAmount);
        console.log("Expected min balance", ethers.utils.formatEther(expectedMinBalance))
        expect(
            sushiTokenBalanceAfter.gte(expectedMinBalance)
        ).to.equal(true);
    });
});
