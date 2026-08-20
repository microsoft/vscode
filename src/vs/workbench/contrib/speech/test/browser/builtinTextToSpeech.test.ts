/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BuiltinTextToSpeechEngine, pickVoice } from '../../browser/builtinTextToSpeech.js';
import { SpeechService } from '../../browser/speechService.js';
import { HasSpeechProvider, HasTextToSpeechProvider, IBuiltinTextToSpeechEngine, ISpeechProvider, ISpeechService, ITextToSpeechSession, TextToSpeechStatus } from '../../common/speechService.js';

suite('SpeechService - built-in text to speech', () => {

	// `SpeechService` installs the handler of a module scoped extension point, which
	// can only be done once per process. The service is therefore created once for
	// the whole suite; each test cleans up its own registrations instead.
	const suiteDisposables = new DisposableStore();
	let contextKeyService: ContextKeyService;
	let speechService: SpeechService;
	let instantiationService: TestInstantiationService;

	suiteSetup(() => {
		instantiationService = suiteDisposables.add(new TestInstantiationService());
		contextKeyService = suiteDisposables.add(new ContextKeyService(new TestConfigurationService()));

		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IHostService, { onDidChangeFocus: Event.None, hasFocus: true });
		instantiationService.stub(IExtensionService, { activateByEvent: async () => { } });

		speechService = suiteDisposables.add(instantiationService.createInstance(SpeechService));
		instantiationService.stub(ISpeechService, speechService);
	});

	suiteTeardown(() => suiteDisposables.dispose());

	const testDisposables = new DisposableStore();
	teardown(() => testDisposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	function createTextToSpeechSession(synthesized: string[]): ITextToSpeechSession {
		const emitter = testDisposables.add(new Emitter<{ status: TextToSpeechStatus; text?: string }>());

		return {
			onDidChange: emitter.event,
			async synthesize(text: string) {
				synthesized.push(text);
			}
		};
	}

	function createBuiltinEngine(isSupported: boolean, synthesized: string[] = [], priority = 0): IBuiltinTextToSpeechEngine {
		return {
			isSupported,
			priority,
			createTextToSpeechSession: () => createTextToSpeechSession(synthesized)
		};
	}

	function availability() {
		return {
			hasSpeechProvider: speechService.hasSpeechProvider,
			hasTextToSpeechProvider: speechService.hasTextToSpeechProvider,
			hasSpeechProviderKey: contextKeyService.getContextKeyValue(HasSpeechProvider.key),
			hasTextToSpeechProviderKey: contextKeyService.getContextKeyValue(HasTextToSpeechProvider.key)
		};
	}

	const unavailable = { hasSpeechProvider: false, hasTextToSpeechProvider: false, hasSpeechProviderKey: false, hasTextToSpeechProviderKey: false };

	test('built-in engine enables text to speech without enabling speech to text', () => {
		assert.deepStrictEqual(availability(), unavailable);

		const registration = speechService.registerBuiltinTextToSpeechEngine(createBuiltinEngine(true));
		assert.deepStrictEqual(availability(), { hasSpeechProvider: false, hasTextToSpeechProvider: true, hasSpeechProviderKey: false, hasTextToSpeechProviderKey: true });

		registration.dispose();
		assert.deepStrictEqual(availability(), unavailable);
	});

	test('unsupported built-in engine leaves text to speech unavailable', () => {
		testDisposables.add(speechService.registerBuiltinTextToSpeechEngine(createBuiltinEngine(false)));

		assert.deepStrictEqual(availability(), unavailable);
	});

	test('built-in engine synthesizes when no speech provider is registered', async () => {
		const synthesized: string[] = [];
		testDisposables.add(speechService.registerBuiltinTextToSpeechEngine(createBuiltinEngine(true, synthesized)));

		const cts = testDisposables.add(new CancellationTokenSource());
		const session = await speechService.createTextToSpeechSession(cts.token);
		await session.synthesize('hello world');
		cts.cancel(); // the session owns resources until the token is cancelled

		assert.deepStrictEqual(synthesized, ['hello world']);
	});

	test('a registered speech provider takes precedence over the built-in engine', async () => {
		const synthesizedByBuiltin: string[] = [];
		const synthesizedByProvider: string[] = [];

		testDisposables.add(speechService.registerBuiltinTextToSpeechEngine(createBuiltinEngine(true, synthesizedByBuiltin)));

		const provider: ISpeechProvider = {
			metadata: { extension: { value: 'test.speech', _lower: 'test.speech' }, displayName: 'Test' },
			createSpeechToTextSession: () => { throw new Error('not implemented'); },
			createKeywordRecognitionSession: () => { throw new Error('not implemented'); },
			createTextToSpeechSession: () => createTextToSpeechSession(synthesizedByProvider)
		};
		testDisposables.add(speechService.registerSpeechProvider('test.speech', provider));

		const cts = testDisposables.add(new CancellationTokenSource());
		const session = await speechService.createTextToSpeechSession(cts.token);
		await session.synthesize('hello world');
		cts.cancel(); // the session owns resources until the token is cancelled

		assert.deepStrictEqual({ synthesizedByProvider, synthesizedByBuiltin }, { synthesizedByProvider: ['hello world'], synthesizedByBuiltin: [] });
	});

	test('a higher priority engine supersedes a lower priority one', async () => {
		const fallback: string[] = [];
		const preferred: string[] = [];

		testDisposables.add(speechService.registerBuiltinTextToSpeechEngine(createBuiltinEngine(true, fallback, 0)));
		testDisposables.add(speechService.registerBuiltinTextToSpeechEngine(createBuiltinEngine(true, preferred, 10)));

		const cts = testDisposables.add(new CancellationTokenSource());
		const session = await speechService.createTextToSpeechSession(cts.token);
		await session.synthesize('hello world');
		cts.cancel();

		assert.deepStrictEqual({ preferred, fallback }, { preferred: ['hello world'], fallback: [] });
	});

	test('an unsupported high priority engine falls back to a supported one', async () => {
		const fallback: string[] = [];

		testDisposables.add(speechService.registerBuiltinTextToSpeechEngine(createBuiltinEngine(true, fallback, 0)));
		testDisposables.add(speechService.registerBuiltinTextToSpeechEngine(createBuiltinEngine(false, [], 10)));

		const cts = testDisposables.add(new CancellationTokenSource());
		const session = await speechService.createTextToSpeechSession(cts.token);
		await session.synthesize('hello world');
		cts.cancel();

		assert.deepStrictEqual(fallback, ['hello world']);
	});

	test('text to speech fails without a provider or supported built-in engine', async () => {
		const cts = testDisposables.add(new CancellationTokenSource());

		await assert.rejects(() => speechService.createTextToSpeechSession(cts.token));
	});

	test('the workbench contribution registers the built-in engine', () => {
		assert.deepStrictEqual(availability(), unavailable);

		const engine = instantiationService.createInstance(BuiltinTextToSpeechEngine);
		const registration = testDisposables.add(speechService.registerBuiltinTextToSpeechEngine(engine));

		assert.deepStrictEqual({
			// Only true where the platform has a synthesizer; the important part
			// is that speech to text stays untouched either way.
			available: availability().hasTextToSpeechProvider === engine.isSupported,
			speechToTextUnaffected: availability().hasSpeechProvider
		}, {
			available: true,
			speechToTextUnaffected: false
		});

		registration.dispose();

		assert.deepStrictEqual(availability(), unavailable);
	});
});

suite('BuiltinTextToSpeechEngine - voice selection', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function voice(name: string, lang: string): SpeechSynthesisVoice {
		return { name, lang, default: false, localService: true, voiceURI: name };
	}

	const voices = [
		voice('Daniel', 'en-GB'),
		voice('Samantha', 'en-US'),
		voice('Alice', 'it-IT'),
		voice('Amelie', 'fr-CA')
	];

	test('picks a voice of the requested language, falling back to the platform default', () => {
		assert.deepStrictEqual({
			exactTag: pickVoice(voices, 'en-GB')?.name,
			primarySubtagOnly: pickVoice(voices, 'fr-FR')?.name,	// only fr-CA exists
			caseInsensitive: pickVoice(voices, 'IT-it')?.name,
			underscoreSeparator: pickVoice(voices, 'it_IT')?.name,
			// Without a match there is nothing better to say than the platform default.
			unknownLanguage: pickVoice(voices, 'ja-JP'),
			noLanguage: pickVoice(voices, undefined),
			noVoices: pickVoice([], 'en-US')
		}, {
			exactTag: 'Daniel',
			primarySubtagOnly: 'Amelie',
			caseInsensitive: 'Alice',
			underscoreSeparator: 'Alice',
			unknownLanguage: undefined,
			noLanguage: undefined,
			noVoices: undefined
		});
	});
});
