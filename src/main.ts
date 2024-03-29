import express, {Request, Response} from 'express';
import {generateTransactionHtmlTable} from "./lib/htmlOutput";
import {findTransactions} from "./exports/transactionListExport";
import {transactionDetailGraph, trustGraph} from "./exports/transactionDetailExport";

const app = express();
const port = 3000;

app.use(express.static('public'));

app.get('/api/findTransactions', async (req: Request, res: Response) => {
    const to = req.query.to as string;

    const tx = await findTransactions(to);
    const html = generateTransactionHtmlTable(tx);

    res.send(html);
});

app.get('/api/showTransactionGraph', async (req: Request, res: Response) => {
    const txHash = req.query.txHash as string;

    const showCrc = !!req.query.showCrc;
    const dot = await transactionDetailGraph(txHash, !showCrc);

    res.contentType('text/vnd.graphviz');
    res.send(dot);
});

app.get('/api/showTrustGraph', async (req: Request, res: Response) => {
    const address = req.query.address as string;
    const dot = await trustGraph(address);

    res.contentType('text/vnd.graphviz');
    res.send(dot);
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
