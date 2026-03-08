// Son of Anton — LSIF/SCIP Service HTTP Server
// Exposes health, stats, and control endpoints for the LSIF pipeline.

import http from 'http';
import { LsifPipeline } from './pipeline';
import { LsifConfig } from './config';

export class LsifServer {
	private server: http.Server | null = null;
	private readonly pipeline: LsifPipeline;
	private readonly config: LsifConfig;

	constructor(pipeline: LsifPipeline, config: LsifConfig) {
		this.pipeline = pipeline;
		this.config = config;
	}

	start(): void {
		this.server = http.createServer(async (req, res) => {
			try {
				await this.handleRequest(req, res);
			} catch (err) {
				console.error('[server] Request error:', err);
				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Internal server error' }));
			}
		});

		this.server.listen(this.config.server.port, () => {
			console.log(`[server] Listening on port ${this.config.server.port}`);
		});
	}

	async stop(): Promise<void> {
		return new Promise((resolve) => {
			if (this.server) {
				this.server.close(() => resolve());
			} else {
				resolve();
			}
		});
	}

	private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const url = new URL(req.url ?? '/', `http://localhost:${this.config.server.port}`);
		const method = req.method ?? 'GET';

		// GET /health
		if (method === 'GET' && url.pathname === '/health') {
			const stats = this.pipeline.getStats();
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({
				status: 'ok',
				service: 'lsif',
				isRunning: stats.isRunning,
				lastRunTime: stats.lastRunTime
					? new Date(stats.lastRunTime).toISOString()
					: null,
			}));
			return;
		}

		// GET /stats
		if (method === 'GET' && url.pathname === '/stats') {
			const stats = this.pipeline.getStats();
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(stats));
			return;
		}

		// POST /run — trigger full LSIF/SCIP pipeline
		if (method === 'POST' && url.pathname === '/run') {
			const stats = this.pipeline.getStats();
			if (stats.isRunning) {
				res.writeHead(409, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Pipeline already running' }));
				return;
			}

			// Run in background
			this.pipeline.runFull().catch(err => {
				console.error('[server] Pipeline run failed:', err);
			});

			res.writeHead(202, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'accepted', message: 'LSIF/SCIP pipeline started' }));
			return;
		}

		// POST /run/:language — trigger pipeline for a specific language
		if (method === 'POST' && url.pathname.startsWith('/run/')) {
			const language = url.pathname.substring('/run/'.length);

			const result = await this.pipeline.runForLanguage(language);
			if (!result) {
				res.writeHead(404, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: `No indexer available for language: ${language}` }));
				return;
			}

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(result));
			return;
		}

		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Not found' }));
	}
}
