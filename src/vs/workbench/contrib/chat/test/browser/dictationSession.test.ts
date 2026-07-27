/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { createTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ChatSpeechToTextState, IChatDictationTranscript, IChatSpeechToTextService } from '../../browser/speechToText/chatSpeechToTextService.js';
import { startDictation, stopDictation } from '../../browser/speechToText/dictationSession.js';

suite('DictationSession', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not restore dictated text deleted before stopping', async () => {
		const transcript = 'hello world';
		const onDidUpdateTranscript = store.add(new Emitter<IChatDictationTranscript>());
		const onDidChangeState = store.add(new Emitter<ChatSpeechToTextState>());
		const onDidChangePreparingModel = store.add(new Emitter<boolean>());
		let state = ChatSpeechToTextState.Idle;
		let isPreparingModel = false;
		let placeholderDuringStart: string | undefined;
		const service: IChatSpeechToTextService = {
			_serviceBrand: undefined,
			onDidUpdateTranscript: onDidUpdateTranscript.event,
			onDidChangeState: onDidChangeState.event,
			onDidChangePreparingModel: onDidChangePreparingModel.event,
			onDidChangeModelDownloadProgress: store.add(new Emitter<void>()).event,
			get state() { return state; },
			get isConfigured() { return true; },
			get isPreparingModel() { return isPreparingModel; },
			get modelDownloadProgress() { return 0.5; },
			get currentBackend() { return 'local' as const; },
			async start() {
				placeholderDuringStart = editor.getOption(EditorOption.placeholder);
				isPreparingModel = true;
				onDidChangePreparingModel.fire(true);
				state = ChatSpeechToTextState.Recording;
				onDidChangeState.fire(state);
			},
			async stopAndTranscribe() {
				state = ChatSpeechToTextState.Idle;
				onDidChangeState.fire(state);
				return transcript;
			},
			cancel() { },
			logDictationAccuracy() { },
		};
		const model = store.add(createTextModel(''));
		const editor = store.add(createTestCodeEditor(model, { placeholder: 'Ask a question' }));

		await startDictation(service, editor, mainWindow, new NullLogService());
		const downloadingPlaceholder = editor.getOption(EditorOption.placeholder);
		isPreparingModel = false;
		onDidChangePreparingModel.fire(false);
		const listeningPlaceholder = editor.getOption(EditorOption.placeholder);
		onDidUpdateTranscript.fire({ text: transcript, finalizedText: '' });
		editor.executeEdits('test', [{ range: new Range(1, 1, 1, transcript.length + 1), text: '' }]);
		await stopDictation();

		assert.deepStrictEqual({
			placeholderDuringStart,
			downloadingPlaceholder,
			listeningPlaceholder,
			placeholderAfterStop: editor.getOption(EditorOption.placeholder),
			value: editor.getValue(),
		}, {
			placeholderDuringStart: 'Ask a question',
			downloadingPlaceholder: 'Downloading speech-to-text model\u2026 50%',
			listeningPlaceholder: 'Listening\u2026',
			placeholderAfterStop: 'Ask a question',
			value: '',
		});
	});
});
