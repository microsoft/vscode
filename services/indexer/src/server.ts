// Son of Anton — Indexer HTTP Server
// Exposes health, stats, and control endpoints for the indexer service.

import http from 'http';
import { Indexer } from './indexer';
import { IndexerConfig } from './config';

export class IndexerServer {
	private server: http.Server | null = null;
	private readonly indexer: Indexer;
	private readonly config: IndexerConfig;

	constructor(indexer: Indexer, config: IndexerConfig) {
		this.indexer = indexer;
		this.config = config;
	}

	/**
	 * Start the HTTP server.
	 */
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

	/**
	 * Stop the HTTP server.
	 */
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

		// GET /health — service status
		if (method === 'GET' && url.pathname === '/health') {
			const stats = this.indexer.getStats();
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({
				status: 'ok',
				service: 'indexer',
				filesIndexed: stats.filesIndexed,
				lastUpdateTime: stats.lastUpdateTime
					? new Date(stats.lastUpdateTime).toISOString()
					: null,
				isIndexing: stats.isIndexing,
			}));
			return;
		}

		// GET /stats — detailed stats
		if (method === 'GET' && url.pathname === '/stats') {
			await this.indexer.refreshStats();
			const stats = this.indexer.getStats();
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({
				filesIndexed: stats.filesIndexed,
				filesFailed: stats.filesFailed,
				totalFunctions: stats.totalFunctions,
				totalClasses: stats.totalClasses,
				totalTypes: stats.totalTypes,
				totalImports: stats.totalImports,
				lastUpdateTime: stats.lastUpdateTime
					? new Date(stats.lastUpdateTime).toISOString()
					: null,
				isIndexing: stats.isIndexing,
				graph: {
					nodeCount: stats.graphNodeCount,
					edgeCount: stats.graphEdgeCount,
				},
				qdrant: {
					pointCount: stats.qdrantPointCount,
				},
			}));
			return;
		}

		// POST /reindex — trigger full reindex
		if (method === 'POST' && url.pathname === '/reindex') {
			if (this.indexer.getStats().isIndexing) {
				res.writeHead(409, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Indexing already in progress' }));
				return;
			}

			// Start reindex in the background
			this.indexer.fullIndex().catch(err => {
				console.error('[server] Reindex failed:', err);
			});

			res.writeHead(202, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ status: 'accepted', message: 'Full reindex started' }));
			return;
		}

		// POST /reindex/:path — reindex a specific file
		if (method === 'POST' && url.pathname.startsWith('/reindex/')) {
			const filePath = decodeURIComponent(url.pathname.substring('/reindex/'.length));
			const fullPath = filePath.startsWith('/')
				? filePath
				: `${this.config.project.path}/${filePath}`;

			try {
				const updated = await this.indexer.indexFile(fullPath);
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({
					status: 'ok',
					file: filePath,
					updated,
				}));
			} catch (err) {
				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({
					error: 'Failed to index file',
					file: filePath,
					message: err instanceof Error ? err.message : String(err),
				}));
			}
			return;
		}

		// 404 for everything else
		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Not found' }));
	}
}
