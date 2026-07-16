/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { EditorOption } from '../../../../../../editor/common/config/editorOptions.js';
import { Selection } from '../../../../../../editor/common/core/selection.js';
import { withAsyncTestCodeEditor } from '../../../../../../editor/test/browser/testCodeEditor.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ChatDictationController } from '../../../browser/speechToText/dictationSession.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from '../../../browser/speechToText/chatSpeechToTextService.js';

class TestSpeechToTextService extends Disposable implements IChatSpeechToTextService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeState = this._register(new Emitter<ChatSpeechToTextState>());
	readonly onDidChangeState = this._onDidChangeState.event;
	private readonly _onDidUpdateTranscript = this._register(new Emitter<string>());
	readonly onDidUpdateTranscript = this._onDidUpdateTranscript.event;
	private readonly _onDidFail = this._register(new Emitter<void>());
	readonly onDidFail = this._onDidFail.event;
	readonly onDidChangePreparingModel = this._register(new Emitter<boolean>()).event;

	state = ChatSpeechToTextState.Idle;
	readonly isConfigured = true;
	readonly isPreparingModel = false;
	finalText = 'final transcript';
	startRecording = true;

	async start(): Promise<void> {
		if (this.startRecording) {
			this.setState(ChatSpeechToTextState.Recording);
		}
	}

	async stopAndTranscribe(): Promise<string> {
		this.setState(ChatSpeechToTextState.Transcribing);
		this.setState(ChatSpeechToTextState.Idle);
		return this.finalText;
	}

	cancel(): void {
		this.setState(ChatSpeechToTextState.Idle);
	}

	update(text: string): void {
		this._onDidUpdateTranscript.fire(text);
	}

	private setState(state: ChatSpeechToTextState): void {
		this.state = state;
		this._onDidChangeState.fire(state);
	}
}

suite('ChatDictationController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves the draft and selection when cancelled', async () => {
		await withAsyncTestCodeEditor('draft tail', {}, async editor => {
			const service = store.add(new TestSpeechToTextService());
			const controller = store.add(new ChatDictationController(service, new NullLogService()));
			const originalSelection = new Selection(1, 7, 1, 11);
			editor.setSelection(originalSelection);

			await controller.start(editor, mainWindow);
			service.update('temporary words');
			assert.strictEqual(editor.getModel()!.getValue(), 'draft tail temporary words');
			assert.strictEqual(editor.getOption(EditorOption.readOnly), true);

			controller.cancel();

			assert.deepStrictEqual({
				text: editor.getModel()!.getValue(),
				selection: editor.getSelection(),
				readOnly: editor.getOption(EditorOption.readOnly),
			}, {
				text: 'draft tail',
				selection: originalSelection,
				readOnly: false,
			});
		});
	});

	test('replaces partials ephemerally and commits one undoable final edit', async () => {
		await withAsyncTestCodeEditor('draft', {}, async editor => {
			const service = store.add(new TestSpeechToTextService());
			const controller = store.add(new ChatDictationController(service, new NullLogService()));
			editor.setPosition({ lineNumber: 1, column: 6 });

			await controller.start(editor, mainWindow);
			service.update('first');
			service.update('first revision');
			assert.strictEqual(editor.getModel()!.getValue(), 'draft first revision');

			await controller.stop();
			assert.deepStrictEqual({
				text: editor.getModel()!.getValue(),
				readOnly: editor.getOption(EditorOption.readOnly),
			}, {
				text: 'draft final transcript',
				readOnly: false,
			});

			editor.getModel()!.undo();
			assert.strictEqual(editor.getModel()!.getValue(), 'draft');
		});
	});

	test('preserves an external edit outside the owned transcript range', async () => {
		await withAsyncTestCodeEditor('draft', {}, async editor => {
			const service = store.add(new TestSpeechToTextService());
			const controller = store.add(new ChatDictationController(service, new NullLogService()));
			editor.setPosition({ lineNumber: 1, column: 6 });
			await controller.start(editor, mainWindow);
			service.update('temporary');

			editor.getModel()!.applyEdits([{
				range: new Selection(1, 1, 1, 1),
				text: 'user ',
			}]);
			await Promise.resolve();

			assert.deepStrictEqual({
				text: editor.getModel()!.getValue(),
				active: controller.isActive,
				readOnly: editor.getOption(EditorOption.readOnly),
			}, {
				text: 'user draft',
				active: false,
				readOnly: false,
			});
		});
	});

	test('clears the controller when the selected backend cannot start yet', async () => {
		await withAsyncTestCodeEditor('draft', {}, async editor => {
			const service = store.add(new TestSpeechToTextService());
			service.startRecording = false;
			const controller = store.add(new ChatDictationController(service, new NullLogService()));

			await controller.start(editor, mainWindow);

			assert.strictEqual(controller.isActive, false);
		});
	});
});
