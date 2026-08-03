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
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISpeechService } from '../../../../speech/common/speechService.js';
import { ChatSpeechToTextState, IChatSpeechToTextService, IChatDictationTranscript } from '../../../../chat/browser/speechToText/chatSpeechToTextService.js';
import { ITerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { TerminalVoiceSession } from '../../browser/terminalVoice.js';

suite('TerminalVoiceSession repro', () => {
	const store = new DisposableStore();
	ensureNoDisposablesAreLeakedInTestSuite();

	let sentTexts: string[];
	let instantiationService: TestInstantiationService;
	let activeInstanceChanged: Emitter<ITerminalInstance | undefined>;

	function setupBuiltin(transcriptEmitter: Emitter<IChatDictationTranscript>, stateEmitter: Emitter<ChatSpeechToTextState>, transcribe: () => Promise<string | undefined>) {
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
				const t = await transcribe();
				state = ChatSpeechToTextState.Idle;
				stateEmitter.fire(state);
				return t;
			}
			override cancel(): void { }
		});
	}

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
			getContribution() { return undefined; }
		};
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override onDidChangeActiveInstance = activeInstanceChanged.event;
			override onDidDisposeInstance = Event.None;
			override get activeInstance() { return activeInstance as unknown as ITerminalInstance; }
		});
	});

	teardown(() => {
		const inst = (TerminalVoiceSession as unknown as { _instance: { dispose(): void } | undefined })._instance;
		inst?.dispose();
		(TerminalVoiceSession as unknown as { _instance: TerminalVoiceSession | undefined })._instance = undefined;
		store.clear();
	});

	test('BUILTIN: active-instance change during finalize keeps text', async () => {
		const transcriptEmitter = store.add(new Emitter<IChatDictationTranscript>());
		const stateEmitter = store.add(new Emitter<ChatSpeechToTextState>());
		const gate = new DeferredPromise<string | undefined>();
		setupBuiltin(transcriptEmitter, stateEmitter, () => gate.p);
		const session = TerminalVoiceSession.getInstance(instantiationService as unknown as IInstantiationService);
		await session.start();
		transcriptEmitter.fire({ text: 'echo hello', finalizedText: 'echo hello' });
		// User runs the Stop command: begins the async finalize.
		session.stop(true);
		// The command palette closing re-activates the terminal instance while
		// the finalize await is still pending -> stop() (send=false) races in.
		activeInstanceChanged.fire(undefined);
		// Now the engine returns the final transcript.
		gate.complete('echo hello');
		await new Promise(r => setTimeout(r, 10));
		assert.ok(sentTexts.some(t => t.includes('echo hello')), `expected echo hello, got ${JSON.stringify(sentTexts)}`);
		session.dispose();
	});
});
