/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SSHRelayTransport } from '../../electron-browser/sshRelayTransport.js';
/**
 * Minimal mock of ISSHRemoteAgentHostMainService for testing the relay transport.
 */
class MockSSHMainService {
    constructor() {
        this._onDidRelayMessage = new Emitter();
        this.onDidRelayMessage = this._onDidRelayMessage.event;
        this._onDidRelayClose = new Emitter();
        this.onDidRelayClose = this._onDidRelayClose.event;
        this.onDidChangeConnections = Event.None;
        this.onDidCloseConnection = Event.None;
        this.onDidReportConnectProgress = Event.None;
        this.sentMessages = [];
    }
    async relaySend(connectionId, message) {
        this.sentMessages.push({ connectionId, message });
    }
    async connect(_config) {
        throw new Error('Not implemented');
    }
    async disconnect(_host) { }
    async listSSHConfigHosts() { return []; }
    async resolveSSHConfig(_host) {
        throw new Error('Not implemented');
    }
    async reconnect(_sshConfigHost, _name) {
        throw new Error('Not implemented');
    }
    // Test helpers
    fireRelayMessage(msg) {
        this._onDidRelayMessage.fire(msg);
    }
    fireRelayClose(connectionId) {
        this._onDidRelayClose.fire(connectionId);
    }
    dispose() {
        this._onDidRelayMessage.dispose();
        this._onDidRelayClose.dispose();
    }
}
suite('SSHRelayTransport', () => {
    const disposables = new DisposableStore();
    let mockService;
    setup(() => {
        mockService = new MockSSHMainService();
        disposables.add({ dispose: () => mockService.dispose() });
    });
    teardown(() => disposables.clear());
    ensureNoDisposablesAreLeakedInTestSuite();
    test('receives messages matching connectionId', () => {
        const transport = disposables.add(new SSHRelayTransport('conn-1', mockService));
        const received = [];
        disposables.add(transport.onMessage(msg => received.push(msg)));
        mockService.fireRelayMessage({ connectionId: 'conn-1', data: '{"jsonrpc":"2.0","id":1}' });
        assert.strictEqual(received.length, 1);
        assert.deepStrictEqual(received[0], { jsonrpc: '2.0', id: 1 });
    });
    test('ignores messages for other connectionIds', () => {
        const transport = disposables.add(new SSHRelayTransport('conn-1', mockService));
        const received = [];
        disposables.add(transport.onMessage(msg => received.push(msg)));
        mockService.fireRelayMessage({ connectionId: 'conn-2', data: '{"jsonrpc":"2.0","id":1}' });
        assert.strictEqual(received.length, 0);
    });
    test('drops malformed JSON messages', () => {
        const transport = disposables.add(new SSHRelayTransport('conn-1', mockService));
        const received = [];
        disposables.add(transport.onMessage(msg => received.push(msg)));
        // Should not throw
        mockService.fireRelayMessage({ connectionId: 'conn-1', data: 'not-json{{{' });
        assert.strictEqual(received.length, 0);
    });
    test('fires onClose when relay closes for matching connectionId', () => {
        const transport = disposables.add(new SSHRelayTransport('conn-1', mockService));
        let closed = false;
        disposables.add(transport.onClose(() => { closed = true; }));
        mockService.fireRelayClose('conn-1');
        assert.strictEqual(closed, true);
    });
    test('does not fire onClose for other connectionIds', () => {
        const transport = disposables.add(new SSHRelayTransport('conn-1', mockService));
        let closed = false;
        disposables.add(transport.onClose(() => { closed = true; }));
        mockService.fireRelayClose('conn-2');
        assert.strictEqual(closed, false);
    });
    test('send() calls relaySend with correct connectionId', async () => {
        const transport = disposables.add(new SSHRelayTransport('conn-1', mockService));
        const msg = { jsonrpc: '2.0', method: 'test', id: 42 };
        transport.send(msg);
        // Give the async relaySend a tick to register
        await new Promise(r => queueMicrotask(r));
        assert.strictEqual(mockService.sentMessages.length, 1);
        assert.strictEqual(mockService.sentMessages[0].connectionId, 'conn-1');
        assert.deepStrictEqual(JSON.parse(mockService.sentMessages[0].message), msg);
    });
    test('receives multiple messages in order', () => {
        const transport = disposables.add(new SSHRelayTransport('conn-1', mockService));
        const received = [];
        disposables.add(transport.onMessage(msg => received.push(msg)));
        mockService.fireRelayMessage({ connectionId: 'conn-1', data: '{"id":1}' });
        mockService.fireRelayMessage({ connectionId: 'conn-1', data: '{"id":2}' });
        mockService.fireRelayMessage({ connectionId: 'conn-1', data: '{"id":3}' });
        assert.strictEqual(received.length, 3);
        assert.deepStrictEqual(received, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    });
    test('no events after dispose', () => {
        const transport = disposables.add(new SSHRelayTransport('conn-1', mockService));
        const received = [];
        let closed = false;
        disposables.add(transport.onMessage(msg => received.push(msg)));
        disposables.add(transport.onClose(() => { closed = true; }));
        transport.dispose();
        mockService.fireRelayMessage({ connectionId: 'conn-1', data: '{"id":1}' });
        mockService.fireRelayClose('conn-1');
        assert.strictEqual(received.length, 0);
        assert.strictEqual(closed, false);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3NoUmVsYXlUcmFuc3BvcnQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvc3NoUmVsYXlUcmFuc3BvcnQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFHaEY7O0dBRUc7QUFDSCxNQUFNLGtCQUFrQjtJQUF4QjtRQUNrQix1QkFBa0IsR0FBRyxJQUFJLE9BQU8sRUFBb0IsQ0FBQztRQUM3RCxzQkFBaUIsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDO1FBRTFDLHFCQUFnQixHQUFHLElBQUksT0FBTyxFQUFVLENBQUM7UUFDakQsb0JBQWUsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsS0FBSyxDQUFDO1FBRTlDLDJCQUFzQixHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDcEMseUJBQW9CLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQztRQUNsQywrQkFBMEIsR0FBRyxLQUFLLENBQUMsSUFBa0MsQ0FBQztRQUV0RSxpQkFBWSxHQUFnRCxFQUFFLENBQUM7SUErQnpFLENBQUM7SUE3QkEsS0FBSyxDQUFDLFNBQVMsQ0FBQyxZQUFvQixFQUFFLE9BQWU7UUFDcEQsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsRUFBRSxZQUFZLEVBQUUs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