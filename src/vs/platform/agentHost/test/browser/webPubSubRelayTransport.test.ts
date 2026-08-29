/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IWebSocketLike, WebPubSubRelayTransport } from '../../browser/webPubSubRelayTransport.js';

const BROADCAST = 'user.u1.env.e1.client.c1.broadcast';
const TO_CLIENT = 'user.u1.env.e1.client.c1.to-client';
const TO_HOST = 'user.u1.env.e1.client.c1.to-host';

/** A fake WebSocket the test drives directly. */
class FakeWebSocket implements IWebSocketLike {
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: ((event: { code: number; reason: string }) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;

	readonly sent: unknown[] = [];
	closed = false;

	send(data: string): void {
		this.sent.push(JSON.parse(data));
	}
	close(): void {
		this.closed = true;
	}

	/** Deliver an inbound JSON frame. */
	emit(frame: unknown): void {
		this.onmessage?.({ data: JSON.stringify(frame) });
	}
	emitClose(code = 1000, reason = ''): void {
		this.onclose?.({ code, reason });
	}
	emitError(): void {
		this.onerror?.(undefined);
	}

	/** Frames sent to the wire of the given WPS command `type`. */
	sentOfType(type: string): Array<Record<string, unknown>> {
		return this.sent.filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null && (f as Record<string, unknown>)['type'] === type);
	}
}

suite('WebPubSubRelayTransport', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTransport(fake: FakeWebSocket): WebPubSubRelayTransport {
		return store.add(new WebPubSubRelayTransport({
			url: 'wss://wps.example/client/hubs/h?access_token=tok&clientId=c1',
			toHostGroup: TO_HOST,
			joinGroups: [BROADCAST, TO_CLIENT],
			webSocketFactory: () => fake,
		}));
	}

	/** Drive the handshake to completion: connected → joinGroup acks. */
	async function connectHandshake(transport: WebPubSubRelayTransport, fake: FakeWebSocket): Promise<void> {
		const connected = transport.connect();
		fake.emit({ type: 'system', event: 'connected' });
		for (const join of fake.sentOfType('joinGroup')) {
			fake.emit({ type: 'ack', ackId: join['ackId'], success: true });
		}
		await connected;
	}

	test('completes the handshake by joining broadcast + to_client and awaiting acks', async () => {
		const fake = new FakeWebSocket();
		const transport = createTransport(fake);
		await connectHandshake(transport, fake);

		assert.deepStrictEqual(
			fake.sentOfType('joinGroup').map(f => f['group']),
			[BROADCAST, TO_CLIENT],
		);
		assert.strictEqual(transport.isOpen, true);
	});

	test('rejects the connect when a joinGroup ack reports failure', async () => {
		const fake = new FakeWebSocket();
		const transport = createTransport(fake);
		const connected = transport.connect();
		fake.emit({ type: 'system', event: 'connected' });
		const firstJoin = fake.sentOfType('joinGroup')[0];
		fake.emit({ type: 'ack', ackId: firstJoin['ackId'], success: false });
		await assert.rejects(() => connected, /joinGroup failed/);
	});

	test('rejects the connect when the socket closes during the handshake', async () => {
		const fake = new FakeWebSocket();
		const transport = createTransport(fake);
		const connected = transport.connect();
		fake.emitClose(1006, 'gone');
		await assert.rejects(() => connected, /closed before connection/);
	});

	test('surfaces an inbound group payload as an onMessage event', async () => {
		const fake = new FakeWebSocket();
		const transport = createTransport(fake);
		await connectHandshake(transport, fake);

		const received = Event.toPromise(transport.onMessage);
		const ahpMessage = { jsonrpc: '2.0', id: 7, result: { ok: true } };
		fake.emit({ type: 'message', from: 'group', group: TO_CLIENT, dataType: 'json', data: { kind: 'message', data: ahpMessage } });

		assert.deepStrictEqual(await received, ahpMessage);
	});

	test('publishes outbound messages to the to_host lane as sendToGroup frames', async () => {
		const fake = new FakeWebSocket();
		const transport = createTransport(fake);
		await connectHandshake(transport, fake);

		const outbound = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
		transport.send(outbound as never);

		const publishes = fake.sentOfType('sendToGroup');
		assert.strictEqual(publishes.length, 1);
		assert.deepStrictEqual(
			{ group: publishes[0]['group'], dataType: publishes[0]['dataType'], noEcho: publishes[0]['noEcho'], data: publishes[0]['data'] },
			{ group: TO_HOST, dataType: 'json', noEcho: true, data: { kind: 'message', data: outbound } },
		);
	});

	test('fires onClose once when the socket closes after connect', async () => {
		const fake = new FakeWebSocket();
		const transport = createTransport(fake);
		await connectHandshake(transport, fake);

		let closes = 0;
		store.add(transport.onClose(() => closes++));
		fake.emitClose();
		fake.emitError();

		assert.strictEqual(closes, 1);
	});

	test('throws when sending after dispose', () => {
		const fake = new FakeWebSocket();
		const transport = createTransport(fake);
		transport.dispose();
		assert.throws(() => transport.send({ jsonrpc: '2.0', id: 1, method: 'x' } as never));
	});
});
