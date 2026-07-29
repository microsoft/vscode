/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { NullRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { AGENT_HOST_VOICE_MAX_MESSAGE_BYTES, IAgentHostVoiceCloseEvent, IAgentHostVoiceRelay } from '../../../../../../platform/agentHost/common/agentHostVoiceRelay.js';
import { AgentHostVoiceWebSocket, VoiceClientService } from '../../../browser/voiceClient/voiceClientService.js';
import { IVoiceAudioResponse, IVoiceBargeIn, IVoiceTranscription } from '../../../common/voiceClient/voiceClientService.js';

class TestWebSocket {
	static instance: TestWebSocket | undefined;

	readyState: number = WebSocket.OPEN;
	readonly sent: Record<string, unknown>[] = [];
	onopen: (() => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;

	constructor() {
		TestWebSocket.instance = this;
	}

	close(): void {
		this.readyState = WebSocket.CLOSED;
	}

	send(data: string): void {
		this.sent.push(JSON.parse(data) as Record<string, unknown>);
	}
}

class TestAgentHostVoiceRelay extends Disposable implements IAgentHostVoiceRelay {
	private readonly _onDidReceiveVoiceMessage = this._register(new Emitter<string>());
	readonly onDidReceiveVoiceMessage = this._onDidReceiveVoiceMessage.event;

	private readonly _onDidCloseVoiceConnection = this._register(new Emitter<IAgentHostVoiceCloseEvent>());
	readonly onDidCloseVoiceConnection = this._onDidCloseVoiceConnection.event;

	readonly sent: string[] = [];
	connectCalls = 0;
	disconnectCalls = 0;

	async connectVoice(): Promise<void> {
		this.connectCalls++;
	}

	sendVoiceMessage(message: string): void {
		this.sent.push(message);
	}

	async disconnectVoice(): Promise<void> {
		this.disconnectCalls++;
	}

	fireMessage(message: string): void {
		this._onDidReceiveVoiceMessage.fire(message);
	}

	fireClose(event: IAgentHostVoiceCloseEvent): void {
		this._onDidCloseVoiceConnection.fire(event);
	}
}

function createTestWindow(language = 'en-US'): Window & typeof globalThis {
	return new Proxy(mainWindow, {
		get(target, property, receiver) {
			if (property === 'WebSocket') {
				return TestWebSocket;
			}
			// Native timer methods are branded to their owning `window` and throw
			// "Illegal invocation" when called with a Proxy as `this`; bind to the real target.
			if (property === 'setInterval' || property === 'clearInterval') {
				return target[property].bind(target);
			}
			if (property === 'navigator') {
				return new Proxy(target.navigator, {
					get(navigatorTarget, navigatorProperty, navigatorReceiver) {
						if (navigatorProperty === 'language') {
							return language;
						}
						return Reflect.get(navigatorTarget, navigatorProperty, navigatorReceiver);
					}
				});
			}
			return Reflect.get(target, property, receiver);
		}
	});
}

suite('VoiceClientService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const productService: IProductService = {
		_serviceBrand: undefined,
		...product,
		voiceWsUrl: 'ws://voice.test/realtime/voice',
	};

	setup(() => {
		TestWebSocket.instance = undefined;
	});

	function createService(configuration: Record<string, unknown> = {}): { service: VoiceClientService; configurationService: TestConfigurationService } {
		const configurationService = new TestConfigurationService(configuration);
		const service = store.add(new VoiceClientService(
			false,
			configurationService,
			new NullLogService(),
			productService,
			new NullRemoteAgentHostService(),
		));
		return { service, configurationService };
	}

	function socket(): TestWebSocket {
		if (!TestWebSocket.instance) {
			throw new Error('Voice WebSocket was not created');
		}
		return TestWebSocket.instance;
	}

	function fireConfigurationChange(configurationService: TestConfigurationService, key: string): void {
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: candidate => candidate === key,
		});
	}

	test('emits barge-in events from the backend', async () => {
		const { service } = createService();
		const events: IVoiceBargeIn[] = [];
		store.add(service.onBargeIn(event => events.push(event)));

		await service.connect(createTestWindow());
		const webSocket = socket();
		if (!webSocket.onmessage) {
			throw new Error('Voice WebSocket was not created');
		}
		webSocket.onmessage(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'barge_in',
				turn_id: 'interrupting-turn',
				interrupted_turn_id: 'cancelled-turn',
			}),
		}));

		assert.deepStrictEqual(events, [{
			turnId: 'interrupting-turn',
			interruptedTurnId: 'cancelled-turn',
		}]);
	});

	test('adapts the Agent Host voice relay to the websocket contract', async () => {
		const relay = store.add(new TestAgentHostVoiceRelay());
		const webSocket = store.add(new AgentHostVoiceWebSocket(relay));
		const events: string[] = [];
		webSocket.onopen = () => events.push('open');
		webSocket.onmessage = message => events.push(message);
		webSocket.onclose = event => events.push(`close:${event.code}:${event.reason}`);

		await webSocket.connect();
		webSocket.send('client-message');
		relay.fireMessage('server-message');
		relay.fireClose({ code: 4008, reason: 'replaced' });

		assert.deepStrictEqual({
			sent: relay.sent,
			events,
		}, {
			sent: ['client-message'],
			events: ['open', 'server-message', 'close:4008:replaced'],
		});
	});

	test('does not open an Agent Host voice socket after disconnect during connect', async () => {
		let completeConnect: (() => void) | undefined;
		const relay = store.add(new TestAgentHostVoiceRelay());
		relay.connectVoice = () => new Promise<void>(resolve => completeConnect = resolve);
		const webSocket = store.add(new AgentHostVoiceWebSocket(relay));
		let opened = false;
		webSocket.onopen = () => opened = true;

		const connecting = webSocket.connect();
		webSocket.close();
		completeConnect?.();
		await assert.rejects(connecting);

		assert.strictEqual(opened, false);
		assert.strictEqual(webSocket.readyState, WebSocket.CLOSED);
		assert.ok(relay.disconnectCalls >= 1);
	});

	test('preserves an abnormal local close for reconnect handling', async () => {
		const relay = store.add(new TestAgentHostVoiceRelay());
		const webSocket = store.add(new AgentHostVoiceWebSocket(relay));
		let closeEvent: IAgentHostVoiceCloseEvent & { wasClean: boolean } | undefined;
		webSocket.onclose = event => closeEvent = event;

		await webSocket.connect();
		webSocket.close(4000, 'pong timeout');

		assert.deepStrictEqual(closeEvent, { code: 4000, reason: 'pong timeout', wasClean: false });
		assert.strictEqual(relay.disconnectCalls, 1);
	});

	test('rejects oversized UTF-8 messages before sending to the Agent Host', async () => {
		const relay = store.add(new TestAgentHostVoiceRelay());
		const webSocket = store.add(new AgentHostVoiceWebSocket(relay));
		await webSocket.connect();

		assert.throws(
			() => webSocket.send('😀'.repeat(AGENT_HOST_VOICE_MAX_MESSAGE_BYTES / 4 + 1)),
			/Voice message exceeds the 8 MiB UTF-8 payload limit/,
		);
		assert.deepStrictEqual(relay.sent, []);
	});

	test('reconnects after an abnormal local close when the Agent Host tunnel returns', async () => {
		const connectionChanges = store.add(new Emitter<void>());
		const firstRelay = store.add(new TestAgentHostVoiceRelay());
		const recoveredRelay = store.add(new TestAgentHostVoiceRelay());
		const remoteService = new NullRemoteAgentHostService();
		let available = true;
		let activeRelay = firstRelay;
		Object.defineProperties(remoteService, {
			onDidChangeConnections: { value: connectionChanges.event },
			connections: {
				get: () => available ? [{
					address: 'tunnel:test',
					name: 'test',
					clientId: 'test-client',
					status: RemoteAgentHostConnectionStatus.connected,
				}] : [],
			},
		});
		remoteService.getEntryByAddress = () => ({
			name: 'test',
			connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'test', clusterId: 'test' },
		});
		remoteService.getConnection = () => activeRelay as never;
		const service = store.add(new VoiceClientService(
			true,
			new TestConfigurationService(),
			new NullLogService(),
			productService,
			remoteService,
		));

		await service.connect(createTestWindow());
		await Promise.resolve();
		assert.strictEqual(firstRelay.connectCalls, 1);

		available = false;
		const internalService = service as unknown as { _ws?: { close(code?: number, reason?: string): void } };
		internalService._ws?.close(4000, 'pong timeout');
		connectionChanges.fire();
		activeRelay = recoveredRelay;
		available = true;
		connectionChanges.fire();
		await Promise.resolve();

		assert.strictEqual(recoveredRelay.connectCalls, 1);
		assert.strictEqual(service.isConnected, true);
	});

	test('connects when an initially unavailable Agent Host tunnel becomes ready', async () => {
		const connectionChanges = store.add(new Emitter<void>());
		const relay = store.add(new TestAgentHostVoiceRelay());
		const remoteService = new NullRemoteAgentHostService();
		let available = false;
		Object.defineProperties(remoteService, {
			onDidChangeConnections: { value: connectionChanges.event },
			connections: {
				get: () => available ? [{
					address: 'tunnel:test',
					name: 'test',
					clientId: 'test-client',
					status: RemoteAgentHostConnectionStatus.connected,
				}] : [],
			},
		});
		remoteService.getEntryByAddress = () => ({
			name: 'test',
			connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'test', clusterId: 'test' },
		});
		remoteService.getConnection = () => relay as never;
		const service = store.add(new VoiceClientService(
			true,
			new TestConfigurationService(),
			new NullLogService(),
			productService,
			remoteService,
		));

		await service.connect(createTestWindow());
		assert.strictEqual(relay.connectCalls, 0);
		available = true;
		connectionChanges.fire();
		await Promise.resolve();

		assert.strictEqual(relay.connectCalls, 1);
		assert.strictEqual(service.isConnected, true);
	});

	test('preserves the backend turn ID when audio has a narration ID', async () => {
		const { service } = createService();
		const events: IVoiceAudioResponse[] = [];
		store.add(service.onAudioResponse(event => events.push(event)));

		await service.connect(createTestWindow());
		const webSocket = socket();
		if (!webSocket.onmessage) {
			throw new Error('Voice WebSocket was not created');
		}
		webSocket.onmessage(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'audio_response',
				audio: 'audio',
				is_first_chunk: true,
				is_final: false,
				turn_id: 'backend-turn',
				narration_id: 'client-narration',
			}),
		}));

		assert.deepStrictEqual(events, [{
			audio: 'audio',
			isFirstChunk: true,
			isFinal: false,
			codingSessionId: undefined,
			transcript: undefined,
			turnId: 'backend-turn',
			responseId: 'client-narration',
		}]);
	});

	test('validates and translates scoped transcription metadata', async () => {
		const productService: IProductService = {
			_serviceBrand: undefined,
			...product,
			voiceWsUrl: 'ws://voice.test/realtime/voice',
		};
		const service = store.add(new VoiceClientService(
			false,
			new TestConfigurationService(),
			new NullLogService(),
			productService,
			new NullRemoteAgentHostService(),
		));
		const events: IVoiceTranscription[] = [];
		store.add(service.onTranscription(event => events.push(event)));

		await service.connect(createTestWindow());
		const socket = TestWebSocket.instance;
		if (!socket?.onmessage) {
			throw new Error('Voice WebSocket was not created');
		}
		socket.onmessage(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'transcription',
				text: 'create a file',
				status: 'partial',
				committed: 'create ',
				turn_id: 'turn-1',
				revision: 3,
			}),
		}));

		assert.deepStrictEqual(events, [{
			text: 'create a file',
			status: 'partial',
			committed: 'create ',
			turnId: 'turn-1',
			revision: 3,
		}]);
	});

	test('rejects invalid transcription status and revision', async () => {
		const productService: IProductService = {
			_serviceBrand: undefined,
			...product,
			voiceWsUrl: 'ws://voice.test/realtime/voice',
		};
		const service = store.add(new VoiceClientService(
			false,
			new TestConfigurationService(),
			new NullLogService(),
			productService,
			new NullRemoteAgentHostService(),
		));
		const events: IVoiceTranscription[] = [];
		store.add(service.onTranscription(event => events.push(event)));

		await service.connect(createTestWindow());
		const socket = TestWebSocket.instance;
		if (!socket?.onmessage) {
			throw new Error('Voice WebSocket was not created');
		}
		for (const message of [
			{ type: 'transcription', text: 'invalid status', status: 'pending' },
			{ type: 'transcription', text: 'unscoped revision', status: 'partial', revision: 1 },
			{ type: 'transcription', text: 'invalid revision', status: 'partial', turn_id: 'turn-1', revision: 1.5 },
			{ type: 'transcription', text: 'negative revision', status: 'partial', turn_id: 'turn-1', revision: -1 },
			{ type: 'transcription', text: 'legacy final' },
		]) {
			socket.onmessage(new mainWindow.MessageEvent('message', { data: JSON.stringify(message) }));
		}

		assert.deepStrictEqual(events, [{
			text: 'legacy final',
			status: 'final',
			committed: '',
			turnId: undefined,
			revision: undefined,
		}]);
	});

	test('sends microphone audio using the PTT protocol', async () => {
		const { service } = createService();

		await service.connect(createTestWindow());
		service.sendPttStart('turn-1');
		service.sendPttAudioChunk('cGNt');
		service.sendPttEnd();

		assert.deepStrictEqual(socket().sent, [
			{ type: 'ptt_start', turn_id: 'turn-1' },
			{ type: 'ptt_audio_chunk', audio: 'cGNt' },
			{ type: 'ptt_end' },
		]);
	});

	test('flags a passive ptt_start for hands-free barge-in listens', async () => {
		const { service } = createService();

		await service.connect(createTestWindow());
		service.sendPttStart('turn-passive', true);
		service.sendPttStart('turn-real', false);
		service.sendPttStart('turn-default');

		assert.deepStrictEqual(socket().sent, [
			{ type: 'ptt_start', turn_id: 'turn-passive', passive: true },
			{ type: 'ptt_start', turn_id: 'turn-real' },
			{ type: 'ptt_start', turn_id: 'turn-default' },
		]);
	});

	test('serializes configured language in start_session context', async () => {
		const { service } = createService({
			'agents.voice.language': 'fr-fr',
			'agents.voice.voice': 'kevin_neutral',
		});

		await service.connect(createTestWindow('de-DE'));
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		assert.deepStrictEqual(socket().sent.map(message => ({
			type: message.type,
			session_context: message.session_context,
			voice: message.voice,
		})), [{
			type: 'start_session',
			session_context: { sessions: [], display_locale: 'fr-FR' },
			voice: 'kevin_neutral',
		}]);
	});

	test('sends voice instructions when starting a session', async () => {
		const { service } = createService();

		await service.connect(createTestWindow());
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine', undefined, undefined, 'Pronounce "Contoso DB" as written.');

		assert.deepStrictEqual(socket().sent.map(message => ({
			type: message.type,
			voice_instructions: message.voice_instructions,
		})), [{
			type: 'start_session',
			voice_instructions: 'Pronounce "Contoso DB" as written.',
		}]);
	});

	test('uses browser locale for auto and falls back when unavailable', async () => {
		const first = createService({ 'agents.voice.language': 'auto' });
		await first.service.connect(createTestWindow('pt-BR'));
		first.service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');
		const browserLocale = socket().sent[0].session_context;

		const second = createService({ 'agents.voice.language': 'auto' });
		await second.service.connect(createTestWindow(''));
		second.service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');
		const fallbackLocale = socket().sent[0].session_context;

		assert.deepStrictEqual({ browserLocale, fallbackLocale }, {
			browserLocale: { sessions: [], display_locale: 'pt-BR' },
			fallbackLocale: { sessions: [], display_locale: 'en-US' },
		});
	});

	test('falls back for an unsupported configured BCP-47 locale', async () => {
		const { service } = createService({ 'agents.voice.language': 'uk-UA' });

		await service.connect(createTestWindow('fr-FR'));
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		assert.deepStrictEqual(socket().sent[0].session_context, {
			sessions: [],
			display_locale: 'en-US',
		});
	});

	test('falls back for a configured ASR-only language', async () => {
		const { service } = createService({ 'agents.voice.language': 'ar' });

		await service.connect(createTestWindow('ar-SA'));
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		assert.deepStrictEqual(socket().sent[0].session_context, {
			sessions: [],
			display_locale: 'en-US',
		});
	});

	test('preserves an automatic ASR-only browser locale', async () => {
		const { service } = createService({ 'agents.voice.language': 'auto' });

		await service.connect(createTestWindow('ar-SA'));
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		assert.deepStrictEqual(socket().sent[0].session_context, {
			sessions: [],
			display_locale: 'ar-SA',
		});
	});

	test('falls back for an unsupported automatic browser locale', async () => {
		const { service } = createService({ 'agents.voice.language': 'auto' });

		await service.connect(createTestWindow('he-IL'));
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		assert.deepStrictEqual(socket().sent[0].session_context, {
			sessions: [],
			display_locale: 'en-US',
		});
	});

	test('sends one live language update without changing voice', async () => {
		const { service, configurationService } = createService({
			'agents.voice.language': 'auto',
			'agents.voice.voice': 'victoria_neutral',
		});
		await service.connect(createTestWindow('en-GB'));
		service.sendStartSession({ sessions: [], display_locale: 'en-GB' }, 'machine');

		await configurationService.setUserConfiguration('agents.voice.language', 'fr-FR');
		fireConfigurationChange(configurationService, 'agents.voice.language');

		assert.deepStrictEqual(socket().sent.map(message => message.type === 'start_session' ? {
			type: message.type,
			session_context: message.session_context,
			voice: message.voice,
		} : message), [
			{
				type: 'start_session',
				session_context: { sessions: [], display_locale: 'en-GB' },
				voice: 'victoria_neutral',
			},
			{ type: 'set_language', language: 'fr-FR' },
		]);
	});

	test('defers a language update until the session starts', async () => {
		const { service, configurationService } = createService({ 'agents.voice.language': 'auto' });
		await service.connect(createTestWindow('en-US'));

		await configurationService.setUserConfiguration('agents.voice.language', 'fr');
		fireConfigurationChange(configurationService, 'agents.voice.language');
		service.sendStartSession({ sessions: [], display_locale: 'en-US' }, 'machine');

		assert.deepStrictEqual(socket().sent.map(message => ({
			type: message.type,
			session_context: message.session_context,
		})), [{
			type: 'start_session',
			session_context: { sessions: [], display_locale: 'fr' },
		}]);
	});

	test('does not update while disconnected and retains language on resume', async () => {
		const { service, configurationService } = createService({
			'agents.voice.language': 'auto',
			'agents.voice.voice': 'daniel_neutral',
		});
		await service.connect(createTestWindow('en-US'));
		const firstSocket = socket();
		firstSocket.onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_init', session_id: 'session-1' }),
		}));
		firstSocket.readyState = WebSocket.CLOSED;

		await configurationService.setUserConfiguration('agents.voice.language', 'de-DE');
		fireConfigurationChange(configurationService, 'agents.voice.language');
		await service.connect(createTestWindow('en-US'));
		service.sendResumeSession({ sessions: [], display_locale: 'en-US' }, 'machine', 'Keep replies concise.');

		assert.deepStrictEqual({
			disconnectedMessages: firstSocket.sent,
			resumeMessages: socket().sent.map(message => ({
				type: message.type,
				session_id: message.session_id,
				session_context: message.session_context,
				voice: message.voice,
				voice_instructions: message.voice_instructions,
			})),
		}, {
			disconnectedMessages: [],
			resumeMessages: [{
				type: 'resume_session',
				session_id: 'session-1',
				session_context: { sessions: [], display_locale: 'de-DE' },
				voice: 'daniel_neutral',
				voice_instructions: 'Keep replies concise.',
			}],
		});
	});

	test('adopts the server session id and clears isResuming on session_init, even after a failed resume', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_init', session_id: 'session-1' }),
		}));
		assert.strictEqual(service.currentSessionId, 'session-1');
		assert.strictEqual(service.isResuming, false);

		// Simulate a reconnect attempt: the socket opens (marking us as
		// resuming the prior session id) but the server can't resume and
		// starts a brand new session instead.
		socket().onopen?.();
		assert.strictEqual(service.isResuming, true);

		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_init', session_id: 'session-2' }),
		}));

		assert.strictEqual(service.currentSessionId, 'session-2');
		assert.strictEqual(service.isResuming, false);
	});

	test('adopts the server session id and clears isResuming on session_resumed', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_init', session_id: 'session-1' }),
		}));
		socket().onopen?.();
		assert.strictEqual(service.isResuming, true);

		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_resumed', session_id: 'session-1' }),
		}));

		assert.strictEqual(service.currentSessionId, 'session-1');
		assert.strictEqual(service.isResuming, false);
	});

	test('resets isResuming on cleanup (terminal disconnect)', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_init', session_id: 'session-1' }),
		}));
		socket().onopen?.();
		assert.strictEqual(service.isResuming, true);

		socket().onclose?.(new mainWindow.CloseEvent('close', { code: 1000, wasClean: true }));

		assert.strictEqual(service.isResuming, false);
		assert.strictEqual(service.currentSessionId, undefined);
	});
});
