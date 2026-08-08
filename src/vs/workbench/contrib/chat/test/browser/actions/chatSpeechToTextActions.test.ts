/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { getDictationShortcutOperation, runDictationShortcut } from '../../../browser/actions/chatSpeechToTextActions.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../../../browser/speechToText/chatSpeechToTextService.js';
import { IDictationOnboardingService } from '../../../browser/speechToText/dictationOnboarding.js';

suite('Chat Speech to Text Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves the dictation toggle operation', () => {
		assert.deepStrictEqual([
			getDictationShortcutOperation(false, ChatSpeechToTextState.Idle, false),
			getDictationShortcutOperation(true, ChatSpeechToTextState.Recording, false),
			getDictationShortcutOperation(true, ChatSpeechToTextState.Recording, true),
			getDictationShortcutOperation(false, ChatSpeechToTextState.Transcribing, false),
		], [
			'start',
			'stop',
			'cancel',
			undefined,
		]);
	});

	test('starts dictation while first-run onboarding is shown', async () => {
		const calls: string[] = [];
		let state = ChatSpeechToTextState.Idle;
		const speechService = new class extends mock<IChatSpeechToTextService>() {
			override get state(): ChatSpeechToTextState { return state; }
			override readonly isPreparingModel = false;
			override readonly analyserNode = new class extends mock<AnalyserNode>() { };
			override async switchMicrophone(_window: Window & typeof globalThis, deviceId: string): Promise<AnalyserNode | undefined> {
				calls.push(`switchMicrophone:${deviceId}`);
				return this.analyserNode;
			}
		};
		const keybindingService = new class extends mock<IKeybindingService>() {
			override enableKeybindingHoldMode(): Promise<void> | undefined {
				return undefined;
			}
		};
		const onboardingService = new class extends mock<IDictationOnboardingService>() {
			override showIfNeeded(): boolean {
				calls.push('showIfNeeded');
				return true;
			}
			override refreshMicrophones(analyserNode?: AnalyserNode, switchMicrophone?: (deviceId: string) => Promise<AnalyserNode | undefined>): void {
				calls.push(`refreshMicrophones:${analyserNode === speechService.analyserNode}`);
				void switchMicrophone?.('mic-b');
			}
		};
		const editor = new class extends mock<ICodeEditor>() {
			override getDomNode(): HTMLElement {
				return mainWindow.document.body;
			}
		};

		await runDictationShortcut(
			{ speechService, keybindingService, logService: new NullLogService(), onboardingService },
			'test.dictation',
			editor,
			async () => {
				calls.push('startDictation');
				state = ChatSpeechToTextState.Recording;
			},
		);

		assert.deepStrictEqual(calls, ['showIfNeeded', 'startDictation', 'refreshMicrophones:true', 'switchMicrophone:mic-b']);
	});
});
