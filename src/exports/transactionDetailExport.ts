import {pool} from "../lib/db";
import {queryCirclesGardenRemote} from "../lib/circlesGardenProfiles";
import Web3 from "web3";

export async function trustGraph(address:string) : Promise<string> {
    const client = await pool.connect();

    try {
        const query = `
            select last_change, "user", can_send_to, "limit"
            from crc_current_trust_2 t
            where t."user" = lower($1)
               or t.can_send_to = lower($1);
        `;

        const {rows} = await client.query(query, [address]);

        const addresses: { [x:string]:any } = {};
        const edges: { [user:string]: { can_send_to: string, limit: number } } = {};

        rows.forEach((row: any) => {
            addresses[row.user] = true;
            addresses[row.can_send_to] = true;
            if (row.user === row.can_send_to) {
                return;
            }
            edges[row.user] = {
                can_send_to: row.can_send_to,
                limit: row.limit
            };
        });

        const uniqueAddresses = Object.keys(addresses);
        const profiles = await queryCirclesGardenRemote(uniqueAddresses);

        const web3 = new Web3();

        const nodes:any[] = []
        Object.keys(edges).forEach((user: any) => {
            const can_send_to = edges[user].can_send_to;
            const from = (profiles[user] ? profiles[user].username : user).toString();
            const to = (profiles[can_send_to] ? profiles[can_send_to].username : can_send_to).toString();
            nodes.push(`"${from}" [URL="https://circles.garden/profile/${web3.utils.toChecksumAddress(user)}"];`);
            nodes.push(`"${to}" [URL="https://circles.garden/profile/${web3.utils.toChecksumAddress(can_send_to)}"];`);
        });

        const uniqueNodes = [...new Set(nodes)];

        const dot = `
digraph G {
    rankdir=LR;
    node [shape=box];
    ${uniqueNodes.join("\n")}
    ${Object.keys(edges).map((user: any) => {
            const can_send_to = edges[user].can_send_to;
            const limit = edges[user].limit;
            const from = (profiles[user] ? profiles[user].username : user).toString();
            const to = (profiles[can_send_to] ? profiles[can_send_to].username : can_send_to).toString();
            return `"${from}" -> "${to}" [label="${limit}%"]`;
        }).join("\n")}
}`;
        return dot;

    } finally {
        client.release();
    }
}

export async function transactionDetailGraph(txHash: string, showTc:boolean = true): Promise<string> {
    if ((txHash?.trim() ?? "") == "") {
        return "";
    }
    const client = await pool.connect();

    try {
        const query = `
            select t.hash
                 , t."from"
                 , t."to"
                 , t.value / 1000000000000000000 as crc
                 , (crc_to_tc(extract(epoch from t.timestamp at time zone 'utc'), t.value) / 1000000000000000000)::text as tc
                 , et."from" as step_from
                 , et."to" as step_to
                 , et.value / 1000000000000000000 as step_crc
                 , (crc_to_tc(extract(epoch from t.timestamp at time zone 'utc'), et.value) / 1000000000000000000)::text as step_tc
                 , et.token as step_token
                 , s.user as step_token_owner
            from crc_hub_transfer_2 t
                     join crc_token_transfer_2 et on et.hash = t.hash
                     left join crc_signup_2 s on et.token = s.token
            where t.hash = $1;
        `;

        const {rows} = await client.query(query, [txHash.toLowerCase()]);

        const addresses: { [x:string]:any } = {};
        let fullAmount = "";

        rows.forEach((row: any) => {
            fullAmount = showTc ? row.tc : row.crc;

            addresses[row.from] = true;
            addresses[row.to] = true;
            addresses[row.step_from] = true;
            addresses[row.step_to] = true;
            addresses[row.step_token_owner] = true;
        });

        const uniqueFromAddresses = Object.keys(addresses);
        const profiles = await queryCirclesGardenRemote(uniqueFromAddresses);

        const web3 = new Web3();


        const nodes:any[] = []
        rows.forEach((row: any) => {
            const from = (profiles[row.step_from] ? profiles[row.step_from].username : row.step_from).toString();
            const to = (profiles[row.step_to] ? profiles[row.step_to].username : row.step_to).toString();
            nodes.push(`"${from}" [URL="https://circles.garden/profile/${web3.utils.toChecksumAddress(row.step_from)}"];`);
            nodes.push(`"${to}" [URL="https://circles.garden/profile/${web3.utils.toChecksumAddress(row.step_to)}"];`);
        });

        const uniqueNodes = [...new Set(nodes)];

        const dot = `
digraph G {
    rankdir=LR;
    node [shape=box];
    "Source" -> "Sink" [label="${fullAmount} ${showTc ? "TCRC" : "CRC"}"] ;
    ${uniqueNodes.join("\n")}
    ${rows.map((row: any) => {
        const from = profiles[row.step_from] ? profiles[row.step_from].username : row.step_from;
        const to = profiles[row.step_to] ? profiles[row.step_to].username : row.step_to;
        const tokenOwner = profiles[row.step_token_owner] ? profiles[row.step_token_owner].username : row.step_token_owner;
        return `"${from}" -> "${to}" [label="${showTc ? row.step_tc : row.step_crc}\\n${tokenOwner} ${showTc ? "TCRC" : "CRC"}" labelURL="https://circles.garden/profile/${web3.utils.toChecksumAddress(row.step_token_owner)}"]`;
    }).join("\n")}
}`;
        return dot;

    } finally {
        client.release();
    }
}
