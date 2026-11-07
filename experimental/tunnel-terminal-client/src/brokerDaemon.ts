/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Broker, brokerIdleMs, type Provider } from './broker.js';
import type { Machine } from './agentHost.js';
import { ensureSupportedRuntime } from './runtime.js';
import { connectRelay } from './tunnel.js';

// Entry point of the detached connection broker started by `tunnel`. See broker.ts.

const maxConfigBytes = 64 * 1024;

interface BrokerConfig {
	token: string;
	provider: Provider;
	machine: Machine;
	idleMs: number;
}

async function readConfig(): Promise<BrokerConfig> {
	let input = '';
	process.stdin.setEncoding('utf8');
	for await (const chunk of process.stdin) {
		input += chunk;
		if (input.length > maxConfigBytes) {
			throw new Error('Connection broker configuration is too large.');
		}
	}
	const config = JSON.parse(input) as BrokerConfig;
	if (typeof config.token !== 'string' || !config.token || (config.provider !== 'github' && config.provider !== 'microsoft')
		|| typeof config.machine?.id !== 'string' || typeof config.machine.cluster !== 'string') {
		throw new Error('Invalid connection broker configuration.');
	}
	const idleMs = Number.isSafeInteger(config.idleMs) && config.idleMs > 0 ? config.idleMs : brokerIdleMs;
	return { ...config, idleMs };
}

function report(value: object): void {
	try {
		process.stdout.write(`${JSON.stringify(value)}\n`);
		process.stdout.end();
	} catch {
		// The starting client may already be gone.
	}
}

async function main(): Promise<void> {
	// The broker is detached from any terminal; it ends through idle timeout or `tunnel --disconnect`.
	process.on('SIGINT', () => { });
	process.on('SIGHUP', () => { });
	process.stdout.on('error', () => { });
	let broker: Broker | undefined;
	try {
		ensureSupportedRuntime();
		const config = await readConfig();
		const never = new AbortController().signal;
		const relay = await connectRelay(config.machine, config.token, config.provider, never);
		broker = new Broker({
			provider: config.provider,
			relay,
			reconnect: signal => connectRelay(config.machine, config.token, config.provider, signal),
			idleMs: config.idleMs,
		});
		process.on('SIGTERM', () => void broker?.stop());
		const descriptor = await broker.listen();
		report({ ok: true, descriptor });
	} catch (error) {
		report({ ok: false, error: error instanceof Error ? error.message : 'The connection broker failed to start.' });
		await broker?.stop();
		process.exit(1);
	}
	await broker.closed;
	process.exit(0);
}

void main();
