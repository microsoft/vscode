/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { IPCClient } from '../../../../base/parts/ipc/common/ipc.js';
import { Server } from '../../../../base/parts/ipc/electron-main/ipc.electron.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { FetchChannel, FetchChannelClient } from '../../common/fetchIpc.js';

suite('Fetch Electron IPC lifetime', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const termination of ['render-process-gone', 'destroyed', 'disconnect', 'reconnect'] as const) {
		test(`cancels the origin request and unlocks the body on ${termination}`, async () => {
			const ipcMain = new EventEmitter();
			const incoming = store.add(new Emitter<VSBuffer>());
			const webContents = new class extends EventEmitter {
				readonly id = 1;
				send(_channel: string, message: Uint8Array): void {
					queueMicrotask(() => incoming.fire(VSBuffer.wrap(message)));
				}
			}();
			const server = store.add(new Server(ipcMain));
			let signal: AbortSignal | undefined;
			let cancelled = 0;
			const body = new ReadableStream<Uint8Array>({
				cancel: () => { cancelled++; },
			}, { highWaterMark: 0 });
			server.registerChannel('fetch', store.add(new FetchChannel(async (_input, init) => {
				signal = init?.signal ?? undefined;
				return new Response(body);
			}, new NullLogService())));
			ipcMain.emit('vscode:hello', { sender: webContents });
			const client = store.add(new IPCClient({
				onMessage: incoming.event,
				send: buffer => { ipcMain.emit('vscode:message', { sender: webContents }, buffer.buffer); },
			}, 'window'));
			const fetchClient = new FetchChannelClient(client.getChannel('fetch'));
			const response = await fetchClient.fetch('https://api.test/stalled');
			assert.deepStrictEqual({ connections: server.connections.length, locked: body.locked, aborted: signal?.aborted }, {
				connections: 1, locked: true, aborted: false,
			});
			if (termination === 'reconnect') {
				ipcMain.emit('vscode:hello', { sender: webContents });
			} else if (termination === 'disconnect') {
				ipcMain.emit('vscode:disconnect', { sender: webContents }, null);
			} else {
				webContents.emit(termination);
			}
			assert.deepStrictEqual({ connections: server.connections.length, locked: body.locked, aborted: signal?.aborted, cancelled }, {
				connections: 0, locked: false, aborted: true, cancelled: 1,
			});
			await response.body!.cancel();
			if (termination === 'reconnect') {
				const reconnected = store.add(new IPCClient({
					onMessage: incoming.event,
					send: buffer => { ipcMain.emit('vscode:message', { sender: webContents }, buffer.buffer); },
				}, 'reconnected-window'));
				assert.strictEqual(server.connections.length, 1);
				ipcMain.emit('vscode:disconnect', { sender: webContents }, null);
				reconnected.dispose();
			}
			assert.deepStrictEqual({
				crashListeners: webContents.listenerCount('render-process-gone'),
				destroyListeners: webContents.listenerCount('destroyed'),
				disconnectListeners: ipcMain.listenerCount('vscode:disconnect'),
				messageListeners: ipcMain.listenerCount('vscode:message'),
			}, { crashListeners: 0, destroyListeners: 0, disconnectListeners: 0, messageListeners: 0 });
		});
	}
});
