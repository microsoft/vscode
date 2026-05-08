/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// Son of Anton — Code Graph indexer (v1 stub).
//
// Future iterations will:
//   1. Watch the mounted workspace for file changes (chokidar).
//   2. Parse changed files with tree-sitter.
//   3. Upsert nodes/edges into FalkorDB via the Redis protocol.
//   4. Push embeddings to Qdrant.
//
// For now this process exists purely so the docker-compose service comes up
// healthy and stays up. The IDE's "Enable Code Graph" command needs
// a non-exiting container as a wiring proof.

const interval = Number(process.env.INDEXER_HEARTBEAT_MS) || 60_000;

console.log(JSON.stringify({
	level: 'info',
	component: 'code-graph-indexer',
	message: 'Indexer ready (v1 stub — no indexing yet).',
	falkordb: `${process.env.FALKORDB_HOST || 'falkordb'}:${process.env.FALKORDB_PORT || 6379}`,
	qdrant: `${process.env.QDRANT_HOST || 'qdrant'}:${process.env.QDRANT_REST_PORT || 6333}`,
}));

setInterval(() => {
	console.log(JSON.stringify({
		level: 'debug',
		component: 'code-graph-indexer',
		message: 'heartbeat',
		timestamp: new Date().toISOString(),
	}));
}, interval).unref();

// Keep the event loop alive even if the timer is unref'd. The container
// orchestrator will SIGTERM us on shutdown.
process.stdin.resume();

process.on('SIGTERM', () => {
	console.log(JSON.stringify({ level: 'info', component: 'code-graph-indexer', message: 'SIGTERM received, shutting down.' }));
	process.exit(0);
});
