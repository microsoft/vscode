/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, type IPty } from 'node-pty';
import type { PtyHostEvent, PtyHostRequest } from './ptyHostProtocol';
import { maxBufferedBytes } from './protocol';

let pty: IPty | undefined;
let finished = false;
let pausedByClient = false;
let ipcBackpressure = false;
let pendingChars = 0;
const subscriptions: { dispose(): void }[] = [];

function finish(event: PtyHostEvent, kill: boolean): void {
	if (finished) {
		return;
	}
	finished = true;
	for (const subscription of subscriptions.splice(0)) {
		subscription.dispose();
	}
	if (kill && pty) {
		try {
			pty.kill();
		} catch (error) {
			event = { type: 'error', message: error instanceof Error ? error.message : String(error) };
		}
	}
	// node-pty can retain native worker handles after a shell exits. This one-session
	// helper exits only after its ordered IPC output has been handed to the parent.
	if (process.connected && process.send) {
		process.send(event, () => process.exit(0));
		setTimeout(() => process.exit(1), 3_000);
	} else {
		process.exit(0);
	}
}

process.on('message', (message: PtyHostRequest) => {
	if (finished) {
		return;
	}
	try {
		if (message.type === 'kill') {
			finish({ type: 'exit', exitCode: 1 }, true);
			return;
		}
		if (message.type === 'start') {
			if (pty) {
				throw new Error('The PTY helper has already started.');
			}
			const { executable, args, ...options } = message.options;
			pty = spawn(executable, args, { ...options, name: 'xterm-256color' });
			subscriptions.push(pty.onData(data => {
				if (process.connected && process.send) {
					pendingChars += data.length;
					if (pendingChars > maxBufferedBytes) {
						finish({ type: 'error', message: 'The PTY helper exceeded its output buffer limit.' }, true);
						return;
					}
					const accepted = process.send({ type: 'data', data } satisfies PtyHostEvent, error => {
						pendingChars -= data.length;
						if (error) {
							finish({ type: 'error', message: error.message }, true);
						} else if (!finished && pendingChars === 0 && ipcBackpressure) {
							ipcBackpressure = false;
							if (!pausedByClient) {
								pty?.resume();
							}
						}
					});
					if (!accepted && !ipcBackpressure) {
						ipcBackpressure = true;
						pty?.pause();
					}
				}
			}));
			subscriptions.push(pty.onExit(event => finish({ type: 'exit', ...event }, false)));
			return;
		}
		if (!pty) {
			throw new Error('The PTY helper has not started.');
		}
		switch (message.type) {
			case 'input': pty.write(message.data); break;
			case 'resize': pty.resize(message.cols, message.rows); break;
			case 'pause':
				pausedByClient = true;
				pty.pause();
				break;
			case 'resume':
				pausedByClient = false;
				if (!ipcBackpressure) {
					pty.resume();
				}
				break;
		}
	} catch (error) {
		finish({ type: 'error', message: error instanceof Error ? error.message : String(error) }, true);
	}
});
process.once('disconnect', () => finish({ type: 'exit', exitCode: 1 }, true));
process.once('SIGTERM', () => finish({ type: 'exit', exitCode: 1 }, true));
