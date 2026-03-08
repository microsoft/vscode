/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { loadConfig } from './config';
import { ZapClient } from './clients/zapClient';
import { FalkorDbClient } from './clients/falkordbClient';
import { Coordinator } from './coordinator/coordinator';
import { SandboxAgent } from './sandbox/sandboxAgent';
import { ValidationAgent } from './validation/validationAgent';
import { PenTestServer } from './server';

async function main(): Promise<void> {
	const config = loadConfig();

	console.log('Son of Anton — Penetration Testing Service');
	console.log(`Target: ${config.targetBaseUrl}`);
	console.log(`ZAP: ${config.zapHost}:${config.zapPort}`);
	console.log(`Max requests per test: ${config.maxRequestsPerTest}`);

	// Initialise clients
	const zapClient = new ZapClient(config);
	const falkorDb = new FalkorDbClient(config);

	// Attempt FalkorDB connection (non-blocking — runs without it)
	try {
		await falkorDb.connect();
		console.log('Connected to FalkorDB');
	} catch (err) {
		console.warn('FalkorDB not available — running without code graph analysis');
	}

	// Build agent trio
	const coordinator = new Coordinator(config, falkorDb);
	const sandboxAgent = new SandboxAgent(config, zapClient);
	const validationAgent = new ValidationAgent(config);

	// Start HTTP server
	const server = new PenTestServer(
		config, coordinator, sandboxAgent, validationAgent, zapClient, falkorDb,
	);
	await server.start();

	// Graceful shutdown
	const shutdown = async () => {
		console.log('Shutting down...');
		await server.stop();
		await falkorDb.disconnect();
		process.exit(0);
	};

	process.on('SIGINT', shutdown);
	process.on('SIGTERM', shutdown);
}

main().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
