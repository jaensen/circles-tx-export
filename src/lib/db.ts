import {Pool} from "pg";

export const pool = new Pool({
    user: process.env.INDEX_DB_USER ?? 'readonly_user',
    host: process.env.INDEX_DB_HOST ?? 'rpc.helsinki.circlesubi.id',
    database: process.env.INDEX_DB ?? 'index',
    password: process.env.INDEX_DB_PASSWORD,
    port: parseInt(process.env.INDEX_DB_PORT ?? "5432"),
    ssl: {
        rejectUnauthorized: false,
    },
});
