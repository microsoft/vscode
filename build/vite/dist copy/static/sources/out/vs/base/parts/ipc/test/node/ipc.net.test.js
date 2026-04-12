/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import sinon from 'sinon';
import { EventEmitter } from 'events';
import { connect, createServer } from 'net';
import { tmpdir } from 'os';
import { Barrier, timeout } from '../../../../common/async.js';
import { VSBuffer } from '../../../../common/buffer.js';
import { Emitter, Event } from '../../../../common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../common/lifecycle.js';
import { PersistentProtocol, Protocol } from '../../common/ipc.net.js';
import { createRandomIPCHandle, createStaticIPCHandle, NodeSocket, WebSocketNodeSocket } from '../../node/ipc.net.js';
import { flakySuite } from '../../../../test/common/testUtils.js';
import { runWithFakedTimers } from '../../../../test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';
class MessageStream extends Disposable {
    constructor(x) {
        super();
        this._currentComplete = null;
        this._messages = [];
        this._register(x.onMessage(data => {
            this._messages.push(data);
            this._trigger();
        }));
    }
    _trigger() {
        if (!this._currentComplete) {
            return;
        }
        if (this._messages.length === 0) {
            return;
        }
        const complete = this._currentComplete;
        const msg = this._messages.shift();
        this._currentComplete = null;
        complete(msg);
    }
    waitForOne() {
        return new Promise((complete) => {
            this._currentComplete = complete;
            this._trigger();
        });
    }
}
class EtherStream extends EventEmitter {
    constructor(_ether, _name) {
        super();
        this._ether = _ether;
        this._name = _name;
    }
    write(data, cb) {
        if (!Buffer.isBuffer(data)) {
            throw new Error(`Invalid data`);
        }
        this._ether.write(this._name, data);
        return true;
    }
    destroy() {
    }
}
class Ether {
    get a() {
        // eslint-disable-next-line local/code-no-any-casts
        return this._a;
    }
    get b() {
        // eslint-disable-next-line local/code-no-any-casts
        return this._b;
    }
    constructor(_wireLatency = 0) {
        this._wireLatency = _wireLatency;
        this._a = new EtherStream(this, 'a');
        this._b = new EtherStream(this, 'b');
        this._ab = [];
        this._ba = [];
    }
    write(from, data) {
        setTimeout(() => {
            if (from === 'a') {
                this._ab.push(data);
            }
            else {
                this._ba.push(data);
            }
            setTimeout(() => this._deliver(), 0);
        }, this._wireLatency);
    }
    _deliver() {
        if (this._ab.length > 0) {
            const data = Buffer.concat(this._ab);
            this._ab.length = 0;
            this._b.emit('data', data);
            setTimeout(() => this._deliver(), 0);
            return;
        }
        if (this._ba.length > 0) {
            const data = Buffer.concat(this._ba);
            this._ba.length = 0;
            this._a.emit('data', data);
            setTimeout(() => this._deliver(), 0);
            return;
        }
    }
}
suite('IPC, Socket Protocol', () => {
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    let ether;
    setup(() => {
        ether = new Ether();
    });
    test('read/write', async () => {
        const a = new Protocol(new NodeSocket(ether.a));
        const b = new Protocol(new NodeSocket(ether.b));
        const bMessages = new MessageStream(b);
        a.send(VSBuffer.fromString('foobarfarboo'));
        const msg1 = await bMessages.waitForOne();
        assert.strictEqual(msg1.toString(), 'foobarfarboo');
        const buffer = VSBuffer.alloc(1);
        buffer.writeUInt8(123, 0);
        a.send(buffer);
        const msg2 = await bMessages.waitForOne();
        assert.strictEqual(msg2.readUInt8(0), 123);
        bMessages.dispose();
        a.dispose();
        b.dispose();
    });
    test('read/write, object data', async () => {
        const a = new Protocol(new NodeSocket(ether.a));
        const b = new Protocol(new NodeSocket(ether.b));
        const bMessages = new MessageStream(b);
        const data = {
            pi: Math.PI,
            foo: 'bar',
            more: true,
            data: 'Hello World'.split('')
        };
        a.send(VSBuffer.fromString(JSON.stringify(data)));
        const msg = await bMessages.waitForOne();
        assert.deepStrictEqual(JSON.parse(msg.toString()), data);
        bMessages.dispose();
        a.dispose();
        b.dispose();
    });
    test('issue #211462: destroy socket after end timeout', async () => {
        const socket = new EventEmitter();
        Object.assign(socket, { destroy: () => socket.emit('close') });
        const protocol = ds.add(new Protocol(new NodeSocket(socket)));
        const disposed = sinon.stub();
        const timers = sinon.useFakeTimers();
        ds.add(toDisposable(() => timers.restore()));
        ds.add(protocol.onDidDispose(disposed));
        socket.emit('end');
        assert.ok(!disposed.called);
        timers.tick(29_999);
        assert.ok(!disposed.called);
        timers.tick(1);
        assert.ok(disposed.called);
    });
});
suite('PersistentProtocol reconnection', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('acks get piggybacked with messages', async () => {
        const ether = new Ether();
        const a = new PersistentProtocol({ socket: new NodeSocket(ether.a) });
        const aMessages = new MessageStream(a);
        const b = new PersistentProtocol({ socket: new NodeSocket(ether.b) });
        const bMessages = new MessageStream(b);
        a.send(VSBuffer.fromString('a1'));
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 0);
        a.send(VSBuffer.fromString('a2'));
        assert.strictEqual(a.unacknowledgedCount, 2);
        assert.strictEqual(b.unacknowledgedCount, 0);
        a.send(VSBuffer.fromString('a3'));
        assert.strictEqual(a.unacknowledgedCount, 3);
        assert.strictEqual(b.unacknowledgedCount, 0);
        const a1 = await bMessages.waitForOne();
        assert.strictEqual(a1.toString(), 'a1');
        assert.strictEqual(a.unacknowledgedCount, 3);
        assert.strictEqual(b.unacknowledgedCount, 0);
        const a2 = await bMessages.waitForOne();
        assert.strictEqual(a2.toString(), 'a2');
        assert.strictEqual(a.unacknowledgedCount, 3);
        assert.strictEqual(b.unacknowledgedCount, 0);
        const a3 = await bMessages.waitForOne();
        assert.strictEqual(a3.toString(), 'a3');
        assert.strictEqual(a.unacknowledgedCount, 3);
        assert.strictEqual(b.unacknowledgedCount, 0);
        b.send(VSBuffer.fromString('b1'));
        assert.strictEqual(a.unacknowledgedCount, 3);
        assert.strictEqual(b.unacknowledgedCount, 1);
        const b1 = await aMessages.waitForOne();
        assert.strictEqual(b1.toString(), 'b1');
        assert.strictEqual(a.unacknowledgedCount, 0);
        assert.strictEqual(b.unacknowledgedCount, 1);
        a.send(VSBuffer.fromString('a4'));
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 1);
        const b2 = await bMessages.waitForOne();
        assert.strictEqual(b2.toString(), 'a4');
        assert.strictEqual(a.unacknowledgedCount, 1);
        assert.strictEqual(b.unacknowledgedCount, 0);
        aMessages.dispose();
        bMessages.dispose();
        a.dispose();
        b.dispose();
    });
    test('ack gets sent after a while', async () => {
        await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
            const loadEstimator = {
                hasHighLoad: () => false
            };
            const ether = new Ether();
            const aSocket = new NodeSocket(ether.a);
            const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
            const aMessages = new MessageStream(a);
            const bSocket = new NodeSocket(ether.b);
            const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
            const bMessages = new MessageStream(b);
            // send one message A -> B
            a.send(VSBuffer.fromString('a1'));
            assert.strictEqual(a.unacknowledgedCount, 1);
            assert.strictEqual(b.unacknowledgedCount, 0);
            const a1 = await bMessages.waitForOne();
            assert.strictEqual(a1.toString(), 'a1');
            assert.strictEqual(a.unacknowledgedCount, 1);
            assert.strictEqual(b.unacknowledgedCount, 0);
            // wait for ack to arrive B -> A
            await timeout(2 * 2000 /* ProtocolConstants.AcknowledgeTime */);
            assert.strictEqual(a.unacknowledgedCount, 0);
            assert.strictEqual(b.unacknowledgedCount, 0);
            aMessages.dispose();
            bMessages.dispose();
            a.dispose();
            b.dispose();
        });
    });
    test('messages that are never written to a socket should not cause an ack timeout', async () => {
        await runWithFakedTimers({
            useFakeTimers: true,
            useSetImmediate: true,
            maxTaskCount: 1000
        }, async () => {
            // Date.now() in fake timers starts at 0, which is very inconvenient
            // since we want to test exactly that a certain field is not initialized with Date.now()
            // As a workaround we wait such that Date.now() starts producing more realistic values
            await timeout(60 * 60 * 1000);
            const loadEstimator = {
                hasHighLoad: () => false
            };
            const ether = new Ether();
            const aSocket = new NodeSocket(ether.a);
            const a = new PersistentProtocol({ socket: aSocket, loadEstimator, sendKeepAlive: false });
            const aMessages = new MessageStream(a);
            const bSocket = new NodeSocket(ether.b);
            const b = new PersistentProtocol({ socket: bSocket, loadEstimator, sendKeepAlive: false });
            const bMessages = new MessageStream(b);
            // send message a1 before reconnection to get _recvAckCheck() scheduled
            a.send(VSBuffer.fromString('a1'));
            assert.strictEqual(a.unacknowledgedCount, 1);
            assert.strictEqual(b.unacknowledgedCount, 0);
            // read message a1 at B
            const a1 = await bMessages.waitForOne();
            assert.strictEqual(a1.toString(), 'a1');
            assert.strictEqual(a.unacknowledgedCount, 1);
            assert.strictEqual(b.unacknowledgedCount, 0);
            // send message b1 to send the ack for a1
            b.send(VSBuffer.fromString('b1'));
            assert.strictEqual(a.unacknowledgedCount, 1);
            assert.strictEqual(b.unacknowledgedCount, 1);
            // read message b1 at A to receive the ack for a1
            const b1 = await aMessages.waitForOne();
            assert.strictEqual(b1.toString(), 'b1');
            assert.strictEqual(a.unacknowledgedCount, 0);
            assert.strictEqual(b.unacknowledgedCount, 1);
            // begin reconnection
            aSocket.dispose();
            const aSocket2 = new NodeSocket(ether.a);
            a.beginAcceptReconnection(aSocket2, null);
            let timeoutListenerCalled = false;
            const socketTimeoutListener = a.onSocketTimeout(() => {
                timeoutListenerCalled = true;
            });
            // send message 2 during reconnection
            a.send(VSBuffer.fromString('a2'));
            assert.strictEqual(a.unacknowledgedCount, 1);
            assert.strictEqual(b.unacknowledgedCount, 1);
            // wait for scheduled _recvAckCheck() to execute
            await timeout(2 * 20000 /* ProtocolConstants.TimeoutTime */);
            assert.strictEqual(a.unacknowledgedCount, 1);
            assert.strictEqual(b.unacknowledgedCount, 1);
            assert.strictEqual(timeoutListenerCalled, false);
            a.endAcceptReconnection();
            assert.strictEqual(timeoutListenerCalled, false);
            await timeout(2 * 20000 /* ProtocolConstants.TimeoutTime */);
            assert.strictEqual(a.unacknowledgedCount, 0);
            assert.strictEqual(b.unacknowledgedCount, 0);
            assert.strictEqual(timeoutListenerCalled, false);
            socketTimeoutListener.dispose();
            aMessages.dispose();
            bMessages.dispose();
            a.dispose();
            b.dispose();
        });
    });
    test('acks are always sent after a reconnection', async () => {
        await runWithFakedTimers({
            useFakeTimers: true,
            useSetImmediate: true,
            maxTaskCount: 1000
        }, async () => {
            const loadEstimator = {
                hasHighLoad: () => false
            };
            const wireLatency = 1000;
            const ether = new Ether(wireLatency);
            const aSocket = new NodeSocket(ether.a);
            const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
            const aMessages = new MessageStream(a);
            const bSocket = new NodeSocket(ether.b);
            const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
            const bMessages = new MessageStream(b);
            // send message a1 to have something unacknowledged
            a.send(VSBuffer.fromString('a1'));
            assert.strictEqual(a.unacknowledgedCount, 1);
            assert.strictEqual(b.unacknowledgedCount, 0);
            // read message a1 at B
            const a1 = await bMessages.waitForOne();
            assert.strictEqual(a1.toString(), 'a1');
            assert.strictEqual(a.unacknowledgedCount, 1);
            assert.strictEqual(b.unacknowledgedCount, 0);
            // wait for B to send an ACK message,
            // but resume before A receives it
            await timeout(2000 /* ProtocolConstants.AcknowledgeTime */ + wireLatency / 2);
            assert.strictEqual(a.unacknowledgedCount, 1);
            assert.strictEqual(b.unacknowledgedCount, 0);
            // simulate complete reconnection
            aSocket.dispose();
            bSocket.dispose();
            const ether2 = new Ether(wireLatency);
            const aSocket2 = new NodeSocket(ether2.a);
            const bSocket2 = new NodeSocket(ether2.b);
            b.beginAcceptReconnection(bSocket2, null);
            b.endAcceptReconnection();
            a.beginAcceptReconnection(aSocket2, null);
            a.endAcceptReconnection();
            // wait for quite some time
            await timeout(2 * 2000 /* ProtocolConstants.AcknowledgeTime */ + wireLatency);
            assert.strictEqual(a.unacknowledgedCount, 0);
            assert.strictEqual(b.unacknowledgedCount, 0);
            aMessages.dispose();
            bMessages.dispose();
            a.dispose();
            b.dispose();
        });
    });
    test('onSocketTimeout is emitted at most once every 20s', async () => {
        await runWithFakedTimers({
            useFakeTimers: true,
            useSetImmediate: true,
            maxTaskCount: 1000
        }, async () => {
            const loadEstimator = {
                hasHighLoad: () => false
            };
            const ether = new Ether();
            const aSocket = new NodeSocket(ether.a);
            const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
            const aMessages = new MessageStream(a);
            const bSocket = new NodeSocket(ether.b);
            const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
            const bMessages = new MessageStream(b);
            // never receive acks
            b.pauseSocketWriting();
            // send message a1 to have something unacknowledged
            a.send(VSBuffer.fromString('a1'));
            // wait for the first timeout to fire
            await Event.toPromise(a.onSocketTimeout);
            let timeoutFiredAgain = false;
            const timeoutListener = a.onSocketTimeout(() => {
                timeoutFiredAgain = true;
            });
            // send more messages
            a.send(VSBuffer.fromString('a2'));
            a.send(VSBuffer.fromString('a3'));
            // wait for 10s
            await timeout(20000 /* ProtocolConstants.TimeoutTime */ / 2);
            assert.strictEqual(timeoutFiredAgain, false);
            timeoutListener.dispose();
            aMessages.dispose();
            bMessages.dispose();
            a.dispose();
            b.dispose();
        });
    });
    test('writing can be paused', async () => {
        await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 100 }, async () => {
            const loadEstimator = {
                hasHighLoad: () => false
            };
            const ether = new Ether();
            const aSocket = new NodeSocket(ether.a);
            const a = new PersistentProtocol({ socket: aSocket, loadEstimator });
            const aMessages = new MessageStream(a);
            const bSocket = new NodeSocket(ether.b);
            const b = new PersistentProtocol({ socket: bSocket, loadEstimator });
            const bMessages = new MessageStream(b);
            // send one message A -> B
            a.send(VSBuffer.fromString('a1'));
            const a1 = await bMessages.waitForOne();
            assert.strictEqual(a1.toString(), 'a1');
            // ask A to pause writing
            b.sendPause();
            // send a message B -> A
            b.send(VSBuffer.fromString('b1'));
            const b1 = await aMessages.waitForOne();
            assert.strictEqual(b1.toString(), 'b1');
            // send a message A -> B (this should be blocked at A)
            a.send(VSBuffer.fromString('a2'));
            // wait a long time and check that not even acks are written
            await timeout(2 * 2000 /* ProtocolConstants.AcknowledgeTime */);
            assert.strictEqual(a.unacknowledgedCount, 1);
            assert.strictEqual(b.unacknowledgedCount, 1);
            // ask A to resume writing
            b.sendResume();
            // check that B receives message
            const a2 = await bMessages.waitForOne();
            assert.strictEqual(a2.toString(), 'a2');
            // wait a long time and check that acks are written
            await timeout(2 * 2000 /* ProtocolConstants.AcknowledgeTime */);
            assert.strictEqual(a.unacknowledgedCount, 0);
            assert.strictEqual(b.unacknowledgedCount, 0);
            aMessages.dispose();
            bMessages.dispose();
            a.dispose();
            b.dispose();
        });
    });
});
flakySuite('IPC, create handle', () => {
    test('createRandomIPCHandle', async () => {
        return testIPCHandle(createRandomIPCHandle());
    });
    test('createStaticIPCHandle', async () => {
        return testIPCHandle(createStaticIPCHandle(tmpdir(), 'test', '1.64.0'));
    });
    function testIPCHandle(handle) {
        return new Promise((resolve, reject) => {
            const pipeName = createRandomIPCHandle();
            const server = createServer();
            server.on('error', () => {
                return new Promise(() => server.close(() => reject()));
            });
            server.listen(pipeName, () => {
                server.removeListener('error', reject);
                return new Promise(() => {
                    server.close(() => resolve());
                });
            });
        });
    }
});
suite('WebSocketNodeSocket', () => {
    const ds = ensureNoDisposablesAreLeakedInTestSuite();
    function toUint8Array(data) {
        const result = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) {
            result[i] = data[i];
        }
        return result;
    }
    function fromUint8Array(data) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            result[i] = data[i];
        }
        return result;
    }
    function fromCharCodeArray(data) {
        let result = '';
        for (let i = 0; i < data.length; i++) {
            result += String.fromCharCode(data[i]);
        }
        return result;
    }
    class FakeNodeSocket extends Disposable {
        traceSocketEvent(type, data) {
        }
        constructor() {
            super();
            this._onData = new Emitter();
            this.onData = this._onData.event;
            this._onClose = new Emitter();
            this.onClose = this._onClose.event;
            this.writtenData = [];
        }
        write(data) {
            this.writtenData.push(data);
        }
        fireData(data) {
            this._onData.fire(VSBuffer.wrap(toUint8Array(data)));
        }
    }
    async function testReading(frames, permessageDeflate) {
        const disposables = new DisposableStore();
        const socket = new FakeNodeSocket();
        // eslint-disable-next-line local/code-no-any-casts
        const webSocket = disposables.add(new WebSocketNodeSocket(socket, permessageDeflate, null, false));
        const barrier = new Barrier();
        let remainingFrameCount = frames.length;
        let receivedData = '';
        disposables.add(webSocket.onData((buff) => {
            receivedData += fromCharCodeArray(fromUint8Array(buff.buffer));
            remainingFrameCount--;
            if (remainingFrameCount === 0) {
                barrier.open();
            }
        }));
        for (let i = 0; i < frames.length; i++) {
            socket.fireData(frames[i]);
        }
        await barrier.wait();
        disposables.dispose();
        return receivedData;
    }
    test('A single-frame unmasked text message', async () => {
        const frames = [
            [0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f] // contains "Hello"
        ];
        const actual = await testReading(frames, false);
        assert.deepStrictEqual(actual, 'Hello');
    });
    test('A single-frame masked text message', async () => {
        const frames = [
            [0x81, 0x85, 0x37, 0xfa, 0x21, 0x3d, 0x7f, 0x9f, 0x4d, 0x51, 0x58] // contains "Hello"
        ];
        const actual = await testReading(frames, false);
        assert.deepStrictEqual(actual, 'Hello');
    });
    test('A fragmented unmasked text message', async () => {
        // contains "Hello"
        const frames = [
            [0x01, 0x03, 0x48, 0x65, 0x6c], // contains "Hel"
            [0x80, 0x02, 0x6c, 0x6f], // contains "lo"
        ];
        const actual = await testReading(frames, false);
        assert.deepStrictEqual(actual, 'Hello');
    });
    suite('compression', () => {
        test('A single-frame compressed text message', async () => {
            // contains "Hello"
            const frames = [
                [0xc1, 0x07, 0xf2, 0x48, 0xcd, 0xc9, 0xc9, 0x07, 0x00], // contains "Hello"
            ];
            const actual = await testReading(frames, true);
            assert.deepStrictEqual(actual, 'Hello');
        });
        test('setRecordInflateBytes(false) clears and stops recording', async () => {
            const disposables = new DisposableStore();
            const socket = disposables.add(new FakeNodeSocket());
            // eslint-disable-next-line local/code-no-any-casts
            const webSocket = disposables.add(new WebSocketNodeSocket(socket, true, null, true));
            const compressedHelloFrame = [0xc1, 0x07, 0xf2, 0x48, 0xcd, 0xc9, 0xc9, 0x07, 0x00];
            const waitForOneData = () => new Promise(resolve => {
                const d = webSocket.onData(data => {
                    d.dispose();
                    resolve(data);
                });
            });
            const firstPromise = waitForOneData();
            socket.fireData(compressedHelloFrame);
            const first = await firstPromise;
            assert.strictEqual(fromCharCodeArray(fromUint8Array(first.buffer)), 'Hello');
            assert.ok(webSocket.recordedInflateBytes.byteLength > 0);
            webSocket.setRecordInflateBytes(false);
            assert.strictEqual(webSocket.recordedInflateBytes.byteLength, 0);
            const secondPromise = waitForOneData();
            socket.fireData(compressedHelloFrame);
            const second = await secondPromise;
            assert.strictEqual(fromCharCodeArray(fromUint8Array(second.buffer)), 'Hello');
            assert.strictEqual(webSocket.recordedInflateBytes.byteLength, 0);
            webSocket.setRecordInflateBytes(true);
            assert.strictEqual(webSocket.recordedInflateBytes.byteLength, 0);
            const thirdPromise = waitForOneData();
            socket.fireData(compressedHelloFrame);
            const third = await thirdPromise;
            assert.strictEqual(fromCharCodeArray(fromUint8Array(third.buffer)), 'Hello');
            assert.ok(webSocket.recordedInflateBytes.byteLength > 0);
            disposables.dispose();
        });
        test('A fragmented compressed text message', async () => {
            // contains "Hello"
            const frames = [
                [0x41, 0x03, 0xf2, 0x48, 0xcd],
                [0x80, 0x04, 0xc9, 0xc9, 0x07, 0x00]
            ];
            const actual = await testReading(frames, true);
            assert.deepStrictEqual(actual, 'Hello');
        });
        test('A single-frame non-compressed text message', async () => {
            const frames = [
                [0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f] // contains "Hello"
            ];
            const actual = await testReading(frames, true);
            assert.deepStrictEqual(actual, 'Hello');
        });
        test('A single-frame compressed text message followed by a single-frame non-compressed text message', async () => {
            const frames = [
                [0xc1, 0x07, 0xf2, 0x48, 0xcd, 0xc9, 0xc9, 0x07, 0x00], // contains "Hello"
                [0x81, 0x05, 0x77, 0x6f, 0x72, 0x6c, 0x64] // contains "world"
            ];
            const actual = await testReading(frames, true);
            assert.deepStrictEqual(actual, 'Helloworld');
        });
    });
    test('Large buffers are split and sent in chunks', async () => {
        let receivingSideOnDataCallCount = 0;
        let receivingSideTotalBytes = 0;
        const receivingSideSocketClosedBarrier = new Barrier();
        const server = await listenOnRandomPort((socket) => {
            // stop the server when the first connection is received
            server.close();
            const webSocketNodeSocket = new WebSocketNodeSocket(new NodeSocket(socket), true, null, false);
            ds.add(webSocketNodeSocket.onData((data) => {
                receivingSideOnDataCallCount++;
                receivingSideTotalBytes += data.byteLength;
            }));
            ds.add(webSocketNodeSocket.onClose(() => {
                webSocketNodeSocket.dispose();
                receivingSideSocketClosedBarrier.open();
            }));
        });
        const socket = connect({
            host: '127.0.0.1',
            port: server.address().port
        });
        const buff = generateRandomBuffer(1 * 1024 * 1024);
        const webSocketNodeSocket = new WebSocketNodeSocket(new NodeSocket(socket), true, null, false);
        webSocketNodeSocket.write(buff);
        await webSocketNodeSocket.drain();
        webSocketNodeSocket.dispose();
        await receivingSideSocketClosedBarrier.wait();
        assert.strictEqual(receivingSideTotalBytes, buff.byteLength);
        assert.strictEqual(receivingSideOnDataCallCount, 4);
    });
    test('issue #194284: ping/pong opcodes are supported', async () => {
        const disposables = new DisposableStore();
        const socket = new FakeNodeSocket();
        // eslint-disable-next-line local/code-no-any-casts
        const webSocket = disposables.add(new WebSocketNodeSocket(socket, false, null, false));
        let receivedData = '';
        disposables.add(webSocket.onData((buff) => {
            receivedData += fromCharCodeArray(fromUint8Array(buff.buffer));
        }));
        // A single-frame non-compressed text message that contains "Hello"
        socket.fireData([0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
        // A ping message that contains "data"
        socket.fireData([0x89, 0x04, 0x64, 0x61, 0x74, 0x61]);
        // Another single-frame non-compressed text message that contains "Hello"
        socket.fireData([0x81, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f]);
        assert.strictEqual(receivedData, 'HelloHello');
        assert.deepStrictEqual(socket.writtenData.map(x => fromUint8Array(x.buffer)), [
            // A pong message that contains "data"
            [0x8A, 0x04, 0x64, 0x61, 0x74, 0x61]
        ]);
        disposables.dispose();
        return receivedData;
    });
    function generateRandomBuffer(size) {
        const buff = VSBuffer.alloc(size);
        for (let i = 0; i < size; i++) {
            buff.writeUInt8(Math.floor(256 * Math.random()), i);
        }
        return buff;
    }
    function listenOnRandomPort(handler) {
        return new Promise((resolve, reject) => {
            const server = createServer(handler).listen(0);
            server.on('listening', () => {
                resolve(server);
            });
            server.on('error', (err) => {
                reject(err);
            });
        });
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXBjLm5ldC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9wYXJ0cy9pcGMvdGVzdC9ub2RlL2lwYy5uZXQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxLQUFLLE1BQU0sT0FBTyxDQUFDO0FBQzFCLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDdEMsT0FBTyxFQUFlLE9BQU8sRUFBRSxZQUFZLEVBQWtCLE1BQU0sS0FBSyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDeEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUM1RixPQUFPLEVBQWtCLGtCQUFrQixFQUFFLFFBQVEsRUFBbUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN4SixPQUFPLEVBQUUscUJBQXFCLEVBQUUscUJBQXFCLEVBQUUsVUFBVSxFQUFFLG1CQUFtQixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDdEgsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTNGLE1BQU0sYUFBYyxTQUFRLFVBQVU7SUFLckMsWUFB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QUFJLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3RFLE1BQU0sU0FBUyxHQUFHLElBQUksYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZDLE1BQU0sQ0FBQyxHQUFHLElBQUksa0JBQWtCLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN0RSxNQUFNLFNBQVMsR0FBRyxJQUFJLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUV2QyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNsQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU3QyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNsQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU3QyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNsQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU3QyxNQUFNLEVBQUUsR0FBRyxNQUFNLFNBQVMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN4QyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN4QyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU3QyxNQUFNLEVBQUUsR0FBRyxNQUFNLFNBQVMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN4QyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN4QyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU3QyxNQUFNLEVBQUUsR0FBRyxNQUFNLFNBQVMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN4QyxNQUFNLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN4QyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU3QyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNsQyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUM3QyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUU3QyxNQUFNLEVBQUUsR0FBRyxNQUFNLFNBQVMsQ0FBQyxVQUFVLEVBQUUsQ0FB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