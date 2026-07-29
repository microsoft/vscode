/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { AGENT_HOST_VOICE_MAX_MESSAGE_BYTES } from '../../common/agentHostVoiceRelay.js';
import { AgentHostVoiceRelay, IAgentHostVoiceWebSocket } from '../../node/agentHostVoiceRelay.js';
import type * as wsTypes from 'ws';

class TestVoiceWebSocket implements IAgentHostVoiceWebSocket {
	readyState = 0;
	readonly sent: string[] = [];
	closed: { code?: number; reason?: string } | undefined;

	private _onOpen: (() => void) | undefined;
	private _onMessage: ((data: wsTypes.RawData) => void) | undefined;
	private _onClose: ((code: number, reason: Buffer) => void) | undefined;
	private _onError: ((error: Error) => void) | undefined;

	onOpen(listener: () => void) {
		this._onOpen = listener;
		return toDisposable(() => this._onOpen = undefined);
	}

	onMessage(listener: (data: wsTypes.RawData) => void) {
		this._onMessage = listener;
		return toDisposable(() => this._onMessage = undefined);
	}

	onClose(listener: (code: number, reason: Buffer) => void) {
		this._onClose = listener;
		return toDisposable(() => this._onClose = undefined);
	}

	onError(listener: (error: Error) => void) {
		this._onError = listener;
		return toDisposable(() => this._onError = undefined);
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(code?: number, reason?: string): void {
		this.readyState = 3;
		this.closed = { code, reason };
	}

	fireOpen(): void {
		this.readyState = 1;
		this._onOpen?.();
	}

	fireMessage(message: string): void {
		this._onMessage?.(Buffer.from(message));
	}

	fireRawMessage(data: wsTypes.RawData): void {
		this._onMessage?.(data);
	}

	fireClose(code: number, reason: string): void {
		this.readyState = 3;
		this._onClose?.(code, Buffer.from(reason));
	}
}

suite('AgentHostVoiceRelay', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('authenticates and relays messages bidirectionally', async () => {
		const socket = new TestVoiceWebSocket();
		let requestedUrl = '';
		const relay = store.add(new AgentHostVoiceRelay(
			'wss://voice.test/realtime/voice?api-version=1',
			async url => {
				requestedUrl = url;
				return socket;
			},
		));
		const received: string[] = [];
		const closes: { code: number; reason: string }[] = [];
		store.add(relay.onDidReceiveMessage(message => received.push(message)));
		store.add(relay.onDidClose(event => closes.push(event)));

		const connecting = relay.connect('token with spaces');
		await Promise.resolve();
		socket.fireOpen();
		await connecting;
		relay.send('client-message');
		socket.fireMessage('server-message');
		socket.fireClose(4008, 'replaced');

		assert.deepStrictEqual({
			requestedUrl,
			sent: socket.sent,
			received,
			closes,
		}, {
			requestedUrl: 'wss://voice.test/realtime/voice?api-version=1&token=token+with+spaces',
			sent: ['client-message'],
			received: ['server-message'],
			closes: [{ code: 4008, reason: 'replaced' }],
		});
	});

	test('closes a backend socket created after disconnect', async () => {
		const socket = new TestVoiceWebSocket();
		let completeFactory: ((socket: IAgentHostVoiceWebSocket) => void) | undefined;
		const relay = store.add(new AgentHostVoiceRelay(
			'wss://voice.test/realtime/voice',
			() => new Promise(resolve => completeFactory = resolve),
		));

		const connecting = relay.connect();
		relay.disconnect();
		completeFactory?.(socket);

		await assert.rejects(connecting);
		assert.deepStrictEqual(socket.closed, { code: 1000, reason: 'Voice connection cancelled' });
	});

	test('rejects oversized raw backend payloads before decoding', async () => {
		const payloads: wsTypes.RawData[] = [
			Buffer.alloc(AGENT_HOST_VOICE_MAX_MESSAGE_BYTES + 1),
			new ArrayBuffer(AGENT_HOST_VOICE_MAX_MESSAGE_BYTES + 1),
			[
				Buffer.alloc(AGENT_HOST_VOICE_MAX_MESSAGE_BYTES / 2),
				Buffer.alloc(AGENT_HOST_VOICE_MAX_MESSAGE_BYTES / 2 + 1),
			],
		];

		for (const payload of payloads) {
			const socket = new TestVoiceWebSocket();
			const relay = store.add(new AgentHostVoiceRelay(
				'wss://voice.test/realtime/voice',
				async () => socket,
			));
			const received: string[] = [];
			store.add(relay.onDidReceiveMessage(message => received.push(message)));

			const connecting = relay.connect();
			await Promise.resolve();
			socket.fireOpen();
			await connecting;
			socket.fireRawMessage(payload);

			assert.deepStrictEqual(received, []);
			assert.deepStrictEqual(socket.closed, {
				code: 1009,
				reason: 'Voice backend message exceeds the 8 MiB payload limit',
			});
		}
	});
});
