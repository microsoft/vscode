/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fork } from 'node:child_process';
import { join } from 'node:path';
import type { BridgePty } from './bridge';
import type { PtyHostEvent, PtyHostRequest, ShellOptions } from './ptyHostProtocol';
import { maxBufferedBytes } from './protocol';

export function spawnPtyHost(options: ShellOptions, hostPath = join(__dirname, 'ptyHost.cjs')): BridgePty {
	const dataListeners = new Set<(data: string) => void>();
	const exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>();
	const errorListeners = new Set<(error: Error) => void>();
	const child = fork(hostPath, [], {
		stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
		execArgv: [],
		env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: undefined },
	});
	let finalExit: { exitCode: number; signal?: number } | undefined;
	let stderr = '';
	let closed = false;
	let stopping = false;
	let killTimer: NodeJS.Timeout | undefined;
	let queuedBytes = 0;
	const fail = (error: Error) => {
		for (const listener of errorListeners) {
			listener(error);
		}
	};
	const send = (message: PtyHostRequest) => {
		if (!closed && child.connected) {
			const bytes = Buffer.byteLength(JSON.stringify(message));
			if (!stopping && queuedBytes + bytes > maxBufferedBytes) {
				queueMicrotask(() => fail(new Error('The PTY helper exceeded its input buffer limit.')));
				return;
			}
			queuedBytes += bytes;
			child.send(message, error => {
				queuedBytes -= bytes;
				if (error && !stopping) {
					fail(error);
				}
			});
		} else if (!stopping) {
			fail(new Error('The PTY helper disconnected unexpectedly.'));
		}
	};
	child.stderr?.on('data', (data: Buffer) => {
		stderr = (stderr + data.toString()).slice(-8192);
	});
	child.on('error', fail);
	child.on('message', (event: PtyHostEvent) => {
		switch (event.type) {
			case 'data':
				for (const listener of dataListeners) { listener(event.data); }
				break;
			case 'exit':
				finalExit = event;
				break;
			case 'error':
				fail(new Error(event.message));
				break;
		}
	});
	child.once('close', code => {
		closed = true;
		clearTimeout(killTimer);
		if (!finalExit && !stopping) {
			fail(new Error(`The PTY helper exited unexpectedly (${code ?? 'no exit code'}). ${stderr.trim()}`));
		}
		for (const listener of exitListeners) {
			listener(finalExit ?? { exitCode: 1 });
		}
		dataListeners.clear();
		exitListeners.clear();
		errorListeners.clear();
	});
	send({ type: 'start', options });
	return {
		onData: listener => {
			dataListeners.add(listener);
			return { dispose: () => { dataListeners.delete(listener); } };
		},
		onExit: listener => {
			exitListeners.add(listener);
			return { dispose: () => { exitListeners.delete(listener); } };
		},
		onError: listener => {
			errorListeners.add(listener);
			return { dispose: () => { errorListeners.delete(listener); } };
		},
		write: data => send({ type: 'input', data: data.toString() }),
		resize: (cols, rows) => send({ type: 'resize', cols, rows }),
		pause: () => send({ type: 'pause' }),
		resume: () => send({ type: 'resume' }),
		kill: () => {
			if (closed || stopping) {
				return;
			}
			stopping = true;
			send({ type: 'kill' });
			killTimer = setTimeout(() => child.kill(), 5_000);
		},
	};
}
