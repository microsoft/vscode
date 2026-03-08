// Son of Anton — Tree-sitter Indexer Service
// Entry point: initializes the indexer, runs a full index, then watches for changes.

import { loadConfig } from './config';
import { Indexer } from './indexer';
import { FileWatcher } from './watcher';
import { IndexerServer } from './server';

async function main(): Promise<void> {
	const config = loadConfig();

	console.log('[main] Son of Anton — Tree-sitter Indexer');
	console.log(`[main] Project path: ${config.project.path}`);
	console.log(`[main] Languages: ${config.project.languages.join(', ')}`);
	console.log(`[main] FalkorDB: ${config.falkordb.host}:${config.falkordb.port}`);
	console.log(`[main] Qdrant: ${config.qdrant.host}:${config.qdrant.restPort}`);

	const indexer = new Indexer(config);
	const watcher = new FileWatcher(indexer, config);
	const server = new IndexerServer(indexer, config);

	// Graceful shutdown
	const shutdown = async () => {
		console.log('[main] Shutting down...');
		await watcher.stop();
		await server.stop();
		await indexer.shutdown();
		process.exit(0);
	};

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);

	try {
		// Start the HTTP server first (so health checks pass)
		server.start();

		// Initialize database connections
		await indexer.initialize();

		// Run the initial full index
		await indexer.fullIndex();

		// Start watching for changes
		watcher.start();

		console.log('[main] Indexer running. Press Ctrl+C to stop.');
	} catch (err) {
		console.error('[main] Fatal error:', err);
		await shutdown();
	}
}

main().catch(err => {
	console.error('[main] Unhandled error:', err);
	process.exit(1);
});
