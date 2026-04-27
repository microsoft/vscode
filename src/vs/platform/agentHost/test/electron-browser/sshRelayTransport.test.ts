/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SSHRelayTransport } from '../../electron-browser/sshRelayTransport.js';
import type { ISSHRelayMessage, ISSHRemoteAgentHostMainService, ISSHConnectProgress, ISSHConnectResult, ISSHAgentHostConfig, ISSHResolvedConfig } from '../../common/sshRemoteAgentHost.js';

/**
 * Minimal mock of ISSHRemoteAgentHostMainService for testing the relay transport.
 */
class MockSSHMainService {
	private readonly _onDidRelayMessage = new Emitter<ISSHRelayMessage>();
	readonly onDidRelayMessage = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = new Emitter<string>();
	readonly onDidRelayClose = this._onDidRelayClose.event;

	readonly onDidChangeConnections = Event.None;
	readonly onDidCloseConnection = Event.None;
	readonly onDidReportConnectProgress = Event.None as Event<ISSHConnectProgress>;

	readonly sentMessages: { connectionId: string; message: string }[] = [];

	async relaySend(connectionId: string, message: string): Promise<void> {
		this.sentMessages.push({ connectionId, message });
	}

	async connect(_config: ISSHAgentHostConfig): Promise<ISSHConnectResult> {
		throw new Error('Not implemented');
	}
	async disconnect(_host: string): Promise<void> { }
	async listSSHConfigHosts(): Promise<string[]> { return []; }
	async ensureUserSSHConfig(): Promise<URI> { return URI.file('/tmp/ssh-config'); }
	async listSSHConfigFiles(): Promise<URI[]> { return [URI.file('/tmp/ssh-config')]; }
	async resolveSSHConfig(_host: string): Promise<ISSHResolvedConfig> {
		throw new Error('Not implemented');
	}
	async reconnect(_sshConfigHost: string, _name: string): Promise<ISSHConnectResult> {
		throw new Error('Not implemented');
	}

	// Test helpers
	fireRelayMessage(msg: ISSHRelayMessage): void {
		this._onDidRelayMessage.fire(msg);
	}

	fireRelayClose(connectionId: string): void {
		this._onDidRelayClose.fire(connectionId);
	}

	dispose(): void {
		this._onDidRelayMessage.dispose();
		this._onDidRelayClose.dispose();
	}
}

suite('SSHRelayTransport', () => {

	const disposables = new DisposableStore();
	let mockService: MockSSHMainService;

	setup(() => {
		mockService = new MockSSHMainService();
		disposables.add({ dispose: () => mockService.dispose() });
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('receives messages matching connectionId', () => {
		const transport = disposables.add(new SSHRelayTransport('conn-1', mockService as unknown as ISSHRemoteAgentHostMainService));

		const received: unknown[] = [];
		disposables.add(transport.onMessage(msg => received.push(msg)));

		mockService.fireRelayMessage({ connectionId: 'conn-1', data: '{"jsonrpc":"2.0","id":1}' });

		assert.strictEqual(received.length, 1);
		assert.deepStrictEqual(received[0], { jsonrpc: '2.0', id: 1 });
	});

	test('ignores messages for other connectionIds', () => {
		const transport = disposables.add(new SSHRelayTransport('conn-1', mockService as unknown as ISSHRemoteAgentHostMainService));

		const received: unknown[] = [];
		disposables.add(transport.onMessage(msg => received.push(msg)));

		mockService.fireRelayMessage({ connectionId: 'conn-2', data: '{"jsonrpc":"2.0","id":1}' });

		assert.strictEqual(received.length, 0);
	});

	test('drops malformed JSON messages', () => {
		const transport = disposables.add(new SSHRelayTransport('conn-1', mockService as unknown as ISSHRemoteAgentHostMainService));

		const received: unknown[] = [];
		disposables.add(transport.onMessage(msg => received.push(msg)));

		// Should not throw
		mockService.fireRelayMessage({ connectionId: 'conn-1', data: 'not-json{{{' });

		assert.strictEqual(received.length, 0);
	});

	test('fires onClose when relay closes for matching connectionId', () => {
		const transport = disposables.add(new SSHRelayTransport('conn-1', mockService as unknown as ISSHRemoteAgentHostMainService));

		let closed = false;
		disposables.add(transport.onClose(() => { closed = true; }));

		mockService.fireRelayClose('conn-1');

		assert.strictEqual(closed, true);
	});

	test('does not fire onClose for other connectionIds', () => {
		const transport = disposables.add(new SSHRelayTransport('conn-1', mockService as unknown as ISSHRemoteAgentHostMainService));

		let closed = false;
		disposables.add(transport.onClose(() => { closed = true; }));

		mockService.fireRelayClose('conn-2');

		assert.strictEqual(closed, false);
	});

	test('send() calls relaySend with correct connectionId', async () => {
		const transport = disposables.add(new SSHRelayTransport('conn-1', mockService as unknown as ISSHRemoteAgentHostMainService));

		const msg = { jsonrpc: '2.0' as const, method: 'test', id: 42 };
		transport.send(msg as never);

		// Give the async relaySend a tick to register
		await new Promise<void>(r => queueMicrotask(r));

		assert.strictEqual(mockService.sentMessages.length, 1);
		assert.strictEqual(mockService.sentMessages[0].connectionId, 'conn-1');
		assert.deepStrictEqual(JSON.parse(mockService.sentMessages[0].message), msg);
	});

	test('receives multiple messages in order', () => {
		const transport = disposables.add(new SSHRelayTransport('conn-1', mockService as unknown as ISSHRemoteAgentHostMainService));

		const received: unknown[] = [];
		disposables.add(transport.onMessage(msg => received.push(msg)));

		mockService.fireRelayMessage({ connectionId: 'conn-1', data: '{"id":1}' });
		mockService.fireRelayMessage({ connectionId: 'conn-1', data: '{"id":2}' });
		mockService.fireRelayMessage({ connectionId: 'conn-1', data: '{"id":3}' });

		assert.strictEqual(received.length, 3);
		assert.deepStrictEqual(received, [{ id: 1 }, { id: 2 }, { id: 3 }]);
	});

	test('no events after dispose', () => {
		const transport = disposables.add(new SSHRelayTransport('conn-1', mockService as unknown as ISSHRemoteAgentHostMainService));

		const received: unknown[] = [];
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
