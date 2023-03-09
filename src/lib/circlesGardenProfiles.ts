import Web3 from "web3";
import {Profile, SafeProfileMap} from "./types";
import fetch from "cross-fetch";

export async function queryCirclesGardenRemote(
    safeAddresses: string[]
): Promise<SafeProfileMap> {
    // Batch all safeAddresses (max. 50)

    const safeAddressCopy = JSON.parse(JSON.stringify(safeAddresses));
    const batches: string[][] = [];

    while (safeAddressCopy.length) {
        batches.push(safeAddressCopy.splice(0, 50));
    }

    const safeProfileMap: SafeProfileMap = {};

    if (batches.length == 0) {
        return safeProfileMap;
    }

    const web3 = new Web3();

    for (let batch of batches) {
        const query = batch.reduce(
            (p, c) =>
                p + `address[]=${web3.utils.toChecksumAddress(c)}&`,
            ""
        );
        const requestUrl = `https://api.circles.garden/api/users/?${query}`;

        const requestResult = await fetch(requestUrl);
        const requestResultJson = await requestResult.json();

        const profiles: (Profile & { emailAddressVerified: boolean })[] =
            requestResultJson.data.map((o: any) => {
                return {
                    username: o.username,
                    address: o.safeAddress.toLowerCase(),
                    avatarUrl: o.avatarUrl
                };
            }) ?? [];

        profiles.forEach((o) => {
            if (!o.address) return;
            safeProfileMap[o.address] = o;
        }, safeProfileMap);
    }

    return safeProfileMap;
}
