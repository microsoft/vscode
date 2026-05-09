/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TunnelRelayTransport } from '../../electron-browser/tunnelRelayTransport.js';
import type { ITunnelAgentHostMainService, ITunnelInfo, ITunnelRelayMessage } from '../../common/tunnelAgentHost.js';

class MockTunnelMainService {
	private readonly _onDidRelayMessage = new Emitter<ITunnelRelayMessage>();
	readonly onDidRelayMessage = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = new Emitter<string>();
	readonly onDidRelayClose = this._onDidRelayClose.event;

	readonly sentMessages: { connectionId: string; message: string }[] = [];
	relaySendError: Error | undefined;
	disconnected: string[] = [];

	async listTunnels(): Promise<ITunnelInfo[]> { return []; }
	async connect(): Promise<never> { throw new Error('Not implemented'); }

	async relaySend(connectionId: string, message: string): Promise<void> {
		if (this.relaySendError) {
			throw this.relaySendError;
		}
		this.sentMessages.push({ connectionId, message });
	}

	async disconnect(connectionId: string): Promise<void> {
		this.disconnected.push(connectionId);
	}

	fireRelayMessage(msg: ITunnelRelayMessage): void {
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

suite('TunnelRelayTransport', () => {

	const disposables = new DisposableStore();
	let mockService: MockTunnelMainService;

	setup(() => {
		mockService = new MockTunnelMainService();
		disposables.add({ dispose: () => mockService.dispose() });
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('receives messages matching connectionId', () => {
		const transport = disposables.add(new TunnelRelayTransport('conn-1', mockService as unknown as ITunnelAgentHostMainService));

		const received: unknown[] = [];
		disposables.add(transport.onMessage(msg => received.push(msg)));

		mockService.fireRelayMessage({ connectionId: 'conn-1', data: '{"jsonrpc":"2.0","id":1}' });
		mockService.fireRelayMessage({ connectionId: 'conn-2', data: '{"jsonrpc":"2.0","id":2}' });

		assert.deepStrictEqual(received, [{ jsonrpc: '2.0', id: 1 }]);
	});

	test('fires onClose once for relay close and send failure', async () => {
		const transport = disposables.add(new TunnelRelayTransport('conn-1', mockService as unknown as ITunnelAgentHostMainService));
		mockService.relaySendError = new Error('relay is gone');

		let closeCount = 0;
		disposables.add(transport.onClose(() => closeCount++));
		const closed = Event.toPromise(transport.onClose);

		transport.send({ jsonrpc: '2.0', method: 'test', params: {} } as never);
		await closed;
		mockService.fireRelayClose('conn-1');

		assert.strictEqual(closeCount, 1);
	});

	test('dispose disconnects relay', () => {
		const transport = disposables.add(new TunnelRelayTransport('conn-1', mockService as unknown as ITunnelAgentHostMainService));

		transport.dispose();

		assert.deepStrictEqual(mockService.disconnected, ['conn-1']);
	});
});
