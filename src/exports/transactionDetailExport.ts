import {pool} from "../lib/db";
import {queryCirclesGardenRemote} from "../lib/circlesGardenProfiles";

export async function generateGraphFromTx(txHash: string, showTc:boolean = true): Promise<string> {
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

        // Load the circles garden profiles for all addresses from remote
        const uniqueFromAddresses = Object.keys(addresses);
        const profiles = await queryCirclesGardenRemote(uniqueFromAddresses);

        // Generate a graphviz dot file from the single steps
        const dot = `
digraph G {
    rankdir=LR;
    node [shape=box];
    "Source" -> "Sink" [label="${fullAmount} ${showTc ? "TCRC" : "CRC"}"] ;
    ${rows.map((row: any) => {
        const from = profiles[row.step_from] ? profiles[row.step_from].username : row.step_from;
        const to = profiles[row.step_to] ? profiles[row.step_to].username : row.step_to;
        const tokenOwner = profiles[row.step_token_owner] ? profiles[row.step_token_owner].username : row.step_token_owner;
        return `"${from}" -> "${to}" [label="${showTc ? row.step_tc : row.step_crc}\\n${tokenOwner} ${showTc ? "TCRC" : "CRC"}"]`;
    }).join("\n")}
}`;

        return dot;

    } finally {
        client.release();
    }
}
