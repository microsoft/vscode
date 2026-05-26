/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

// Standalone PSP demo. Run with `node build/next/pspDemo.js` inside an integrated terminal of a
// dev Code-OSS build. Cycles through a few fake statuses so you can watch the psp:/ document live.
//
// Optional CLI args: list of statuses to cycle through (default: idle, working, finalizing).
// Optional env var: PSP_DEMO_INTERVAL_MS (default 1500).

import { connectPspPublisher } from '@vscode/psp';

const statuses = process.argv.slice(2);
if (statuses.length === 0) {
	statuses.push('idle', 'working', 'finalizing');
}
const intervalMs = Number(process.env.PSP_DEMO_INTERVAL_MS) || 1500;

const psp = await connectPspPublisher({
	client: { name: 'psp-demo', version: '0.1.0' },
	sessionId: 'psp-demo',
});

if (!psp.sessionId) {
	console.error('[psp-demo] missing PROCESS_STATE_PROTOCOL_ENDPOINT / PROCESS_STATE_PROTOCOL_TOKEN — run me from a dev Code-OSS terminal.');
	process.exit(1);
}

console.log(`[psp-demo] connected as session "${psp.sessionId}"; cycling statuses [${statuses.join(', ')}] every ${intervalMs}ms. Ctrl+C to stop.`);

let cycling = true;

function shutdown() {
	cycling = false;
	try { psp.close(); } catch { /* ignore */ }
	setTimeout(() => process.exit(0), 200).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

let i = 0;
while (cycling) {
	const status = statuses[i % statuses.length];
	console.log(`[psp-demo] -> ${status}`);
	psp.setDoc({ status });
	i++;
	await new Promise(r => setTimeout(r, intervalMs));
}
