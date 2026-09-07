/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostClientConnectionKind } from '../../common/agentHostTelemetry.js';
import { ReconnectingRelayTransport, RelayTransport, type IRelayChannel, type IRelayConnectionHandle, type IRelayMessage } from '../../common/relayTransport.js';
import { NonReconnectableTransportError } from '../../common/state/sessionTransport.js';
import { MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD, MALFORMED_FRAMES_LOG_CAP } from '../../common/transportConstants.js';

/**
 * Minimal SSH-shaped relay channel for testing the transport.
 */
class MockRelayChannel implements IRelayChannel {
	private readonly _onDidRelayMessage = new Emitter<IRelayMessage>();
	readonly onDidRelayMessage = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = new Emitter<string>();
	readonly onDidRelayClose = this._onDidRelayClose.event;

	readonly sentMessages: { connectionId: string; message: string }[] = [];

	async relaySend(connectionId: string, message: string): Promise<void> {
		this.sentMessages.push({ connectionId, message });
	}

	// Test helpers
	fireRelayMessage(msg: IRelayMessage): void {
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

class RecordingLogService extends NullLogService {
	readonly warnings: string[] = [];
	readonly errors: string[] = [];

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push([message, ...args.map(arg => String(arg))].join(' '));
	}

	override error(message: string | Error, ...args: unknown[]): void {
		this.errors.push([message, ...args.map(arg => String(arg))].join(' '));
	}
}

suite('RelayTransport', () => {

	const disposables = new DisposableStore();
	let mockChannel: MockRelayChannel;

	setup(() => {
		mockChannel = new MockRelayChannel();
		disposables.add({ dispose: () => mockChannel.dispose() });
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('receives messages matching connectionId', () => {
		const transport = disposables.add(new RelayTransport('conn-1', mockChannel, undefined, new NullLogService(), '[SSHRelayTransport]', AgentHostClientConnectionKind.SSH));

		const received: unknown[] = [];
		disposables.add(transport.onMessage(msg => received.push(msg)));

		mockChannel.fireRelayMessage({ connectionId: 'conn-1', data: '{"jsonrpc":"2.0","id":1}' });

		assert.strictEqual(received.length, 1);
		assert.deepStrictEqual(received[0], { jsonrpc: '2.0', id: 1 });
	});

	test('ignores messages for other connectionIds', () => {
		const transport = disposables.add(new RelayTransport('conn-1', mockChannel, undefined, new NullLogService(), '[SSHRelayTransport]', AgentHostClientConnectionKind.SSH));

		const received: unknown[] = [];
		disposables.add(transport.onMessage(msg => received.push(msg)));

		mockChannel.fireRelayMessage({ connectionId: 'conn-2', data: '{"jsonrpc":"2.0","id":1}' });

		assert.strictEqual(received.length, 0);
	});

	test('drops malformed JSON messages', () => {
		const transport = disposables.add(new RelayTransport('conn-1', mockChannel, undefined, new NullLogService(), '[SSHRelayTransport]', AgentHostClientConnectionKind.SSH));

		const received: unknown[] = [];
		disposables.add(transport.onMessage(msg => received.push(msg)));

		// Should not throw
		mockChannel.fireRelayMessage({ connectionId: 'conn-1', data: 'not-json{{{' });

		assert.strictEqual(received.length, 0);
	});

	test('caps malformed-frame warning logs', () => {
		const logService = new RecordingLogService();
		disposables.add(new RelayTransport('conn-1', mockChannel, undefined, logService, '[SSHRelayTransport]', AgentHostClientConnectionKind.SSH));

		for (let index = 0; index < MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD; index++) {
			mockChannel.fireRelayMessage({ connectionId: 'conn-1', data: 'not-json{{{' });
		}

		assert.strictEqual(logService.warnings.length, MALFORMED_FRAMES_LOG_CAP);
		assert.ok(logService.warnings.every(message => message.startsWith('[SSHRelayTransport] Malformed frame #')));
		assert.ok(logService.warnings[0].includes('(len=11): not-json{{{'));
	});

	test('fires onClose once after too many malformed frames', () => {
		const logService = new RecordingLogService();
		const transport = disposables.add(new RelayTransport('conn-1', mockChannel, undefined, logService, '[SSHRelayTransport]', AgentHostClientConnectionKind.SSH));

		let closeCount = 0;
		disposables.add(transport.onClose(() => closeCount++));

		for (let index = 0; index < MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD + 2; index++) {
			mockChannel.fireRelayMessage({ connectionId: 'conn-1', data: 'not-json{{{' });
		}

		assert.deepStrictEqual({ closeCount, warnings: logService.warnings.length }, { closeCount: 1, warnings: MALFORMED_FRAMES_LOG_CAP + 1 });
		assert.strictEqual(logService.warnings.at(-1), '[SSHRelayTransport] Malformed frame threshold exceeded; closing relay.');
	});

	test('fires onClose when relay closes for matching connectionId', () => {
		const transport = disposables.add(new RelayTransport('conn-1', mockChannel, undefined, new NullLogService(), '[SSHRelayTransport]', AgentHostClientConnectionKind.SSH));

		let closed = false;
		disposables.add(transport.onClose(() => { closed = true; }));

		mockChannel.fireRelayClose('conn-1');

		assert.strictEqual(closed, true);
	});

	test('does not fire onClose for other connectionIds', () => {
		const transport = disposables.add(new RelayTransport('conn-1', mockChannel, undefined, new NullLogService(), '[SSHRelayTransport]', AgentHostClientConnectionKind.SSH));

		let closed = false;
		disposables.add(transport.onClose(() => { closed = true; }));

		mockChannel.fireRelayClose('conn-2');

		assert.strictEqual(closed, false);
	});

	test('send() calls relaySend with correct connectionId', async () => {
		const transport = disposables.add(new RelayTransport('conn-1', mockChannel, undefined, new NullLogService(), '[SSHRelayTransport]', AgentHostClientConnectionKind.SSH));

		const msg = { jsonrpc: '2.0' as const, method: 'test', id: 42 };
		transport.send(msg);

		// Give the async relaySend a tick to register
		await new Promise<void>(r => queueMicrotask(r));

		assert.strictEqual(mockChannel.sentMessages.length, 1);
		assert.strictEqual(mockChannel.sentMessages[0].connectionId, 'conn-1');
		assert.deepStrictEqual(JSON.parse(mockChannel.sentMessages[0].message), msg);
	});

	test('receives multiple messages in order', () => {
		const transport = disposables.add(new RelayTransport('conn-1', mockChannel, undefined, new NullLogService(), '[SSHRelayTransport]', AgentHostClientConnectionKind.SSH));

		const received: unknown[] = [];
		disposables.add(transport.onMessage(msg => received.push(msg)));

		mockChannel.fireRelayMessage({ connectionId: 'conn-1', data: '{"id":1}' });
		mockChannel.fireRelayMessage({ connectionId: 'conn-1', data: '{"id":2}' });
		mockChannel.fireRelayMessage({ connectionId: 'conn-1', data: '{"id":3}' });

		assert.strictEqual(received.length, 3);
		assert.deepStrictEqual(received, [{ id: 1 }, { id: 2 }, { id: 3 }]);
	});

	test('no events after dispose', () => {
		const transport = disposables.add(new RelayTransport('conn-1', mockChannel, undefined, new NullLogService(), '[SSHRelayTransport]', AgentHostClientConnectionKind.SSH));

		const received: unknown[] = [];
		let closed = false;
		disposables.add(transport.onMessage(msg => received.push(msg)));
		disposables.add(transport.onClose(() => { closed = true; }));

		transport.dispose();

		mockChannel.fireRelayMessage({ connectionId: 'conn-1', data: '{"id":1}' });
		mockChannel.fireRelayClose('conn-1');

		assert.strictEqual(received.length, 0);
		assert.strictEqual(closed, false);
	});
});

suite('ReconnectingRelayTransport', () => {

	const disposables = new DisposableStore();
	let mockChannel: MockRelayChannel;

	setup(() => {
		mockChannel = new MockRelayChannel();
		disposables.add({ dispose: () => mockChannel.dispose() });
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('adopts and routes messages only for its established connectionId', async () => {
		const transport = disposables.add(new ReconnectingRelayTransport(
			async () => ({ connectionId: 'conn-1' }),
			mockChannel,
			() => undefined,
			new NullLogService(),
			'[ReconnectingRelayTransport]',
			AgentHostClientConnectionKind.SSH
		));
		const received: unknown[] = [];
		disposables.add(transport.onMessage(message => received.push(message)));

		mockChannel.fireRelayMessage({ connectionId: 'conn-1', data: '{"id":"before-connect"}' });
		mockChannel.fireRelayMessage({ connectionId: 'conn-2', data: '{"id":"other"}' });
		await transport.connect();
		mockChannel.fireRelayMessage({ connectionId: 'conn-1', data: '{"id":"connected"}' });
		mockChannel.fireRelayMessage({ connectionId: 'conn-2', data: '{"id":"other"}' });

		assert.deepStrictEqual(received, [{ id: 'connected' }]);
	});

	test('warns and drops messages sent before adopting a channel', () => {
		const logService = new RecordingLogService();
		const transport = disposables.add(new ReconnectingRelayTransport(
			async () => ({ connectionId: 'conn-1' }),
			mockChannel,
			() => undefined,
			logService,
			'[ReconnectingRelayTransport]',
			AgentHostClientConnectionKind.SSH
		));

		transport.send({ jsonrpc: '2.0', method: 'test', id: 42 });

		assert.deepStrictEqual({ sentMessages: mockChannel.sentMessages, warnings: logService.warnings }, {
			sentMessages: [],
			warnings: ['[ReconnectingRelayTransport] send before the relay channel was established; dropping message'],
		});
	});

	test('closes its established channel once when disposed', async () => {
		let closeCount = 0;
		const transport = disposables.add(new ReconnectingRelayTransport(
			async () => ({
				connectionId: 'conn-1',
				close: async () => { closeCount++; },
			}),
			mockChannel,
			() => undefined,
			new NullLogService(),
			'[ReconnectingRelayTransport]',
			AgentHostClientConnectionKind.SSH
		));

		await transport.connect();
		transport.dispose();

		assert.strictEqual(closeCount, 1);
	});

	test('does not close a seeded channel with no close handle', async () => {
		const logService = new RecordingLogService();
		const transport = disposables.add(new ReconnectingRelayTransport(
			async () => ({ connectionId: 'conn-1' }),
			mockChannel,
			() => undefined,
			logService,
			'[ReconnectingRelayTransport]',
			AgentHostClientConnectionKind.WSL
		));

		await transport.connect();
		transport.dispose();
		await new Promise<void>(resolve => queueMicrotask(resolve));

		assert.deepStrictEqual(logService.errors, []);
	});

	test('closes a channel established after disposal and rejects connect', async () => {
		let resolveEstablish: (connectionHandle: IRelayConnectionHandle) => void = () => { throw new Error('Unexpected establish resolution'); };
		const establish = new Promise<IRelayConnectionHandle>(resolve => {
			resolveEstablish = resolve;
		});
		let closeCount = 0;
		const transport = disposables.add(new ReconnectingRelayTransport(
			async () => establish,
			mockChannel,
			() => undefined,
			new NullLogService(),
			'[ReconnectingRelayTransport]',
			AgentHostClientConnectionKind.SSH
		));

		const connectPromise = transport.connect();
		transport.dispose();
		resolveEstablish({
			connectionId: 'conn-1',
			close: async () => { closeCount++; },
		});

		await assert.rejects(connectPromise);
		assert.strictEqual(closeCount, 1);
	});

	test('preserves NonReconnectableTransportError from establish', async () => {
		const error = new NonReconnectableTransportError('terminal failure');
		const transport = disposables.add(new ReconnectingRelayTransport(
			async () => { throw error; },
			mockChannel,
			() => undefined,
			new NullLogService(),
			'[ReconnectingRelayTransport]',
			AgentHostClientConnectionKind.SSH
		));

		await assert.rejects(transport.connect(), caughtError => caughtError === error);
	});

	test('establishes only one channel when connect is called twice', async () => {
		let establishCount = 0;
		const transport = disposables.add(new ReconnectingRelayTransport(
			async () => {
				establishCount++;
				return { connectionId: 'conn-1' };
			},
			mockChannel,
			() => undefined,
			new NullLogService(),
			'[ReconnectingRelayTransport]',
			AgentHostClientConnectionKind.SSH
		));

		await Promise.all([transport.connect(), transport.connect()]);

		assert.strictEqual(establishCount, 1);
	});
});
