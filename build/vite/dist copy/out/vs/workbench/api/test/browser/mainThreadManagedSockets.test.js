/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { disposableTimeout, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { MainThreadManagedSocket } from '../../browser/mainThreadManagedSockets.js';
suite('MainThreadManagedSockets', () => {
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    suite('ManagedSocket', () => {
        let extHost;
        let half;
        class ExtHostMock extends mock() {
            constructor() {
                super(...arguments);
                this.onDidFire = new Emitter();
                this.events = [];
            }
            $remoteSocketWrite(socketId, buffer) {
                this.events.push({ socketId, data: buffer.toString() });
                this.onDidFire.fire();
            }
            $remoteSocketDrain(socketId) {
                this.events.push({ socketId, event: 'drain' });
                this.onDidFire.fire();
                return Promise.resolve();
            }
            $remoteSocketEnd(socketId) {
                this.events.push({ socketId, event: 'end' });
                this.onDidFire.fire();
            }
            expectEvent(test, message) {
                if (this.events.some(test)) {
                    return;
                }
                const d = new DisposableStore();
                return new Promise(resolve => {
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
                onClose: new Emitter(),
                onData: new Emitter(),
                onEnd: new Emitter(),
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
            const data = [];
            ds.add(socket.onData(d => data.push(d.toString())));
            await timeout(1); // allow microtasks to flush
            assert.deepStrictEqual(data, ['Some trailing data']);
        });
        test('round trips data', async () => {
            const socket = await doConnect();
            const data = [];
            ds.add(socket.onData(d => data.push(d.toString())));
            socket.write(VSBuffer.fromString('ping'));
            await extHost.expectEvent(evt => evt.data === 'ping', 'expected ping');
            half.onData.fire(VSBuffer.fromString('pong'));
            assert.deepStrictEqual(data, ['pong']);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZE1hbmFnZWRTb2NrZXRzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL3Rlc3QvYnJvd3Nlci9tYWluVGhyZWFkTWFuYWdlZFNvY2tldHMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDM0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRXZFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUdwRixLQUFLLENBQUMsMEJBQTBCLEVBQUUsR0FBRyxFQUFFO0lBRXRDLE1BQU0sRUFBRSxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFckQsS0FBSyxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDM0IsSUFBSSxPQUFvQixDQUFDO1FBQ3pCLElBQUksSUFBc0IsQ0FBQztRQUUzQixNQUFNLFdBQVksU0FBUSxJQUFJLEVBQThCO1lBQTVEOztnQkFDUyxjQUFTLEdBQUcsSUFBSSxPQUFPLEVBQVEsQ0FBQztnQkFDeEIsV0FBTSxHQUFVLEVBQUUsQ0FBQztZQW1DcEMsQ0FBQztZQWpDUyxrQkFBa0IsQ0FBQyxRQUFnQixFQUFFLE1BQWdCO2dCQUM3RCxJQUFJLENBQUMsTUFBTSxD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QUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFcEQsTUFBTSxDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDMUMsTUFBTSxPQUFPLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUUsZUFBZSxDQUFDLENBQUM7WUFDdkUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQzlDLE1BQU0sQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUN4QyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0FBQ0osQ0FBQyxDQUFDLENBQUMifQ==