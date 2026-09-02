/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { VoiceCodeTranscriptionClient } from '../../../browser/speechToText/voiceCodeTranscriptionClient.js';

class TestWebSocket {
	static instance: TestWebSocket | undefined;
	static ping: (() => void) | undefined;

	readyState: number = WebSocket.CONNECTING;
	readonly sent: string[] = [];
	onopen: (() => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;

	constructor(readonly url: string) {
		TestWebSocket.instance = this;
	}

	open(): void {
		this.readyState = WebSocket.OPEN;
		this.onopen?.();
	}

	receive(message: object): void {
		this.onmessage?.(new mainWindow.MessageEvent('message', { data: JSON.stringify(message) }));
	}

	close(code?: number, reason?: string): void {
		this.readyState = WebSocket.CLOSED;
		this.onclose?.(new mainWindow.CloseEvent('close', { code, reason }));
	}

	send(message: string): void {
		this.sent.push(message);
	}
}

function createTestWindow(): Window & typeof globalThis {
	return new Proxy(mainWindow, {
		get(target, property, receiver) {
			if (property === 'WebSocket') {
				return TestWebSocket;
			}
			if (property === 'setInterval') {
				return (callback: () => void) => {
					TestWebSocket.ping = callback;
					return 1;
				};
			}
			if (property === 'clearInterval') {
				return () => { };
			}
			return Reflect.get(target, property, receiver);
		}
	});
}

suite('VoiceCodeTranscriptionClient', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		TestWebSocket.instance = undefined;
		TestWebSocket.ping = undefined;
	});

	function createClient(): VoiceCodeTranscriptionClient {
		const productService: IProductService = {
			_serviceBrand: undefined,
			...product,
			voiceWsUrl: 'wss://voice.test/voice-code/api/v1/realtime/voice',
		};
		return store.add(new VoiceCodeTranscriptionClient(
			new TestConfigurationService(),
			productService,
			new NullLogService(),
		));
	}

	async function connect(client: VoiceCodeTranscriptionClient): Promise<TestWebSocket> {
		const connecting = client.connect(createTestWindow(), 'github-token');
		const socket = TestWebSocket.instance;
		assert.ok(socket);
		socket.open();
		await connecting;
		return socket;
	}

	test('sends the standalone scoped transcription protocol after session initialization', async () => {
		const client = createClient();
		const socket = await connect(client);
		const initialized = client.startSession();
		socket.receive({ type: 'session_init', session_id: 'session-1' });
		await initialized;

		client.sendPttStart('turn-1');
		client.sendPttAudioChunk('turn-1', 'AAE=');
		client.sendPttEnd('turn-1');

		assert.deepStrictEqual({
			url: socket.url,
			messages: socket.sent.map(message => JSON.parse(message)),
		}, {
			url: 'wss://voice.test/voice-code/api/v1/realtime/transcription?token=github-token',
			messages: [
				{ type: 'start_session' },
				{ type: 'ptt_start', turn_id: 'turn-1' },
				{ type: 'ptt_audio_chunk', turn_id: 'turn-1', audio: 'AAE=' },
				{ type: 'ptt_end', turn_id: 'turn-1' },
			],
		});
	});

	test('emits only increasing revisions for the active turn and keeps the committed prefix', async () => {
		const client = createClient();
		const socket = await connect(client);
		const initialized = client.startSession();
		socket.receive({ type: 'session_init', session_id: 'session-1' });
		await initialized;
		client.sendPttStart('turn-1');
		const transcriptions: object[] = [];
		store.add(client.onTranscription(transcription => transcriptions.push(transcription)));

		socket.receive({ type: 'transcription', turn_id: 'turn-1', status: 'partial', text: 'write a', committed: 'write ', revision: 1 });
		socket.receive({ type: 'transcription', turn_id: 'turn-1', status: 'partial', text: 'stale', committed: '', revision: 1 });
		socket.receive({ type: 'transcription', turn_id: 'other-turn', status: 'partial', text: 'foreign', committed: '', revision: 2 });
		socket.receive({ type: 'transcription', turn_id: 'turn-1', status: 'final', text: 'write a test', committed: 'write a test', revision: 2 });

		assert.deepStrictEqual(transcriptions, [
			{ turnId: 'turn-1', status: 'partial', text: 'write a', committed: 'write ', revision: 1 },
			{ turnId: 'turn-1', status: 'final', text: 'write a test', committed: 'write a test', revision: 2 },
		]);
	});

	test('emits an explicit empty final transcript', async () => {
		const client = createClient();
		const socket = await connect(client);
		client.sendPttStart('turn-1');
		const transcriptions: object[] = [];
		store.add(client.onTranscription(transcription => transcriptions.push(transcription)));

		socket.receive({ type: 'transcription', turn_id: 'turn-1', status: 'final', text: '', committed: '', revision: 1 });

		assert.deepStrictEqual(transcriptions, [
			{ turnId: 'turn-1', status: 'final', text: '', committed: '', revision: 1 },
		]);
	});

	test('reports malformed frames and unexpected closure as transport errors', async () => {
		const client = createClient();
		const socket = await connect(client);
		const errors: object[] = [];
		const closures: number[] = [];
		const closeEvents: string[] = [];
		store.add(client.onError(error => errors.push(error)));
		store.add(client.onError(() => closeEvents.push('error')));
		store.add(client.onDidClose(code => {
			closures.push(code);
			closeEvents.push('close');
		}));

		socket.receive({ type: 'error', detail: 'capture limit reached', code: 'capture_limit', turn_id: 'turn-1', terminal: false });
		socket.receive({ type: 'error', detail: 'backend rejected audio', code: 'bad_audio', turn_id: 'turn-1', terminal: true });
		socket.receive({ type: 'transcription', turn_id: '', status: 'final', text: 'invalid', revision: 1 });
		socket.close(4008, 'rejected');

		assert.deepStrictEqual(errors, [
			{ detail: 'capture limit reached', code: 'capture_limit', turnId: 'turn-1', terminal: false },
			{ detail: 'backend rejected audio', code: 'bad_audio', turnId: 'turn-1', terminal: true },
			{ detail: 'Transcription connection closed (4008): rejected', terminal: true },
		]);
		assert.deepStrictEqual(closures, [4008]);
		assert.deepStrictEqual(closeEvents.slice(-2), ['close', 'error']);
	});

	test('ignores errors from a socket replaced by reconnect', async () => {
		const client = createClient();
		const oldSocket = await connect(client);
		const oldError = oldSocket.onerror;
		const errors: object[] = [];
		store.add(client.onError(error => errors.push(error)));

		const reconnecting = client.connect(createTestWindow(), 'github-token');
		const newSocket = TestWebSocket.instance;
		assert.ok(newSocket);
		newSocket.open();
		await reconnecting;
		oldError?.();

		assert.strictEqual(client.isConnected, true);
		assert.deepStrictEqual(errors, []);
	});

	test('pings an idle connection and cancels a pending connection without a close notification', async () => {
		const clock = sinon.useFakeTimers();
		const client = createClient();
		const socket = await connect(client);
		const closures: number[] = [];
		store.add(client.onDidClose(code => closures.push(code)));
		try {
			assert.ok(TestWebSocket.ping);
			TestWebSocket.ping();
			assert.deepStrictEqual(socket.sent.map(message => JSON.parse(message)), [{ type: 'ping' }]);
			socket.receive({ type: 'pong' });

			const connecting = client.connect(createTestWindow(), 'github-token');
			client.disconnect();
			await assert.rejects(connecting);
			assert.deepStrictEqual(closures, []);
			await clock.tickAsync(10_000);
		} finally {
			clock.restore();
		}
	});
});
