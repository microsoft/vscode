/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { hasKey } from '../../../../base/common/types.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IWebPubSubRelayTransportOptions, IWebSocketLike, WebPubSubRelayTransport } from '../../browser/webPubSubRelayTransport.js';
import { ProtocolMessage } from '../../common/state/sessionProtocol.js';
import { ChunkEnvelope, DEFAULT_MAX_SEGMENTS_PER_GROUP, chunk } from '../../common/webPubSub/chunking.js';

const BROADCAST = 'user.u1.env.e1.client.c1.broadcast';
const TO_CLIENT = 'user.u1.env.e1.client.c1.to-client';
const TO_HOST = 'user.u1.env.e1.client.c1.to-host';

/** A fake WebSocket the test drives directly. */
class FakeWebSocket implements IWebSocketLike {
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onclose: ((event: { code: number; reason: string }) => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;

	readonly sent: Record<string, unknown>[] = [];
	closed = false;
	failSequenceAcks = false;
	highestAcknowledgedSequenceId = 0;
	totalMessageBytes = 0;
	largestMessageBytes = 0;

	private readonly unacknowledged = new Map<number, number>();
	private unacknowledgedBytes = 0;
	private readonly encoder = new TextEncoder();

	send(data: string): void {
		const frame: Record<string, unknown> = JSON.parse(data);
		if (frame['type'] === 'sequenceAck' && typeof frame['sequenceId'] === 'number') {
			if (this.failSequenceAcks) {
				throw new Error('Cannot send sequence acknowledgement');
			}
			this.highestAcknowledgedSequenceId = frame['sequenceId'];
			for (const [sequenceId, bytes] of this.unacknowledged) {
				if (sequenceId <= this.highestAcknowledgedSequenceId) {
					this.unacknowledged.delete(sequenceId);
					this.unacknowledgedBytes -= bytes;
				}
			}
		}
		this.sent.push(frame);
	}
	close(): void {
		this.closed = true;
	}

	/** Deliver an inbound JSON frame. */
	emit(frame: unknown): void {
		this.onmessage?.({ data: JSON.stringify(frame) });
	}

	/** Model the reliable relay's 1,000-message / 16 MB unacknowledged buffer. */
	emitGroupMessage(sequenceId: number, data: ChunkEnvelope, group = TO_CLIENT): void {
		if (this.closed) {
			return;
		}
		const frame = { type: 'message', from: 'group', group, dataType: 'json', sequenceId, data };
		const bytes = this.encoder.encode(JSON.stringify(frame)).byteLength;
		this.totalMessageBytes += bytes;
		this.largestMessageBytes = Math.max(this.largestMessageBytes, bytes);
		this.unacknowledgedBytes += bytes - (this.unacknowledged.get(sequenceId) ?? 0);
		this.unacknowledged.set(sequenceId, bytes);
		if (this.unacknowledged.size > 1000 || this.unacknowledgedBytes > 16 * 1024 * 1024) {
			this.closed = true;
			this.emitClose(1008, 'Unacknowledged message buffer exceeded');
			return;
		}
		this.emit(frame);
	}

	get pendingMessageCount(): number {
		return this.unacknowledged.size;
	}

	emitClose(code = 1000, reason = ''): void {
		this.onclose?.({ code, reason });
	}
	emitError(): void {
		this.onerror?.(undefined);
	}

	/** Frames sent to the wire of the given WPS command `type`. */
	sentOfType(type: string): Array<Record<string, unknown>> {
		return this.sent.filter(frame => frame['type'] === type);
	}
}

suite('WebPubSubRelayTransport', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTransport(fake: FakeWebSocket, options: Partial<IWebPubSubRelayTransportOptions> = {}): WebPubSubRelayTransport {
		return store.add(new WebPubSubRelayTransport({
			url: 'wss://wps.example/client/hubs/h?access_token=tok&clientId=c1',
			toHostGroup: TO_HOST,
			joinGroups: [BROADCAST, TO_CLIENT],
			webSocketFactory: () => fake,
			...options,
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

		assert.deepStrictEqual(
			{ message: await received, acknowledgements: fake.sentOfType('sequenceAck') },
			{ message: ahpMessage, acknowledgements: [] },
		);
	});

	test('acknowledges receipt before delivery and filters redeliveries across groups', async () => {
		const fake = new FakeWebSocket();
		const transport = createTransport(fake);
		await connectHandshake(transport, fake);

		const received: ProtocolMessage[] = [];
		const acknowledgedAtDelivery: number[] = [];
		store.add(transport.onMessage(message => {
			received.push(message);
			acknowledgedAtDelivery.push(fake.highestAcknowledgedSequenceId);
		}));
		const first = { jsonrpc: '2.0', id: 1, result: 'first' };
		const second = { jsonrpc: '2.0', id: 2, result: 'second' };
		fake.emitGroupMessage(10, { kind: 'message', data: first });
		fake.emitGroupMessage(11, { kind: 'message', data: second }, BROADCAST);
		fake.emitGroupMessage(10, { kind: 'message', data: first });
		fake.emitGroupMessage(11, { kind: 'message', data: second }, BROADCAST);
		fake.emitGroupMessage(12, { kind: 'message', data: first });

		assert.deepStrictEqual({
			received,
			acknowledgedAtDelivery,
			acknowledgements: fake.sentOfType('sequenceAck'),
		}, {
			received: [first, second, first],
			acknowledgedAtDelivery: [10, 11, 12],
			acknowledgements: [10, 11, 11, 11, 12].map(sequenceId => ({ type: 'sequenceAck', sequenceId })),
		});
	});

	test('acknowledges early messages and filters duplicate chunks across the handshake', async () => {
		const fake = new FakeWebSocket();
		const errors: unknown[] = [];
		const transport = createTransport(fake, { onProtocolError: error => errors.push(error) });
		const received: ProtocolMessage[] = [];
		store.add(transport.onMessage(message => received.push(message)));
		const connected = transport.connect();
		fake.emit({ type: 'system', event: 'connected' });

		const early = { jsonrpc: '2.0', id: 1, result: 'early' };
		fake.emitGroupMessage(1, { kind: 'message', data: early });
		fake.emitGroupMessage(1, { kind: 'message', data: early });
		const message = { jsonrpc: '2.0', id: 2, result: 'x'.repeat(2048) };
		const chunks = chunk(message, { maxChunkBytes: 512, newGroupId: () => 'handshake-chunks' });
		assert.ok(chunks.length > 1);
		fake.emitGroupMessage(2, chunks[0]);
		fake.emitGroupMessage(2, chunks[0]);

		for (const join of fake.sentOfType('joinGroup')) {
			fake.emit({ type: 'ack', ackId: join['ackId'], success: true });
		}
		await connected;
		fake.emitGroupMessage(1, { kind: 'message', data: early });
		fake.emitGroupMessage(2, chunks[0]);
		for (let i = 1; i < chunks.length; i++) {
			fake.emitGroupMessage(i + 2, chunks[i]);
			fake.emitGroupMessage(i + 2, chunks[i]);
		}
		for (let i = 0; i < chunks.length; i++) {
			fake.emitGroupMessage(i + 2, chunks[i]);
		}
		const after = { jsonrpc: '2.0', id: 3, result: 'after' };
		fake.emitGroupMessage(chunks.length + 2, { kind: 'message', data: after });

		assert.deepStrictEqual({
			received,
			errors,
			lastAcknowledged: fake.highestAcknowledgedSequenceId,
			pending: fake.pendingMessageCount,
		}, {
			received: [early, message, after],
			errors: [],
			lastAcknowledged: chunks.length + 2,
			pending: 0,
		});
	});

	test('starts receive sequencing afresh for a new transport', async () => {
		const received: ProtocolMessage[] = [];
		const acknowledgements: number[] = [];
		for (const sequenceId of [42, 1]) {
			const fake = new FakeWebSocket();
			const transport = createTransport(fake);
			store.add(transport.onMessage(message => received.push(message)));
			await connectHandshake(transport, fake);
			fake.emitGroupMessage(sequenceId, { kind: 'message', data: { jsonrpc: '2.0', id: sequenceId, result: null } });
			acknowledgements.push(fake.highestAcknowledgedSequenceId);
			transport.dispose();
		}

		assert.deepStrictEqual({ received, acknowledgements }, {
			received: [42, 1].map(id => ({ jsonrpc: '2.0', id, result: null })),
			acknowledgements: [42, 1],
		});
	});

	test('acknowledges receipt without bypassing group, framing, or chunk validation', async () => {
		const fake = new FakeWebSocket();
		const errorsAcknowledgedAt: number[] = [];
		const transport = createTransport(fake, {
			groupValidation: { expected: { cid: 'c1' } },
			onProtocolError: () => errorsAcknowledgedAt.push(fake.highestAcknowledgedSequenceId),
		});
		await connectHandshake(transport, fake);
		const received: ProtocolMessage[] = [];
		store.add(transport.onMessage(message => received.push(message)));
		const message = { jsonrpc: '2.0', id: 1, result: null };
		fake.emitGroupMessage(1, { kind: 'message', data: message }, 'user.u1.env.e1.client.c2.to-client');
		fake.emit({ type: 'message', from: 'group', group: TO_CLIENT, dataType: 'xml', sequenceId: 2, data: {} });
		fake.emitGroupMessage(3, { kind: 'chunk', group_id: 'too-many', seq: 0, total: DEFAULT_MAX_SEGMENTS_PER_GROUP + 1, bytes: '' });
		fake.emitGroupMessage(4, { kind: 'message', data: message });

		assert.deepStrictEqual({ received, errorsAcknowledgedAt }, {
			received: [message],
			errorsAcknowledgedAt: [1, 2, 3],
		});
	});

	test('rejects invalid receive sequence IDs without advancing the acknowledgement', async () => {
		const fake = new FakeWebSocket();
		const errors: unknown[] = [];
		const transport = createTransport(fake, { onProtocolError: error => errors.push(error) });
		await connectHandshake(transport, fake);
		const received: ProtocolMessage[] = [];
		store.add(transport.onMessage(message => received.push(message)));
		const message = { jsonrpc: '2.0', id: 1, result: null };
		for (const sequenceId of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
			fake.emit({ type: 'message', from: 'group', group: TO_CLIENT, dataType: 'json', sequenceId, data: { kind: 'message', data: message } });
		}
		fake.emitGroupMessage(1, { kind: 'message', data: message });

		assert.deepStrictEqual({
			received,
			errors: errors.length,
			acknowledgements: fake.sentOfType('sequenceAck'),
		}, {
			received: [message],
			errors: 6,
			acknowledgements: [{ type: 'sequenceAck', sequenceId: 1 }],
		});
	});

	for (const duringHandshake of [true, false]) {
		test(`fails the ${duringHandshake ? 'handshake' : 'open connection'} if a receive acknowledgement cannot be sent`, async () => {
			const fake = new FakeWebSocket();
			fake.failSequenceAcks = true;
			const errors: unknown[] = [];
			const transport = createTransport(fake, { onProtocolError: error => errors.push(error) });
			let delivered = 0;
			let closed = 0;
			store.add(transport.onMessage(() => delivered++));
			store.add(transport.onClose(() => closed++));
			const connected = transport.connect();
			fake.emit({ type: 'system', event: 'connected' });
			if (!duringHandshake) {
				for (const join of fake.sentOfType('joinGroup')) {
					fake.emit({ type: 'ack', ackId: join['ackId'], success: true });
				}
				await connected;
			}
			fake.emitGroupMessage(1, { kind: 'message', data: { jsonrpc: '2.0', id: 1, result: null } });
			if (duringHandshake) {
				await assert.rejects(connected, /sequence acknowledgement/);
			}
			assert.deepStrictEqual({ delivered, closed, errors: errors.length, open: transport.isOpen, socketClosed: fake.closed }, {
				delivered: 0,
				closed: duringHandshake ? 0 : 1,
				errors: 1,
				open: false,
				socketClosed: true,
			});
		});
	}

	for (const { name, count, payloadBytes } of [
		{ name: '10,000 messages', count: 10_000, payloadBytes: 1 },
		{ name: 'more than 16 MB of streamed data', count: 257, payloadBytes: 64 * 1024 },
	]) {
		test(`sustains ${name} without exhausting the relay buffer`, async () => {
			const fake = new FakeWebSocket();
			const transport = createTransport(fake);
			await connectHandshake(transport, fake);
			let delivered = 0;
			let ordered = true;
			let acknowledgedBeforeDelivery = true;
			let receivedBytes = 0;
			store.add(transport.onMessage(message => {
				delivered++;
				ordered &&= hasKey(message, { id: true }) && message.id === delivered;
				acknowledgedBeforeDelivery &&= fake.highestAcknowledgedSequenceId >= delivered;
				if (hasKey(message, { result: true }) && typeof message.result === 'string') {
					receivedBytes += message.result.length;
				}
			}));
			const result = 'x'.repeat(payloadBytes);
			for (let sequenceId = 1; sequenceId <= count; sequenceId++) {
				fake.emitGroupMessage(sequenceId, { kind: 'message', data: { jsonrpc: '2.0', id: sequenceId, result } });
			}

			assert.deepStrictEqual({
				delivered,
				ordered,
				acknowledgedBeforeDelivery,
				receivedBytes,
				streamedBeyondByteLimit: fake.totalMessageBytes > 16 * 1024 * 1024,
				framesWithinSizeLimit: fake.largestMessageBytes < 1024 * 1024,
				lastAcknowledged: fake.highestAcknowledgedSequenceId,
				pending: fake.pendingMessageCount,
				open: transport.isOpen,
			}, {
				delivered: count,
				ordered: true,
				acknowledgedBeforeDelivery: true,
				receivedBytes: count * payloadBytes,
				streamedBeyondByteLimit: payloadBytes > 1,
				framesWithinSizeLimit: true,
				lastAcknowledged: count,
				pending: 0,
				open: true,
			});
		});
	}

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

	test('counts inbound frames without retaining payloads or counting stale callbacks', async () => {
		const fake = new FakeWebSocket();
		let frames = 0;
		const errors: unknown[] = [];
		const transport = store.add(new WebPubSubRelayTransport({
			url: 'wss://wps.example',
			toHostGroup: TO_HOST,
			joinGroups: [BROADCAST, TO_CLIENT],
			webSocketFactory: () => fake,
			onDidReceiveFrame: () => frames++,
			onProtocolError: error => errors.push(error),
		}));
		const connecting = transport.connect();
		fake.onmessage?.({ data: '{invalid' });
		fake.emit({ type: 'system', event: 'connected' });
		for (const join of fake.sentOfType('joinGroup')) {
			fake.emit({ type: 'ack', ackId: join['ackId'], success: true });
		}
		await connecting;
		fake.emit({ type: 'ack', ackId: 99, success: true });
		fake.onmessage?.({ data: '{invalid' });
		fake.emit({ type: 'message', from: 'group', group: TO_CLIENT, dataType: 'json', data: { kind: 'message', data: { jsonrpc: '2.0', id: 1, result: null } } });
		const staleMessage = fake.onmessage;
		fake.emitClose();
		staleMessage?.({ data: '{}' });
		transport.dispose();
		staleMessage?.({ data: '{}' });
		assert.deepStrictEqual({ frames, parseErrors: errors.length }, { frames: 7, parseErrors: 2 });
	});
});
