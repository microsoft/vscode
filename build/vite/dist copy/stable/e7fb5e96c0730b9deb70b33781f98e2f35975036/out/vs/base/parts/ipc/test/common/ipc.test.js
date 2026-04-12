/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { timeout } from '../../../../common/async.js';
import { VSBuffer } from '../../../../common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../common/cancellation.js';
import { canceled } from '../../../../common/errors.js';
import { Emitter, Event } from '../../../../common/event.js';
import { DisposableStore } from '../../../../common/lifecycle.js';
import { isEqual } from '../../../../common/resources.js';
import { URI } from '../../../../common/uri.js';
import { BufferReader, BufferWriter, deserialize, IPCClient, IPCServer, ProxyChannel, serialize } from '../../common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';
class QueueProtocol {
    constructor() {
        this.buffering = true;
        this.buffers = [];
        this._onMessage = new Emitter({
            onDidAddFirstListener: () => {
                for (const buffer of this.buffers) {
                    this._onMessage.fire(buffer);
                }
                this.buffers = [];
                this.buffering = false;
            },
            onDidRemoveLastListener: () => {
                this.buffering = true;
            }
        });
        this.onMessage = this._onMessage.event;
    }
    send(buffer) {
        this.other.receive(buffer);
    }
    receive(buffer) {
        if (this.buffering) {
            this.buffers.push(buffer);
        }
        else {
            this._onMessage.fire(buffer);
        }
    }
}
function createProtocolPair() {
    const one = new QueueProtocol();
    const other = new QueueProtocol();
    one.other = other;
    other.other = one;
    return [one, other];
}
class TestIPCClient extends IPCClient {
    constructor(protocol, id) {
        super(protocol, id);
        this._onDidDisconnect = new Emitter();
        this.onDidDisconnect = this._onDidDisconnect.event;
    }
    dispose() {
        this._onDidDisconnect.fire();
        super.dispose();
    }
}
class TestIPCServer extends IPCServer {
    constructor() {
        const onDidClientConnect = new Emitter();
        super(onDidClientConnect.event);
        this.onDidClientConnect = onDidClientConnect;
    }
    createConnection(id) {
        const [pc, ps] = createProtocolPair();
        const client = new TestIPCClient(pc, id);
        this.onDidClientConnect.fire({
            protocol: ps,
            onDidClientDisconnect: client.onDidDisconnect
        });
        return client;
    }
}
const TestChannelId = 'testchannel';
class TestService {
    constructor() {
        this.disposables = new DisposableStore();
        this._onPong = new Emitter();
        this.onPong = this._onPong.event;
    }
    marco() {
        return Promise.resolve('polo');
    }
    error(message) {
        return Promise.reject(new Error(message));
    }
    neverComplete() {
        return new Promise(_ => { });
    }
    neverCompleteCT(cancellationToken) {
        if (cancellationToken.isCancellationRequested) {
            return Promise.reject(canceled());
        }
        return new Promise((_, e) => this.disposables.add(cancellationToken.onCancellationRequested(() => e(canceled()))));
    }
    buffersLength(buffers) {
        return Promise.resolve(buffers.reduce((r, b) => r + b.buffer.length, 0));
    }
    ping(msg) {
        this._onPong.fire(msg);
    }
    marshall(uri) {
        return Promise.resolve(uri);
    }
    context(context) {
        return Promise.resolve(context);
    }
    dispose() {
        this.disposables.dispose();
    }
}
class TestChannel {
    constructor(service) {
        this.service = service;
    }
    call(_, command, arg, cancellationToken) {
        switch (command) {
            case 'marco': return this.service.marco();
            case 'error': return this.service.error(arg);
            case 'neverComplete': return this.service.neverComplete();
            case 'neverCompleteCT': return this.service.neverCompleteCT(cancellationToken);
            case 'buffersLength': return this.service.buffersLength(arg);
            default: return Promise.reject(new Error('not implemented'));
        }
    }
    listen(_, event, arg) {
        switch (event) {
            case 'onPong': return this.service.onPong;
            default: throw new Error('not implemented');
        }
    }
}
class TestChannelClient {
    get onPong() {
        return this.channel.listen('onPong');
    }
    constructor(channel) {
        this.channel = channel;
    }
    marco() {
        return this.channel.call('marco');
    }
    error(message) {
        return this.channel.call('error', message);
    }
    neverComplete() {
        return this.channel.call('neverComplete');
    }
    neverCompleteCT(cancellationToken) {
        return this.channel.call('neverCompleteCT', undefined, cancellationToken);
    }
    buffersLength(buffers) {
        return this.channel.call('buffersLength', buffers);
    }
    marshall(uri) {
        return this.channel.call('marshall', uri);
    }
    context() {
        return this.channel.call('context');
    }
}
suite('Base IPC', function () {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test('createProtocolPair', async function () {
        const [clientProtocol, serverProtocol] = createProtocolPair();
        const b1 = VSBuffer.alloc(0);
        clientProtocol.send(b1);
        const b3 = VSBuffer.alloc(0);
        serverProtocol.send(b3);
        const b2 = await Event.toPromise(serverProtocol.onMessage);
        const b4 = await Event.toPromise(clientProtocol.onMessage);
        assert.strictEqual(b1, b2);
        assert.strictEqual(b3, b4);
    });
    suite('one to one', function () {
        let server;
        let client;
        let service;
        let ipcService;
        setup(function () {
            service = store.add(new TestService());
            const testServer = store.add(new TestIPCServer());
            server = testServer;
            server.registerChannel(TestChannelId, new TestChannel(service));
            client = store.add(testServer.createConnection('client1'));
            ipcService = new TestChannelClient(client.getChannel(TestChannelId));
        });
        test('call success', async function () {
            const r = await ipcService.marco();
            return assert.strictEqual(r, 'polo');
        });
        test('call error', async function () {
            try {
                await ipcService.error('nice error');
                return assert.fail('should not reach here');
            }
            catch (err) {
                return assert.strictEqual(err.message, 'nice error');
            }
        });
        test('cancel call with cancelled cancellation token', async function () {
            try {
                await ipcService.neverCompleteCT(CancellationToken.Cancelled);
                return assert.fail('should not reach here');
            }
            catch (err) {
                return assert(err.message === 'Canceled');
            }
        });
        test('cancel call with cancellation token (sync)', function () {
            const cts = new CancellationTokenSource();
            const promise = ipcService.neverCompleteCT(cts.token).then(_ => assert.fail('should not reach here'), err => assert(err.message === 'Canceled'));
            cts.cancel();
            return promise;
        });
        test('cancel call with cancellation token (async)', function () {
            const cts = new CancellationTokenSource();
            const promise = ipcService.neverCompleteCT(cts.token).then(_ => assert.fail('should not reach here'), err => assert(err.message === 'Canceled'));
            setTimeout(() => cts.cancel());
            return promise;
        });
        test('listen to events', async function () {
            const messages = [];
            store.add(ipcService.onPong(msg => messages.push(msg)));
            await timeout(0);
            assert.deepStrictEqual(messages, []);
            service.ping('hello');
            await timeout(0);
            assert.deepStrictEqual(messages, ['hello']);
            service.ping('world');
            await timeout(0);
            assert.deepStrictEqual(messages, ['hello', 'world']);
        });
        test('buffers in arrays', async function () {
            const r = await ipcService.buffersLength([VSBuffer.alloc(2), VSBuffer.alloc(3)]);
            return assert.strictEqual(r, 5);
        });
        test('round trips numbers', () => {
            const input = [
                0,
                1,
                -1,
                12345,
                -12345,
                42.6,
                123412341234
            ];
            const writer = new BufferWriter();
            serialize(writer, input);
            assert.deepStrictEqual(deserialize(new BufferReader(writer.buffer)), input);
        });
    });
    suite('one to one (proxy)', function () {
        let server;
        let client;
        let service;
        let ipcService;
        const disposables = new DisposableStore();
        setup(function () {
            service = store.add(new TestService());
            const testServer = disposables.add(new TestIPCServer());
            server = testServer;
            server.registerChannel(TestChannelId, ProxyChannel.fromService(service, disposables));
            client = disposables.add(testServer.createConnection('client1'));
            ipcService = ProxyChannel.toService(client.getChannel(TestChannelId));
        });
        teardown(function () {
            disposables.clear();
        });
        test('call success', async function () {
            const r = await ipcService.marco();
            return assert.strictEqual(r, 'polo');
        });
        test('call error', async function () {
            try {
                await ipcService.error('nice error');
                return assert.fail('should not reach here');
            }
            catch (err) {
                return assert.strictEqual(err.message, 'nice error');
            }
        });
        test('listen to events', async function () {
            const messages = [];
            disposables.add(ipcService.onPong(msg => messages.push(msg)));
            await timeout(0);
            assert.deepStrictEqual(messages, []);
            service.ping('hello');
            await timeout(0);
            assert.deepStrictEqual(messages, ['hello']);
            service.ping('world');
            await timeout(0);
            assert.deepStrictEqual(messages, ['hello', 'world']);
        });
        test('marshalling uri', async function () {
            const uri = URI.file('foobar');
            const r = await ipcService.marshall(uri);
            assert.ok(r instanceof URI);
            return assert.ok(isEqual(r, uri));
        });
        test('buffers in arrays', async function () {
            const r = await ipcService.buffersLength([VSBuffer.alloc(2), VSBuffer.alloc(3)]);
            return assert.strictEqual(r, 5);
        });
    });
    suite('one to one (proxy, extra context)', function () {
        let server;
        let client;
        let service;
        let ipcService;
        const disposables = new DisposableStore();
        setup(function () {
            service = store.add(new TestService());
            const testServer = disposables.add(new TestIPCServer());
            server = testServer;
            server.registerChannel(TestChannelId, ProxyChannel.fromService(service, disposables));
            client = disposables.add(testServer.createConnection('client1'));
            ipcService = ProxyChannel.toService(client.getChannel(TestChannelId), { context: 'Super Context' });
        });
        teardown(function () {
            disposables.clear();
        });
        test('call extra context', async function () {
            const r = await ipcService.context();
            return assert.strictEqual(r, 'Super Context');
        });
    });
    suite('one to many', function () {
        test('all clients get pinged', async function () {
            const service = store.add(new TestService());
            const channel = new TestChannel(service);
            const server = store.add(new TestIPCServer());
            server.registerChannel('channel', channel);
            let client1GotPinged = false;
            const client1 = store.add(server.createConnection('client1'));
            const ipcService1 = new TestChannelClient(client1.getChannel('channel'));
            store.add(ipcService1.onPong(() => client1GotPinged = true));
            let client2GotPinged = false;
            const client2 = store.add(server.createConnection('client2'));
            const ipcService2 = new TestChannelClient(client2.getChannel('channel'));
            store.add(ipcService2.onPong(() => client2GotPinged = true));
            await timeout(1);
            service.ping('hello');
            await timeout(1);
            assert(client1GotPinged, 'client 1 got pinged');
            assert(client2GotPinged, 'client 2 got pinged');
        });
        test('server gets pings from all clients (broadcast channel)', async function () {
            const server = store.add(new TestIPCServer());
            const client1 = server.createConnection('client1');
            const clientService1 = store.add(new TestService());
            const clientChannel1 = new TestChannel(clientService1);
            client1.registerChannel('channel', clientChannel1);
            const pings = [];
            const channel = server.getChannel('channel', () => true);
            const service = new TestChannelClient(channel);
            store.add(service.onPong(msg => pings.push(msg)));
            await timeout(1);
            clientService1.ping('hello 1');
            await timeout(1);
            assert.deepStrictEqual(pings, ['hello 1']);
            const client2 = server.createConnection('client2');
            const clientService2 = store.add(new TestService());
            const clientChannel2 = new TestChannel(clientService2);
            client2.registerChannel('channel', clientChannel2);
            await timeout(1);
            clientService2.ping('hello 2');
            await timeout(1);
            assert.deepStrictEqual(pings, ['hello 1', 'hello 2']);
            client1.dispose();
            clientService1.ping('hello 1');
            await timeout(1);
            assert.deepStrictEqual(pings, ['hello 1', 'hello 2']);
            await timeout(1);
            clientService2.ping('hello again 2');
            await timeout(1);
            assert.deepStrictEqual(pings, ['hello 1', 'hello 2', 'hello again 2']);
            client2.dispose();
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXBjLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3BhcnRzL2lwYy90ZXN0L2NvbW1vbi9pcGMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3RELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUN4RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDeEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUM3RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNoRCxPQUFPLEVBQUUsWUFBWSxFQUFFLFlBQVksRUFBeUIsV0FBVyxFQUFxQyxTQUFTLEVBQUUsU0FBUyxFQUFrQixZQUFZLEVBQUUsU0FBUyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDdk0sT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0YsTUFBTSxhQUFhO0lBQW5CO1FBRVMsY0FBUyxHQUFHLElBQUksQ0FBQztRQUNqQixZQUFPLEdBQWUsRUFBRSxDQUFDO1FBRWhCLGVBQVUsR0FBRyxJQUFJLE9BQU8sQ0FBVztZQUNuRCxxQkFBcUIsRUFBRSxHQUFHLEVBQUU7Z0JBQzNCLEtBQUssTUFBTSxNQUFNLElBQUksSUFBSSxDQUFD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