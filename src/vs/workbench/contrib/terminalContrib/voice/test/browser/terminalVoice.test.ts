/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ChatSpeechToTextState, IChatDictationTranscript, IChatSpeechToTextService } from '../../../../chat/browser/speechToText/chatSpeechToTextService.js';
import { ISpeechService } from '../../../../speech/common/speechService.js';
import { ITerminalContribution, ITerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { postProcessTerminalDictation, TerminalVoiceSession } from '../../browser/terminalVoice.js';

suite('postProcessTerminalDictation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('substitutes spoken symbols including single word forms like "dash"', () => {
		assert.strictEqual(postProcessTerminalDictation('ls dash la'), 'ls - la');
	});

	test('prefers multi-word symbol phrases over their single word forms', () => {
		assert.strictEqual(postProcessTerminalDictation('echo dollar sign path'), 'echo $ path');
	});

	test('strips sentence punctuation added by the transcriber', () => {
		assert.strictEqual(postProcessTerminalDictation('git status.'), 'git status');
	});

	test('lower-cases the capitalized first word', () => {
		assert.strictEqual(postProcessTerminalDictation('Echo hello'), 'echo hello');
	});

	test('substitutes every occurrence of a symbol name', () => {
		assert.strictEqual(postProcessTerminalDictation('a ampersand b ampersand c'), 'a & b & c');
	});
});

suite('TerminalVoiceSession', () => {
	const store = new DisposableStore();
	ensureNoDisposablesAreLeakedInTestSuite();

	let sentTexts: string[];
	let instantiationService: TestInstantiationService;
	let activeInstanceChanged: Emitter<ITerminalInstance | undefined>;

	setup(() => {
		sentTexts = [];
		instantiationService = store.add(new TestInstantiationService());
		activeInstanceChanged = store.add(new Emitter<ITerminalInstance | undefined>());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IKeybindingService, new class extends mock<IKeybindingService>() {
			override lookupKeybinding() { return undefined; }
		});
		instantiationService.stub(IHoverService, new class extends mock<IHoverService>() { });
		const activeInstance = new class extends mock<ITerminalInstance>() {
			override async sendText(text: string): Promise<void> { sentTexts.push(text); }
			override xterm = undefined;
			override registerMarker() { return undefined; }
			override getContribution<T extends ITerminalContribution>(): T | null { return null; }
		};
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override onDidChangeActiveInstance = activeInstanceChanged.event;
			override onDidDisposeInstance = Event.None;
			override get activeInstance() { return activeInstance as unknown as ITerminalInstance; }
		});
	});

	teardown(() => {
		const holder = TerminalVoiceSession as unknown as { _instance: TerminalVoiceSession | undefined };
		holder._instance?.dispose();
		holder._instance = undefined;
		store.clear();
	});

	/** Lets tests control completion of the built-in engine's final transcription. */
	function stubBuiltinEngine(transcriptEmitter: Emitter<IChatDictationTranscript>, stateEmitter: Emitter<ChatSpeechToTextState>, transcribe: () => Promise<string | undefined>): void {
		let state = ChatSpeechToTextState.Idle;
		instantiationService.stub(ISpeechService, new class extends mock<ISpeechService>() { });
		instantiationService.stub(IChatSpeechToTextService, new class extends mock<IChatSpeechToTextService>() {
			override readonly isConfigured = true;
			override get state() { return state; }
			override readonly onDidUpdateTranscript = transcriptEmitter.event;
			override readonly onDidChangeState = stateEmitter.event;
			override readonly onDidChangePreparingModel = Event.None;
			override readonly onDidChangeModelDownloadProgress = Event.None;
			override readonly isPreparingModel = false;
			override async start(): Promise<void> { state = ChatSpeechToTextState.Recording; }
			override async stopAndTranscribe(): Promise<string | undefined> {
				const finalText = await transcribe();
				state = ChatSpeechToTextState.Idle;
				stateEmitter.fire(state);
				return finalText;
			}
			override async cancel(): Promise<void> { }
		});
	}

	// Stopping the built-in engine fetches its final transcript asynchronously.
	// A teardown-only stop() racing in during that await (e.g. the active
	// terminal instance changing as the command palette closes when the Stop
	// Dictation command runs) must not cancel the engine and drop the text.
	test('keeps dictated text when the active instance changes during accept', async () => {
		const transcriptEmitter = store.add(new Emitter<IChatDictationTranscript>());
		const stateEmitter = store.add(new Emitter<ChatSpeechToTextState>());
		const transcribed = new DeferredPromise<string | undefined>();
		stubBuiltinEngine(transcriptEmitter, stateEmitter, () => transcribed.p);

		const session = TerminalVoiceSession.getInstance(instantiationService as unknown as IInstantiationService);
		await session.start();
		transcriptEmitter.fire({ text: 'echo hello', finalizedText: 'echo hello' });

		session.stop(true);
		activeInstanceChanged.fire(undefined);
		transcribed.complete('echo hello');
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.ok(sentTexts.some(t => t.includes('echo hello')), `expected dictated text to be sent, got ${JSON.stringify(sentTexts)}`);
		session.dispose();
	});
});
