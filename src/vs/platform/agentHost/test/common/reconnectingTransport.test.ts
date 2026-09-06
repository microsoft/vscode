/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostClientConnectionKind } from '../../common/agentHostTelemetry.js';
import { type IEstablishedTransport, ReconnectingTransport } from '../../common/reconnectingTransport.js';
import type { AhpServerNotification, JsonRpcNotification, JsonRpcParseErrorResponse, JsonRpcRequest, JsonRpcResponse, ProtocolMessage } from '../../common/state/sessionProtocol.js';
import { NonReconnectableTransportError, type IProtocolTransport } from '../../common/state/sessionTransport.js';

type TransportMessage = ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcParseErrorResponse | JsonRpcResponse | JsonRpcRequest;

class TestProtocolTransport extends Disposable implements IProtocolTransport {
	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	readonly sentMessages: TransportMessage[] = [];
	disposeCount = 0;

	send(message: TransportMessage): void {
		this.sentMessages.push(message);
	}

	fireMessage(message: ProtocolMessage): void {
		this._onMessage.fire(message);
	}

	fireClose(): void {
		this._onClose.fire();
	}

	override dispose(): void {
		if (!this._store.isDisposed) {
			this.disposeCount++;
		}
		super.dispose();
	}
}

class RecordingLogService extends NullLogService {
	readonly warnings: string[] = [];

	override warn(message: string, ...args: unknown[]): void {
		this.warnings.push([message, ...args.map(arg => String(arg))].join(' '));
	}
}

suite('ReconnectingTransport', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards messages and close events from the established transport', async () => {
		const innerTransport = new TestProtocolTransport();
		const transport = disposables.add(new ReconnectingTransport(
			async () => ({ transport: innerTransport }),
			new NullLogService(),
			'[ReconnectingTransport]',
			AgentHostClientConnectionKind.SSH,
		));
		const received: ProtocolMessage[] = [];
		let closeCount = 0;
		disposables.add(transport.onMessage(message => received.push(message)));
		disposables.add(transport.onClose(() => closeCount++));

		await transport.connect();
		transport.send({ jsonrpc: '2.0', method: 'outbound', id: 2 });
		innerTransport.fireMessage({ jsonrpc: '2.0', id: 1, result: {} });
		innerTransport.fireClose();

		assert.deepStrictEqual({ received, sentMessages: innerTransport.sentMessages, closeCount }, {
			received: [{ jsonrpc: '2.0', id: 1, result: {} }],
			sentMessages: [{ jsonrpc: '2.0', method: 'outbound', id: 2 }],
			closeCount: 1,
		});
	});

	test('warns and drops messages before an inner transport is adopted', () => {
		const logService = new RecordingLogService();
		const transport = disposables.add(new ReconnectingTransport(
			async () => { throw new Error('Unexpected establish'); },
			logService,
			'[ReconnectingTransport]',
		));

		transport.send({ jsonrpc: '2.0', method: 'test', id: 1 });

		assert.deepStrictEqual(logService.warnings, ['[ReconnectingTransport] send before the transport was established; dropping message']);
	});

	test('closes the established handle once and disposes its inner transport', async () => {
		const innerTransport = new TestProtocolTransport();
		let closeCount = 0;
		const transport = disposables.add(new ReconnectingTransport(
			async () => ({
				transport: innerTransport,
				close: async () => { closeCount++; },
			}),
			new NullLogService(),
			'[ReconnectingTransport]',
		));

		await transport.connect();
		transport.dispose();

		assert.deepStrictEqual({ closeCount, disposeCount: innerTransport.disposeCount }, { closeCount: 1, disposeCount: 1 });
	});

	test('does not require teardown for caller-owned resources', async () => {
		const innerTransport = new TestProtocolTransport();
		const transport = disposables.add(new ReconnectingTransport(
			async () => ({ transport: innerTransport }),
			new NullLogService(),
			'[ReconnectingTransport]',
		));

		await transport.connect();
		transport.dispose();

		assert.strictEqual(innerTransport.disposeCount, 1);
	});

	test('releases a late establishment and rejects connect after disposal', async () => {
		let resolveEstablish: (establishedTransport: IEstablishedTransport) => void = () => { throw new Error('Unexpected establish resolution'); };
		const establish = new Promise<IEstablishedTransport>(resolve => {
			resolveEstablish = resolve;
		});
		const innerTransport = new TestProtocolTransport();
		let closeCount = 0;
		const transport = disposables.add(new ReconnectingTransport(
			async () => establish,
			new NullLogService(),
			'[ReconnectingTransport]',
		));

		const connectPromise = transport.connect();
		transport.dispose();
		resolveEstablish({
			transport: innerTransport,
			close: async () => { closeCount++; },
		});

		await assert.rejects(connectPromise);
		assert.deepStrictEqual({ closeCount, disposeCount: innerTransport.disposeCount }, { closeCount: 1, disposeCount: 1 });
	});

	test('preserves NonReconnectableTransportError from establish', async () => {
		const error = new NonReconnectableTransportError('terminal failure');
		const transport = disposables.add(new ReconnectingTransport(
			async () => { throw error; },
			new NullLogService(),
			'[ReconnectingTransport]',
		));

		await assert.rejects(transport.connect(), caughtError => caughtError === error);
	});

	test('establishes one inner transport when connect is called twice', async () => {
		let establishCount = 0;
		const innerTransport = new TestProtocolTransport();
		const transport = disposables.add(new ReconnectingTransport(
			async () => {
				establishCount++;
				return { transport: innerTransport };
			},
			new NullLogService(),
			'[ReconnectingTransport]',
		));

		await Promise.all([transport.connect(), transport.connect()]);

		assert.strictEqual(establishCount, 1);
	});
});
