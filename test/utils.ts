import hre, { ethers } from "hardhat";
import axios from "axios";
import qs from "qs";

const API_QUOTE_URL = "https://api.0x.org/swap/v1/quote";
export async function getQuote(params: any) {
    console.log(
        "\n\n###################GET QUOTE FROM 0xAPI##################"
    );
    const url = `${API_QUOTE_URL}?${qs.stringify(params)}`;
    console.log(`Getting quote from ${params.sellToken} to ${params.buyToken}`);
    console.log("Sending quote request to:", url);
    const response = await axios(url);
    return response.data;
}

export async function logQuote(quote: any) {
    console.log("Sell Amount:", quote.sellAmount);
    console.log("Buy Amount:", quote.buyAmount);
    console.log("Swap Target:", quote.to);
    console.log("Allowance Target:", quote.allowanceTarget);
    console.log(
        "Sources:",
        quote.sources.filter((source: any) => source.proportion > "0")
    );
    try {
        await decodeCallData(quote.data, quote.to);
    } catch (e) {
        console.log("Error decoding call data:", e);
    }
}

export async function decodeCallData(callData: string, proxyAddress: string) {
    console.log("Decoding call data:", callData, proxyAddress);
    const API_KEY = "YOUR_ETHERSCAN_API_KEY";
    const ABI_ENDPOINT = `https://api.etherscan.io/api?module=contract&action=getabi&apikey=${API_KEY}&address=`;
    const proxyAbi = await axios
        .get(ABI_ENDPOINT + proxyAddress)
        .then((response) => {
            if(response.data.message == "NOTOK"){
                console.log("Etherscan response getting abi:", response.data);
                throw new Error("Etherscan error when getting abi");
            }
            return JSON.parse(response.data.result)
        });
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
    console.log(
        "Args: ",
        decodedTransaction.args.map((arg: any) => arg.toString())
    );
}

export async function obtainAndApproveBuyToken(buyToken: any, userSigner: any) {
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
            "New DAI balance",
            ethers.utils.formatEther(
                await buyToken.balanceOf(userSigner.address)
            )
        );
    }
}
