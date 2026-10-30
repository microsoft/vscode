/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { contextBridge, ipcRenderer } from 'electron';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IChannel, IPCClient } from '../../../../../base/parts/ipc/common/ipc.js';
import { Protocol } from '../../../../../base/parts/ipc/common/ipc.electron.js';

interface IConnection {
	readonly store: DisposableStore;
	readonly protocol: Protocol;
	readonly channel: IChannel;
	enabled: boolean | undefined;
	readonly updates: boolean[];
}

let connection: IConnection | undefined;

contextBridge.exposeInMainWorld('gpuProcessTest', {
	async connect() {
		const store = new DisposableStore();
		const protocol = new Protocol(ipcRenderer, Event.fromNodeEventEmitter<VSBuffer>(ipcRenderer, 'vscode:message', (_event: Electron.IpcRendererEvent, message: Uint8Array) => VSBuffer.wrap(message)));
		ipcRenderer.send('vscode:hello');
		const client = store.add(new IPCClient(protocol, 'gpu-process-test'));
		const channel = client.getChannel('nativeHost');
		const current: IConnection = { store, protocol, channel, enabled: undefined, updates: [] };
		connection = current;
		store.add(channel.listen<boolean>('onDidChangeGPUCompositing')(enabled => {
			current.enabled = enabled;
			current.updates.push(enabled);
		}));
		const enabled = await channel.call<boolean>('isGPUCompositingEnabled');
		if (current.enabled === undefined) {
			current.enabled = enabled;
		}
		return current.enabled;
	},
	async snapshot() {
		if (!connection) {
			throw new Error('GPU IPC client is disconnected');
		}
		const mainEnabled = await connection.channel.call<boolean>('isGPUCompositingEnabled');
		return { enabled: connection.enabled, mainEnabled, updates: [...connection.updates] };
	},
	disconnect() {
		if (!connection) {
			throw new Error('GPU IPC client is disconnected');
		}
		connection.store.dispose();
		connection.protocol.disconnect();
		connection = undefined;
	}
});

ipcRenderer.send('vscode:gpu-test-ready');
