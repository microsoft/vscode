/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { VoiceCodeTranscriptionClient } from '../../../browser/speechToText/voiceCodeTranscriptionClient.js';

class TestWebSocket {
	static instance: TestWebSocket | undefined;

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

	send(message: string): void {
		this.sent.push(message);
	}

	close(): void {
		this.readyState = WebSocket.CLOSED;
	}
}

function createTestWindow(): Window & typeof globalThis {
	return new Proxy(mainWindow, {
		get(target, property, receiver) {
			if (property === 'WebSocket') {
				return TestWebSocket;
			}
			if (property === 'setInterval' || property === 'clearInterval') {
				const value = Reflect.get(target, property, receiver);
				return typeof value === 'function' ? value.bind(target) : value;
			}
			return Reflect.get(target, property, receiver);
		}
	});
}

suite('VoiceCodeTranscriptionClient', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		TestWebSocket.instance = undefined;
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

	test('sends the strict standalone transcription protocol', async () => {
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

	test('accepts only matching, increasing transcript revisions', async () => {
		const client = createClient();
		const socket = await connect(client);
		const initialized = client.startSession();
		socket.receive({ type: 'session_init', session_id: 'session-1' });
		await initialized;
		client.sendPttStart('turn-1');
		const transcripts: object[] = [];
		store.add(client.onTranscription(event => transcripts.push(event)));

		socket.receive({ type: 'transcription', turn_id: 'turn-1', status: 'partial', text: 'hello', revision: 1 });
		socket.receive({ type: 'transcription', turn_id: 'turn-1', status: 'partial', text: 'duplicate', revision: 1 });
		socket.receive({ type: 'transcription', turn_id: 'other', status: 'partial', text: 'wrong turn', revision: 2 });
		socket.receive({ type: 'transcription', turn_id: 'turn-1', status: 'final', text: 'hello world', revision: 2 });

		assert.deepStrictEqual(transcripts, [
			{ turnId: 'turn-1', status: 'partial', text: 'hello', revision: 1 },
			{ turnId: 'turn-1', status: 'final', text: 'hello world', revision: 2 },
		]);
	});

	test('guards optional terminal quota metadata', async () => {
		const client = createClient();
		const socket = await connect(client);
		const errors: object[] = [];
		store.add(client.onError(error => errors.push(error)));

		socket.receive({
			type: 'error',
			detail: 'Daily transcription quota reached',
			code: 'daily_transcription_limit_reached',
			turn_id: 'turn-1',
			terminal: true,
			limit_seconds: 3600,
			used_seconds: 3600,
			remaining_seconds: -1,
			reset_at: '2026-07-17T00:00:00Z',
		});

		assert.deepStrictEqual(errors, [{
			detail: 'Daily transcription quota reached',
			code: 'daily_transcription_limit_reached',
			turnId: 'turn-1',
			terminal: true,
			limitSeconds: 3600,
			usedSeconds: 3600,
			remainingSeconds: undefined,
			resetAt: '2026-07-17T00:00:00Z',
		}]);
	});
});
