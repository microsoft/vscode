// Son of Anton — LSIF/SCIP Generator Service
// Entry point: runs LSIF/SCIP indexers and writes cross-reference data to FalkorDB.

import { loadConfig } from './config';
import { LsifPipeline } from './pipeline';
import { LsifServer } from './server';

async function main(): Promise<void> {
	const config = loadConfig();

	console.log('[main] Son of Anton — LSIF/SCIP Generator');
	console.log(`[main] Project path: ${config.project.path}`);
	console.log(`[main] Languages: ${config.project.languages.join(', ')}`);
	console.log(`[main] FalkorDB: ${config.falkordb.host}:${config.falkordb.port}`);
	console.log(`[main] Prefer SCIP: ${config.lsif.preferScip}`);

	const pipeline = new LsifPipeline(config);
	const server = new LsifServer(pipeline, config);

	// Graceful shutdown
	const shutdown = async () => {
		console.log('[main] Shutting down...');
		await server.stop();
		await pipeline.shutdown();
		process.exit(0);
	};

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);

	try {
		// Start the HTTP server first (health checks)
		server.start();

		// Initialize database connections
		await pipeline.initialize();

		// Run the initial LSIF/SCIP pipeline
		await pipeline.runFull();

		console.log('[main] LSIF service running. Awaiting triggers for re-indexing.');
	} catch (err) {
		console.error('[main] Fatal error:', err);
		await shutdown();
	}
}

main().catch(err => {
	console.error('[main] Unhandled error:', err);
	process.exit(1);
});
