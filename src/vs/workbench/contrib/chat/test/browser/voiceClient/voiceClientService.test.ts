/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import product from '../../../../../../platform/product/common/product.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { resolveAutomaticVoiceLanguage, VoiceClientService } from '../../../browser/voiceClient/voiceClientService.js';
import { IVoiceAudioResponse, IVoiceBargeIn, IVoiceConnectionIssue, IVoiceFatalDisconnect, IVoiceNarrationAck, IVoiceNarrationSignal, IVoiceSpeechStarted, IVoiceTranscription, normalizeAgentsVoiceId } from '../../../common/voiceClient/voiceClientService.js';

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
			configurationService,
			new NullLogService(),
			productService,
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

	test('preserves the turn ID on speech-started events', async () => {
		const { service } = createService();
		const events: IVoiceSpeechStarted[] = [];
		store.add(service.onSpeechStarted(event => events.push(event)));

		await service.connect(createTestWindow());
		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'speech_started',
				turn_id: 'passive-turn',
			}),
		}));

		assert.deepStrictEqual(events, [{ turnId: 'passive-turn' }]);
	});

	test('preserves checkpoint interruption metadata from the backend', async () => {
		const { service } = createService();
		const events: IVoiceNarrationSignal[] = [];
		store.add(service.onNarrationInterrupted(event => events.push(event)));

		await service.connect(createTestWindow());
		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'narration_interrupted',
				narration_id: 'checkpoint-narration',
				coding_session_id: 'chat-session:/one',
				retryable: false,
				reason: 'superseded_by_response',
			}),
		}));

		assert.deepStrictEqual(events, [{
			narrationId: 'checkpoint-narration',
			codingSessionId: 'chat-session:/one',
			retryable: false,
			reason: 'superseded_by_response',
		}]);
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
				request_id: 'request-1',
				checkpoint_id: 'planning',
				sequence: 1,
				narration_kind: 'checkpoint',
				playback_id: 'playback-1',
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
			requestId: 'request-1',
			checkpointId: 'planning',
			sequence: 1,
			narrationKind: 'checkpoint',
			playbackId: 'playback-1',
		}]);
	});

	test('validates and translates scoped transcription metadata', async () => {
		const productService: IProductService = {
			_serviceBrand: undefined,
			...product,
			voiceWsUrl: 'ws://voice.test/realtime/voice',
		};
		const service = store.add(new VoiceClientService(
			new TestConfigurationService(),
			new NullLogService(),
			productService,
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
			new TestConfigurationService(),
			new NullLogService(),
			productService,
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

	test('sends first-class checkpoint narration metadata', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		const narrationId = service.requestNarration('chat-session:/one', 'checkpoint', 'Updating the code.', undefined, {
			requestId: 'request-1',
			checkpointId: 'editing',
			sequence: 2,
		});
		service.sendNarrationPlaybackComplete('chat-session:/one', narrationId!, 'playback-1');

		assert.deepStrictEqual(socket().sent.slice(1), [
			{
				type: 'request_narration',
				coding_session_id: 'chat-session:/one',
				kind: 'checkpoint',
				text: 'Updating the code.',
				narration_id: narrationId,
				request_id: 'request-1',
				checkpoint_id: 'editing',
				sequence: 2,
			},
			{
				type: 'narration_playback_complete',
				coding_session_id: 'chat-session:/one',
				narration_id: narrationId,
				playback_id: 'playback-1',
			},
		]);
	});

	test('sends typed confirmation narration metadata', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		const narrationId = service.requestNarration(
			'chat-session:/one',
			'confirmation',
			'questionnaire: 1 question',
			undefined,
			undefined,
			'questionnaire',
		);

		assert.deepStrictEqual(socket().sent[1], {
			type: 'request_narration',
			coding_session_id: 'chat-session:/one',
			kind: 'confirmation',
			text: 'questionnaire: 1 question',
			narration_id: narrationId,
			confirmation_type: 'questionnaire',
		});
	});

	test('persists and clears typed confirmation session state', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		socket().onopen?.();
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		service.sendSessionContext({
			sessions: [{
				id: 'chat-session:/one',
				is_active: true,
				agent_state: 'waiting_for_confirmation',
				agent_state_detail: 'questionnaire: 1 question',
				confirmation_type: 'questionnaire',
			}],
			display_locale: 'en-US',
		});
		service.flushSessionContext();
		service.sendSessionContext({
			sessions: [{
				id: 'chat-session:/one',
				is_active: true,
				agent_state: 'idle',
			}],
			display_locale: 'en-US',
		});
		service.flushSessionContext();

		assert.deepStrictEqual(socket().sent.slice(1), [
			{
				type: 'session_context',
				mode: 'delta',
				upserts: [{
					id: 'chat-session:/one',
					is_active: true,
					agent_state: 'waiting_for_confirmation',
					agent_state_detail: 'questionnaire: 1 question',
					confirmation_type: 'questionnaire',
				}],
				removes: [],
			},
			{
				type: 'session_context',
				mode: 'delta',
				upserts: [{
					id: 'chat-session:/one',
					agent_state: 'idle',
					agent_state_detail: null,
					confirmation_type: null,
				}],
				removes: [],
			},
		]);
	});

	test('invalidated context preserves pending deletion tombstones', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		socket().onopen?.();
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');
		const sessionId = 'chat-session:/one';

		service.sendSessionContext({
			sessions: [{
				id: sessionId,
				is_active: true,
				agent_state: 'waiting_for_confirmation',
				agent_state_detail: 'Which region?',
				confirmation_type: 'questionnaire',
				pending: {
					type: 'questions',
					pending_id: 'request-1#p1',
					request_id: 'request-1',
					questions: [],
				},
			}],
			display_locale: 'en-US',
		});
		service.flushSessionContext();
		service.invalidateSessionCache(sessionId);
		service.sendSessionContext({
			sessions: [{
				id: sessionId,
				is_active: true,
				agent_state: 'waiting_for_confirmation',
				agent_state_detail: 'Which region?',
				confirmation_type: 'questionnaire',
			}],
			display_locale: 'en-US',
		});
		service.flushSessionContext();

		assert.deepStrictEqual(socket().sent.at(-1), {
			type: 'session_context',
			mode: 'delta',
			upserts: [{
				id: sessionId,
				is_active: true,
				agent_state: 'waiting_for_confirmation',
				agent_state_detail: 'Which region?',
				confirmation_type: 'questionnaire',
				pending: null,
			}],
			removes: [],
		});
	});

	test('normalizes legacy suppressed narration acknowledgements', async () => {
		const { service } = createService();
		const events: IVoiceNarrationAck[] = [];
		store.add(service.onNarrationAck(event => events.push(event)));
		await service.connect(createTestWindow());

		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({
				type: 'narration_ack',
				narration_id: 'narration-1',
				coding_session_id: 'chat-session:/one',
				disposition: 'suppressed',
				reason: 'stale',
			}),
		}));
		assert.deepStrictEqual(events, [{
			narrationId: 'narration-1',
			codingSessionId: 'chat-session:/one',
			disposition: 'suppressed',
			reason: 'stale',
		}]);
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

	test('serializes the pending id on a question narration', async () => {
		const { service } = createService();

		await service.connect(createTestWindow());
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');
		const questionId = service.requestNarration('cs1', 'question', 'Which region?', undefined, undefined, undefined, { pendingId: 'p1' });
		const replyId = service.requestNarration('cs1', 'response', 'Done.');

		assert.deepStrictEqual(socket().sent.filter(message => message.type === 'request_narration'), [
			{ type: 'request_narration', coding_session_id: 'cs1', kind: 'question', text: 'Which region?', narration_id: questionId, pending_id: 'p1' },
			{ type: 'request_narration', coding_session_id: 'cs1', kind: 'response', text: 'Done.', narration_id: replyId },
		]);
	});

	test('prepares for narration audio before sending the request', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');
		const sentBeforeNarration = socket().sent.length;
		let sentWhenPrepared = -1;

		const narrationId = service.requestNarration('cs1', 'response', 'Done.', undefined, undefined, undefined, undefined, () => {
			sentWhenPrepared = socket().sent.length;
			return true;
		});

		assert.deepStrictEqual({
			sentBeforeNarration,
			sentWhenPrepared,
			sentAfterNarration: socket().sent.length,
			narrationId: typeof narrationId,
		}, {
			sentBeforeNarration: 1,
			sentWhenPrepared: 1,
			sentAfterNarration: 2,
			narrationId: 'string',
		});
	});

	test('links a tool result to its resolved coding session', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());

		service.sendToolResult('call-1', 'ok', 'copilotcli:/session-1');

		assert.deepStrictEqual(socket().sent.at(-1), {
			type: 'tool_result',
			call_id: 'call-1',
			result: 'ok',
			coding_session_id: 'copilotcli:/session-1',
		});
	});

	test('drops a narration requested before the session starts', async () => {
		const { service } = createService();

		await service.connect(createTestWindow());
		const narrationId = service.requestNarration('cs1', 'question', 'Which region?', undefined, undefined, undefined, { pendingId: 'p1' });

		assert.strictEqual(narrationId, undefined);
		assert.deepStrictEqual(socket().sent.filter(message => message.type === 'request_narration'), []);
	});

	test('normalizes a legacy voice identifier in start_session', async () => {
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
			auto_narrate: message.auto_narrate,
		})), [{
			type: 'start_session',
			session_context: { sessions: [], display_locale: 'fr-FR' },
			voice: 'oak_neutral',
			auto_narrate: false,
		}]);
	});

	test('normalizes every canonical and legacy voice identifier, and falls back for invalid values', () => {
		assert.deepStrictEqual(
			[
				'harper_neutral', 'birch_neutral', 'junho_neutral', 'oak_neutral',
				'victoria_neutral', 'maya_neutral', 'daniel_neutral', 'kevin_neutral',
				undefined, '  ', 42, 'unknown_voice',
			].map(normalizeAgentsVoiceId),
			[
				'harper_neutral', 'birch_neutral', 'junho_neutral', 'oak_neutral',
				'harper_neutral', 'birch_neutral', 'junho_neutral', 'oak_neutral',
				'birch_neutral', 'birch_neutral', 'birch_neutral', 'birch_neutral',
			]
		);
	});

	test('uses Birch for missing and legacy Maya values in start_session', async () => {
		const voices = [];
		for (const configuration of [undefined, { 'agents.voice.voice': 'maya_neutral' }]) {
			const { service } = createService(configuration);
			await service.connect(createTestWindow());
			service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');
			voices.push(socket().sent[0].voice);
			service.disconnect();
		}

		assert.deepStrictEqual(voices, ['birch_neutral', 'birch_neutral']);
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

	test('uses the display language for auto', async () => {
		const first = createService({ 'agents.voice.language': 'auto' });
		await first.service.connect(createTestWindow('pt-BR'));
		first.service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');
		const withBrowserLocale = socket().sent[0].session_context;

		const second = createService({ 'agents.voice.language': 'auto' });
		await second.service.connect(createTestWindow(''));
		second.service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');
		const withoutBrowserLocale = socket().sent[0].session_context;

		assert.deepStrictEqual({ withBrowserLocale, withoutBrowserLocale }, {
			withBrowserLocale: { sessions: [], display_locale: 'en' },
			withoutBrowserLocale: { sessions: [], display_locale: 'en' },
		});
	});

	test('resolves automatic language from display language before browser locale', () => {
		assert.deepStrictEqual({
			displayLanguage: resolveAutomaticVoiceLanguage('en-US', 'de'),
			englishDisplayLanguage: resolveAutomaticVoiceLanguage('de-DE', 'en'),
			browserLocale: resolveAutomaticVoiceLanguage('pt-BR', undefined),
			unsupportedDisplayLanguage: resolveAutomaticVoiceLanguage('pt-BR', 'he-IL'),
			missing: resolveAutomaticVoiceLanguage(undefined, undefined),
		}, {
			displayLanguage: 'de',
			englishDisplayLanguage: 'en',
			browserLocale: 'pt-BR',
			unsupportedDisplayLanguage: 'pt-BR',
			missing: 'en-US',
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

	test('prefers the display language over an ASR-only browser locale', async () => {
		const { service } = createService({ 'agents.voice.language': 'auto' });

		await service.connect(createTestWindow('ar-SA'));
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		assert.deepStrictEqual(socket().sent[0].session_context, {
			sessions: [],
			display_locale: 'en',
		});
	});

	test('prefers the display language over an unsupported browser locale', async () => {
		const { service } = createService({ 'agents.voice.language': 'auto' });

		await service.connect(createTestWindow('he-IL'));
		service.sendStartSession({ sessions: [], display_locale: '' }, 'machine');

		assert.deepStrictEqual(socket().sent[0].session_context, {
			sessions: [],
			display_locale: 'en',
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
				session_context: { sessions: [], display_locale: 'en' },
				voice: 'harper_neutral',
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
				auto_narrate: message.auto_narrate,
			})),
		}, {
			disconnectedMessages: [],
			resumeMessages: [{
				type: 'resume_session',
				session_id: 'session-1',
				session_context: { sessions: [], display_locale: 'de-DE' },
				voice: 'junho_neutral',
				voice_instructions: 'Keep replies concise.',
				auto_narrate: false,
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

	test('reports when an abnormal close has scheduled a reconnect', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		socket().onopen?.();

		socket().onclose?.(new mainWindow.CloseEvent('close', { code: 4000 }));

		assert.strictEqual(service.willReconnect, true);
		service.disconnect();
		assert.strictEqual(service.willReconnect, false);
	});

	test('treats a registry fatal code as terminal and does not reconnect', async () => {
		const { service } = createService();
		const fatal: IVoiceFatalDisconnect[] = [];
		store.add(service.onFatalDisconnect(event => fatal.push(event)));

		await service.connect(createTestWindow());
		const webSocket = socket();
		webSocket.onopen?.();
		webSocket.onclose?.(new mainWindow.CloseEvent('close', {
			code: 4003,
			reason: 'Voice Mode needs a verified @microsoft.com email',
		}));

		assert.strictEqual(fatal.length, 1);
		assert.strictEqual(fatal[0].code, 4003);
		assert.strictEqual(fatal[0].kind, 'fatal');
		assert.strictEqual(fatal[0].reason, 'Voice Mode needs a verified @microsoft.com email');
	});

	test('reports a clean close as terminal so the UI cannot strand on Reconnecting', async () => {
		const { service } = createService();
		const fatal: IVoiceFatalDisconnect[] = [];
		store.add(service.onFatalDisconnect(event => fatal.push(event)));

		await service.connect(createTestWindow());
		const webSocket = socket();
		webSocket.onopen?.();
		webSocket.onclose?.(new mainWindow.CloseEvent('close', { code: 1001, reason: 'Session idle timeout' }));

		assert.strictEqual(fatal.length, 1);
		assert.strictEqual(fatal[0].kind, 'expected');
	});

	test('keeps reconnecting for a transient registry code but says why', async () => {
		const { service } = createService();
		const fatal: IVoiceFatalDisconnect[] = [];
		const issues: IVoiceConnectionIssue[] = [];
		store.add(service.onFatalDisconnect(event => fatal.push(event)));
		store.add(service.onConnectionIssue(event => issues.push(event)));

		await service.connect(createTestWindow());
		const webSocket = socket();
		webSocket.onopen?.();
		webSocket.onclose?.(new mainWindow.CloseEvent('close', { code: 4503, reason: 'Cannot reach GitHub' }));

		assert.strictEqual(fatal.length, 0, 'a transient code must not be terminal');
		assert.deepStrictEqual(issues, [{ code: 4503, reason: 'Cannot reach GitHub' }]);
	});

	test('a rejected connection does not refill the reconnect budget', async () => {
		const { service } = createService();
		const reconnect = Reflect.get(service, '_connectWebSocket') as () => void;
		await service.connect(createTestWindow());

		socket().onopen?.();
		socket().onclose?.(new mainWindow.CloseEvent('close', { code: 4503, reason: 'GitHub' }));
		assert.strictEqual(Reflect.get(service, '_reconnectAttempts'), 1);

		reconnect.call(service);
		socket().onopen?.();
		assert.strictEqual(Reflect.get(service, '_reconnectAttempts'), 1, 'onopen must not reset the budget');

		socket().onclose?.(new mainWindow.CloseEvent('close', { code: 4503, reason: 'GitHub' }));
		assert.strictEqual(Reflect.get(service, '_reconnectAttempts'), 2);
	});

	test('a recoverable close reports its reason after the disconnect is visible', async () => {
		const { service } = createService();
		const order: string[] = [];
		store.add(service.onDidChangeConnectionState(connected => order.push(`connected:${connected}`)));
		store.add(service.onConnectionIssue(e => order.push(`issue:${e.reason}`)));

		await service.connect(createTestWindow());
		socket().onopen?.();
		socket().onclose?.(new mainWindow.CloseEvent('close', { code: 4503, reason: 'Cannot reach GitHub' }));

		assert.deepStrictEqual(order, ['connected:true', 'connected:false', 'issue:Cannot reach GitHub']);
	});

	test('a confirmed session resets the reconnect budget', async () => {
		const { service } = createService();
		await service.connect(createTestWindow());
		const webSocket = socket();
		webSocket.onopen?.();
		webSocket.onclose?.(new mainWindow.CloseEvent('close', { code: 4503, reason: 'GitHub' }));
		assert.strictEqual(Reflect.get(service, '_reconnectAttempts'), 1);

		(Reflect.get(service, '_connectWebSocket') as () => void).call(service);
		socket().onopen?.();
		socket().onmessage?.(new mainWindow.MessageEvent('message', {
			data: JSON.stringify({ type: 'session_init', session_id: 'session-1' }),
		}));

		assert.strictEqual(Reflect.get(service, '_reconnectAttempts'), 0);
	});

	test('reports a missing backend URL instead of failing silently', async () => {
		const productWithoutUrl: IProductService = { _serviceBrand: undefined, ...product, voiceWsUrl: '' };
		const configurationService = new TestConfigurationService({});
		const service = store.add(new VoiceClientService(configurationService, new NullLogService(), productWithoutUrl));
		const fatal: IVoiceFatalDisconnect[] = [];
		store.add(service.onFatalDisconnect(event => fatal.push(event)));

		await service.connect(createTestWindow());

		assert.strictEqual(fatal.length, 1);
		assert.strictEqual(fatal[0].clientSide, true);
	});


	test('gives up after the reconnect budget rather than retrying for minutes', async () => {
		// The budget is deliberately short: a user watching a reconnect would rather
		// be told it failed than wait. Pin it so it cannot silently grow again.
		const { service } = createService();
		const fatal: IVoiceFatalDisconnect[] = [];
		store.add(service.onFatalDisconnect(event => fatal.push(event)));
		await service.connect(createTestWindow());

		const reconnect = Reflect.get(service, '_connectWebSocket') as () => void;
		const started = Date.now() - 61_000;
		Reflect.set(service, '_reconnectStartedAt', started);

		socket().onopen?.();
		socket().onclose?.(new mainWindow.CloseEvent('close', { code: 4503, reason: 'GitHub' }));

		assert.strictEqual(fatal.length, 1, 'an exhausted budget must report itself');
		assert.strictEqual(fatal[0].kind, 'fatal');
		assert.strictEqual(service.willReconnect, false, 'no retry may remain scheduled');
		void reconnect;
	});

});
