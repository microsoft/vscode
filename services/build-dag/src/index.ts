// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import http from 'http';
import { extractNodeDag } from './extractors/nodeExtractor';
import { extractMakeDag } from './extractors/makeExtractor';
import { extractDockerComposeDag } from './extractors/dockerComposeExtractor';
import { DagStore } from './graph/dagStore';
import type { ExtractionResult } from './types';

const PORT = parseInt(process.env.BUILD_DAG_PORT ?? '3301', 10);
const PROJECT_PATH = process.env.PROJECT_PATH ?? '/workspace';

const store = new DagStore();

/** Run all extractors and merge results into the store. */
async function extractAll(): Promise<void> {
	const results: ExtractionResult[] = [];

	// Run extractors in parallel
	const [nodeResult, makeResult, dockerResult] = await Promise.allSettled([
		extractNodeDag(PROJECT_PATH),
		extractMakeDag(PROJECT_PATH),
		extractDockerComposeDag(PROJECT_PATH),
	]);

	if (nodeResult.status === 'fulfilled') {
		results.push(nodeResult.value);
	}
	if (makeResult.status === 'fulfilled' && makeResult.value) {
		results.push(makeResult.value);
	}
	if (dockerResult.status === 'fulfilled' && dockerResult.value) {
		results.push(dockerResult.value);
	}

	// Merge all targets and services
	const allTargets = results.flatMap(r => r.targets);
	const allServices = results.flatMap(r => r.services);

	// Deduplicate services by name
	const serviceMap = new Map(allServices.map(s => [s.name, s]));

	store.load(allTargets, Array.from(serviceMap.values()));

	console.log(`[build-dag] Extracted ${allTargets.length} targets, ${serviceMap.size} services from ${results.length} ecosystems`);
}

const httpServer = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

	// Health endpoint
	if (url.pathname === '/health') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({
			status: 'ok',
			service: 'build-dag',
			targets: store.targetCount,
			lastExtractedAt: store.lastExtractedAt,
		}));
		return;
	}

	// List all targets
	if (url.pathname === '/targets' && req.method === 'GET') {
		const ecosystem = url.searchParams.get('ecosystem') ?? undefined;
		const targets = store.listTargets(ecosystem);
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ targets }));
		return;
	}

	// Get build order for a target
	if (url.pathname === '/build-order' && req.method === 'GET') {
		const target = url.searchParams.get('target');
		if (!target) {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Missing target parameter' }));
			return;
		}
		try {
			const order = store.buildOrder(target);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(order));
		} catch (err) {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: (err as Error).message }));
		}
		return;
	}

	// Get environment requirements for a target
	if (url.pathname === '/environment' && req.method === 'GET') {
		const target = url.searchParams.get('target');
		if (!target) {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Missing target parameter' }));
			return;
		}
		try {
			const reqs = store.environmentRequirements(target);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(reqs));
		} catch (err) {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: (err as Error).message }));
		}
		return;
	}

	// Get affected targets for changed files
	if (url.pathname === '/affected' && req.method === 'POST') {
		const body = await readBody(req);
		try {
			const { changedFiles } = JSON.parse(body);
			const affected = store.affectedTargets(changedFiles);
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(affected));
		} catch (err) {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: (err as Error).message }));
		}
		return;
	}

	// Re-extract the DAG
	if (url.pathname === '/extract' && req.method === 'POST') {
		await extractAll();
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({
			status: 'ok',
			targets: store.targetCount,
			extractedAt: store.lastExtractedAt,
		}));
		return;
	}

	res.writeHead(404, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify({ error: 'Not found' }));
});

function readBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = '';
		req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
		req.on('end', () => resolve(data));
		req.on('error', reject);
	});
}

async function start(): Promise<void> {
	// Extract DAG on startup
	await extractAll();

	httpServer.listen(PORT, () => {
		console.log(`[build-dag] Build DAG service listening on port ${PORT}`);
		console.log(`[build-dag] Health endpoint: http://localhost:${PORT}/health`);
		console.log(`[build-dag] Project path: ${PROJECT_PATH}`);
	});
}

start().catch(err => {
	console.error('[build-dag] Fatal startup error:', err);
	process.exit(1);
});

export { DagStore };
