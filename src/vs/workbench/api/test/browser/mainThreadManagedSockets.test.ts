/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { disposableTimeout, timeout } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { SocketCloseEvent } from 'vs/base/parts/ipc/common/ipc.net';
import { mock } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { RemoteSocketHalf } from 'vs/platform/remote/common/managedSocket';
import { MainThreadManagedSocket } from 'vs/workbench/api/browser/mainThreadManagedSockets';
import { ExtHostManagedSocketsShape } from 'vs/workbench/api/common/extHost.protocol';

suite('MainThreadManagedSockets', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	suite('ManagedSocket', () => {
		let extHost: ExtHostMock;
		let half: RemoteSocketHalf;

		class ExtHostMock extends mock<ExtHostManagedSocketsShape>() {
			private onDidFire = new Emitter<void>();
			public readonly events: any[] = [];

			override $remoteSocketWrite(socketId: number, buffer: VSBuffer): void {
				this.events.push({ socketId, data: buffer.toString() });
				this.onDidFire.fire();
			}

			override $remoteSocketDrain(socketId: number) {
				this.events.push({ socketId, event: 'drain' });
				this.onDidFire.fire();
				return Promise.resolve();
			}

			override $remoteSocketEnd(socketId: number) {
				this.events.push({ socketId, event: 'end' });
				this.onDidFire.fire();
			}

			expectEvent(test: (evt: any) => void, message: string) {
				if (this.events.some(test)) {
					return;
				}

				const d = new DisposableStore();
				return new Promise<void>(resolve => {
					d.add(this.onDidFire.event(() => {
						if (this.events.some(test)) {
							return;
						}
					}));
					d.add(disposableTimeout(() => {
						throw new Error(`Expected ${message} but only had ${JSON.stringify(this.events, null, 2)}`);
					}, 1000));
				}).finally(() => d.dispose());
			}
		}

		setup(() => {
			extHost = new ExtHostMock();
			half = {
				onClose: new Emitter<SocketCloseEvent>(),
				onData: new Emitter<VSBuffer>(),
				onEnd: new Emitter<void>(),
			};
		});

		async function doConnect() {
			const socket = MainThreadManagedSocket.connect(1, extHost, '/hello', 'world=true', '', half);
			await extHost.expectEvent(evt => evt.data && evt.data.startsWith('GET ws://localhost/hello?world=true&skipWebSocketFrames=true HTTP/1.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key:'), 'websocket open event');
			half.onData.fire(VSBuffer.fromString('Opened successfully ;)\r\n\r\n'));
			return ds.add(await socket);
		}

		test('connects', async () => {
			await doConnect();
		});

		test('includes trailing connection data', async () => {
			const socketProm = MainThreadManagedSocket.connect(1, extHost, '/hello', 'world=true', '', half);
			await extHost.expectEvent(evt => evt.data && evt.data.includes('GET ws://localhost'), 'websocket open event');
			half.onData.fire(VSBuffer.fromString('Opened successfully ;)\r\n\r\nSome trailing data'));
			const socket = ds.add(await socketProm);

			const data: string[] = [];
			ds.add(socket.onData(d => data.push(d.toString())));
			await timeout(1); // allow microtasks to flush
			assert.deepStrictEqual(data, ['Some trailing data']);
		});

		test('round trips data', async () => {
			const socket = await doConnect();
			const data: string[] = [];
			ds.add(socket.onData(d => data.push(d.toString())));

			socket.write(VSBuffer.fromString('ping'));
			await extHost.expectEvent(evt => evt.data === 'ping', 'expected ping');
			half.onData.fire(VSBuffer.fromString("pong"));
			assert.deepStrictEqual(data, ['pong']);
		});
	});
});
