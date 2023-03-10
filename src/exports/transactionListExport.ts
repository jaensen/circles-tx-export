import {Transaction} from "../lib/types";
import {queryCirclesGardenRemote} from "../lib/circlesGardenProfiles";
import {pool} from "../lib/db";

async function findUniqueFromAddresses(recipientAddress: string): Promise<string[]> {
    const client = await pool.connect();

    try {
        const query = `
            with tx as (select t.timestamp
                             , t.from
                             , t.to
                             , t.value / 1000000000000000000 as crc
                             , crc_to_tc(extract(epoch from t.timestamp at time zone 'utc'), t.value) /
                               1000000000000000000           as tc
                        from crc_all_signups s
                                 join crc_hub_transfer_2 t on t."to" = s.user
                        where s.user = lower($1)
                        order by t.timestamp desc)
            select "from"
            from tx
            group by "from";
        `;

        const {rows} = await client.query(query, [recipientAddress.toLowerCase()]);
        const uniqueFromAddresses = rows.map((row: any) => row.from);

        return uniqueFromAddresses;
    } finally {
        client.release();
    }
}

export async function findTransactions(recipientAddress: string): Promise<Transaction[]> {
    const uniqueFromAddresses = await findUniqueFromAddresses(recipientAddress);
    const profiles = await queryCirclesGardenRemote(uniqueFromAddresses);

    const client = await pool.connect();

    try {
        const query = `
            select t.timestamp
                 , t.from
                 , t.to
                 , (t.value / 1000000000000000000)::text as crc
                 , (crc_to_tc(extract(epoch from t.timestamp at time zone 'utc'), t.value) / 1000000000000000000)::text as tc
            from crc_all_signups s
                     join crc_hub_transfer_2 t on t."to" = s.user
            where s.user = lower($1)
            order by t.timestamp desc
        `;

        const {rows} = await client.query(query, [recipientAddress.toLowerCase()]);
        const transactions = rows.map((row: any) => <Transaction>{
            timestamp: row.timestamp,
            from: row.from,
            to: row.to,
            crc: row.crc,
            tc: row.tc,
        });

        // Augment each transaction with the profile of the sender
        transactions.forEach((transaction) => {
            const profile = profiles[transaction.from];
            if (profile) {
                transaction.fromProfile = profile;
            }
        });

        return transactions;
    } finally {
        client.release();
    }
}
