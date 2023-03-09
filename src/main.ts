import express, {Request, Response} from 'express';
import {Pool} from 'pg';
import Web3 from "web3";
import fetch from "cross-fetch";

export type SafeProfileMap = { [safeAddress: string]: any };

const pool = new Pool({
    user: process.env.INDEX_DB_USER ?? 'readonly_user',
    host: process.env.INDEX_DB_HOST ?? 'rpc.helsinki.circlesubi.id',
    database: process.env.INDEX_DB ?? 'index',
    password: process.env.INDEX_DB_PASSWORD,
    port: parseInt(process.env.INDEX_DB_PORT ?? "5432"),
    ssl: {
        rejectUnauthorized: false,
    },
});


type Profile = {
    username: string;
    address: string;
    avatarUrl: string;
};

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

export type Transaction = {
    timestamp: Date;
    from: string;
    fromProfile?: Profile;
    to: string;
    crc: number;
    tc: number;
}

async function findTransactions(recipientAddress: string): Promise<Transaction[]> {
    const uniqueFromAddresses = await findUniqueFromAddresses(recipientAddress);
    const profiles = await queryCirclesGardenRemote(uniqueFromAddresses);

    const client = await pool.connect();

    try {
        const query = `
            select t.timestamp
                 , t.from
                 , t.to
                 , t.value / 1000000000000000000                                                                as crc
                 , crc_to_tc(extract(epoch from t.timestamp at time zone 'utc'), t.value) / 1000000000000000000 as tc
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


async function queryCirclesGardenRemote(
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

function formatDate(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // Month is zero-indexed, so add 1
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();

    // Add leading zeroes to ensure two digits for each value
    const formattedMonth = month.toString().padStart(2, '0');
    const formattedDay = day.toString().padStart(2, '0');
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = minutes.toString().padStart(2, '0');
    const formattedSeconds = seconds.toString().padStart(2, '0');

    return `${year}-${formattedMonth}-${formattedDay} ${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}

function generateTableHTML(data: any[]): string {
    let tableHTML = `<style>
/* Set font family and size for the entire document */
body {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.5;
}

/* Add some padding and margin to the table */
table {
  padding: 20px;
  margin: 20px auto;
  border-collapse: collapse;
}

/* Add a border to the table and table cells */
table, th, td {
  border: 1px solid #ccc;
}

/* Style the table header */
th {
  background-color: #eee;
  text-align: left;
  padding: 10px;
}

/* Style the table cells */
td {
  padding: 10px;
}

/* Set a different background color for every other table row */
tr:nth-child(even) {
  background-color: #f9f9f9;
}

/* Style the table caption */
caption {
  font-size: 20px;
  font-weight: bold;
  text-align: center;
  margin-bottom: 20px;
}
</style>
                      <table>
                      <thead>
                          <tr>
                              <th>Timestamp</th>
                              <th>From</th>
                              <th>From (address)</th>
                              <th>To</th>
                              <th>Value (CRC)</th>
                              <th>Value (TC)</th>
                          </tr>
                      </thead>
                      <tbody>`;
    for (const row of data) {
        tableHTML += `
            <tr>
              <td>${formatDate(row.timestamp)}</td>
              <td>
                ${row.fromProfile?.avatarUrl
            ? `<img style="width:32px; height:32px;" width="32" height="32" src="${row.fromProfile.avatarUrl}" alt="${row.fromProfile?.username}">`
            : ''} ${row.fromProfile?.username}
              </td>
              <td>${row.from}</td>
              <td>${row.to}</td>
              <td>${parseFloat(row.crc).toFixed(3)}</td>
              <td>${parseFloat(row.tc).toFixed(3)}</td>
            </tr>`;
    }
    tableHTML += `</tbody></table>`;
    return tableHTML;
}

const app = express();
const port = 3000;

// Define the findTransactions API endpoint
app.get('/api/findTransactions', async (req: Request, res: Response) => {
    const to = req.query.to as string;

    const tx = await findTransactions(to);
    const html = generateTableHTML(tx);

    res.send(html);
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
