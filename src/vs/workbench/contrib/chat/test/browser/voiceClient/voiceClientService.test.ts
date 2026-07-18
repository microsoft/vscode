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
import { VoiceClientService } from '../../../browser/voiceClient/voiceClientService.js';
import { IVoiceBargeIn } from '../../../common/voiceClient/voiceClientService.js';

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
		service.sendResumeSession({ sessions: [], display_locale: 'en-US' }, 'machine');

		assert.deepStrictEqual({
			disconnectedMessages: firstSocket.sent,
			resumeMessages: socket().sent.map(message => ({
				type: message.type,
				session_id: message.session_id,
				session_context: message.session_context,
				voice: message.voice,
			})),
		}, {
			disconnectedMessages: [],
			resumeMessages: [{
				type: 'resume_session',
				session_id: 'session-1',
				session_context: { sessions: [], display_locale: 'de-DE' },
				voice: 'daniel_neutral',
			}],
		});
	});
});
