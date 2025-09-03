import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';

// Route modules (create these later: ./routes/advice, ./routes/ingest, ./routes/products)
import adviceRouter from './routes/advice.js';
import ingestRouter from './routes/ingest.js';
import productsRouter from './routes/products.js';



const app = express();

// Core middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Lightweight SSE helpers available to any route
app.use((req: Request, res: Response, next: NextFunction) => {
	(res as any).sseInit = () => {
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache, no-transform');
		res.setHeader('Connection', 'keep-alive');
		(res as any).flushHeaders?.();
	};
	(res as any).sseSend = (data: unknown, event?: string) => {
		if (event) res.write(`event: ${event}\n`);
		const payload = typeof data === 'string' ? data : JSON.stringify(data);
		res.write(`data: ${payload}\n\n`);
	};
	(res as any).sseClose = () => res.end();
	next();
});

// Healthcheck
app.get('/health', (_req: Request, res: Response) => {
	res.status(200).json({ ok: true });
});

// Mount routes
app.use('/advice', adviceRouter);     // POST /advice (SSE)
app.use('/ingest', ingestRouter);     // POST /ingest
app.use('/products', productsRouter); // GET /products/:id

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
	const status = err?.statusCode || 500;
	res.status(status).json({ error: err?.message || 'Internal Server Error' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
	console.log(`API listening on http://localhost:${PORT}`);
});

export default app;
