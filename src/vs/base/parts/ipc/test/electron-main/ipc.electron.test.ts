/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { WebContents } from 'electron';
import { VSBuffer } from '../../../../common/buffer.js';
import { Emitter } from '../../../../common/event.js';
import { DisposableStore, toDisposable } from '../../../../common/lifecycle.js';
import { mock } from '../../../../test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';
import { IPCClient, ProxyChannel } from '../../common/ipc.js';
import { Server } from '../../electron-main/ipc.electron.js';

suite('Electron IPC reconnection', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('renderer reloads replace the connection instead of multiplying channel calls', async () => {
		const ipcMain = new EventEmitter();
		const server = disposables.add(new Server(ipcMain));
		let replies: Emitter<VSBuffer>;
		const sender = new class extends mock<WebContents>() {
			override readonly id = 1234;
			override send(channel: string, message: Buffer): void {
				assert.strictEqual(channel, 'vscode:message');
				const target = replies;
				queueMicrotask(() => target.fire(VSBuffer.wrap(message)));
			}
			override isDestroyed(): boolean { return false; }
		}();
		disposables.add(toDisposable(() => ipcMain.emit('vscode:disconnect', { sender }, null)));
		let calls = 0;
		server.registerChannel('external', ProxyChannel.fromService({ open: async () => ++calls }, disposables.add(new DisposableStore())));
		const results: number[] = [];
		const connections: number[] = [];
		const listeners: number[] = [];
		for (let index = 0; index < 8; index++) {
			replies = disposables.add(new Emitter<VSBuffer>());
			ipcMain.emit('vscode:hello', { sender });
			const client = disposables.add(new IPCClient({
				onMessage: replies.event,
				send: message => ipcMain.emit('vscode:message', { sender }, message.buffer),
			}, 'renderer'));
			results.push(await client.getChannel('external').call<number>('open'));
			connections.push(server.connections.length);
			listeners.push(ipcMain.listenerCount('vscode:message'));
		}
		ipcMain.emit('vscode:disconnect', { sender }, null);
		assert.deepStrictEqual({
			calls, results, connections, listeners,
			remainingConnections: server.connections.length,
			remainingListeners: ipcMain.listenerCount('vscode:message'),
			remainingDisconnectListeners: ipcMain.listenerCount('vscode:disconnect'),
		}, {
			calls: 8, results: [1, 2, 3, 4, 5, 6, 7, 8],
			connections: Array(8).fill(1), listeners: Array(8).fill(1),
			remainingConnections: 0, remainingListeners: 0, remainingDisconnectListeners: 0,
		});
	});
});
