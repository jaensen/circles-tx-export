import {Transaction} from "../lib/types";
import {queryCirclesGardenRemote} from "../lib/circlesGardenProfiles";
import {pool} from "../lib/db";

async function findUniqueFromAddresses(recipientAddress: string): Promise<string[]> {
    if ((recipientAddress?.trim() ?? "") == "") {
        return [];
    }
    const client = await pool.connect();

    try {
        const query = `
            with tx as (select t.timestamp
                             , t.from
                             , t.to
                             , t.value / 1000000000000000000 as crc
                             , crc_to_tc(extract(epoch from t.timestamp at time zone 'utc') * 1000, t.value) /
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
    if ((recipientAddress?.trim() ?? "") == "") {
        return [];
    }
    const uniqueFromAddresses = await findUniqueFromAddresses(recipientAddress);
    const profiles = await queryCirclesGardenRemote(uniqueFromAddresses);

    const client = await pool.connect();

    try {
        const query = `
            WITH crc_txs AS (
                SELECT
                    t.timestamp AS timestamp,
                    date_trunc('month', t.timestamp) AS truncated_timestamp,
                    t.from,
                    t.to,
                    t.value AS crc,
                    crc_to_tc(extract(epoch from t.timestamp at time zone 'utc') * 1000, t.value) AS tc
                FROM crc_all_signups s
                         JOIN crc_hub_transfer_2 t ON t.to = s.user
                WHERE s.user = lower($1)
                UNION ALL
                SELECT
                    t.timestamp AS timestamp,
                    date_trunc('month', t.timestamp) AS truncated_timestamp,
                    t.to,
                    t.from,
                    -t.value AS crc,
                    -crc_to_tc(extract(epoch from t.timestamp at time zone 'utc') * 1000, t.value) AS tc
                FROM crc_all_signups s
                         JOIN crc_hub_transfer_2 t ON t.from = s.user
                WHERE s.user = lower($1)
                UNION ALL
                SELECT
                    t.timestamp AS timestamp,
                    date_trunc('month', t.timestamp) AS truncated_timestamp,
                    t.from,
                    t.to,
                    t.value AS crc,
                    crc_to_tc(extract(epoch from t.timestamp at time zone 'utc') * 1000, t.value) AS tc
                FROM crc_all_signups s
                         JOIN erc20_transfer_2 t ON t.to = s.user and t."from" = '0x0000000000000000000000000000000000000000' and t.token = s.token
                WHERE s.user = lower($1)
            ), monthly_series AS (
                SELECT DISTINCT
                    date_trunc('year', truncated_timestamp) AS year,
                    generate_series(date_trunc('year', truncated_timestamp), date_trunc('year', truncated_timestamp) + interval '11 months', interval '1 month') + interval '1 month' AS timestamp
                FROM crc_txs
            ), crc_txs_with_end_of_mont_rows as (
                SELECT DISTINCT
                    ms.timestamp,
                    '0x' AS "from",
                    '0x' AS "to",
                    0 AS crc,
                    0 AS tc
                FROM monthly_series ms
                         CROSS JOIN LATERAL generate_series(
                                ms.timestamp - interval '1 month' + interval '1 microsecond',
                                ms.timestamp,
                                interval '1 month'
                    ) AS gs
                UNION ALL
                SELECT
                    mt.timestamp,
                    mt.from,
                    mt.to,
                    mt.crc,
                    mt.tc
                FROM crc_txs mt
                ORDER BY timestamp, "from", "to"
            ), cum_crc as (
                select timestamp
                     , "from"
                     , "to"
                     , crc
                     , tc
                     , SUM(crc) OVER (ORDER BY timestamp asc) as cumulative_crc
                     , SUM(tc) OVER (ORDER BY timestamp asc) as cumulative_tc
                from crc_txs_with_end_of_mont_rows
            ), demur as (
                select  timestamp
                     , "from"
                     , "to"
                     , (crc  / 1000000000000000000)::text as crc
                     , (tc / 1000000000000000000)::text as tc
                     , (cumulative_crc / 1000000000000000000)::text as cumulative_crc
                     , (crc_to_tc(extract(epoch from timestamp at time zone 'utc') * 1000, cumulative_crc) / 1000000000000000000)::text as cumulative_tc
                     , (cumulative_tc - (crc_to_tc(extract(epoch from timestamp at time zone 'utc') * 1000, cumulative_crc))) as tc_demur
                from cum_crc
            ), abc as (
                select timestamp
                     , "from"
                     , "to"
                     , crc
                     , tc
                     , cumulative_crc
                     , cumulative_tc
                     , tc_demur
                     , (tc_demur - lag(tc_demur, 1) OVER (ORDER BY date_trunc('month', timestamp))) as monthly_tc_demur
                from demur
            ), def as (
                select timestamp
                     , "from"
                     , "to"
                     , crc
                     , tc
                     , cumulative_crc
                     , cumulative_tc
                     , (tc_demur / 1000000000000000000)::text as cumulative_tc_demur
                     --, (monthly_tc_demur / 1000000000000000000)::text as monthly_tc_demur
                     , (SUM(monthly_tc_demur) OVER (ORDER BY date_trunc('month', timestamp)) / 1000000000000000000) as cumulative_monthly_tc_demur
                from abc
            ), ghi as (
                select timestamp
                     , "from"
                     , "to"
                     , crc
                     , tc
                     --, cumulative_crc
                     --, cumulative_tc
                     --, cumulative_tc_demur
                     --, cumulative_monthly_tc_demur
                     , cumulative_monthly_tc_demur - lag(cumulative_monthly_tc_demur) over (ORDER BY date_trunc('month', timestamp)) as monthly_tc_demur
                from def
            )
            select *
            from ghi
            where not ("from" = '0x' and coalesce(monthly_tc_demur, 0) = 0)
            order by timestamp asc;
        `;

        const {rows} = await client.query(query, [recipientAddress.toLowerCase()]);
        const transactions = rows.map((row: any) => <Transaction>{
            timestamp: row.timestamp,
            from: row.from,
            to: row.to,
            crc: row.crc,
            tc: row.tc,
            monthly_tc_demur: row.monthly_tc_demur
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
