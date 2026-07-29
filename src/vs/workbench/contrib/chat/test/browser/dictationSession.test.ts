/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../../editor/common/core/position.js';
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
		let state = ChatSpeechToTextState.Idle;
		const service: IChatSpeechToTextService = {
			_serviceBrand: undefined,
			onDidUpdateTranscript: onDidUpdateTranscript.event,
			onDidChangeState: onDidChangeState.event,
			onDidChangePreparingModel: store.add(new Emitter<boolean>()).event,
			onDidChangeModelDownloadProgress: store.add(new Emitter<void>()).event,
			get state() { return state; },
			get showTranscriptWhileDictating() { return true; },
			get analyserNode() { return undefined; },
			get isConfigured() { return true; },
			get isPreparingModel() { return false; },
			get modelDownloadProgress() { return undefined; },
			get currentBackend() { return 'mai' as const; },
			async start() {
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
		const editor = store.add(createTestCodeEditor(model));

		await startDictation(service, editor, mainWindow, new NullLogService());
		onDidUpdateTranscript.fire({ text: transcript, finalizedText: '' });
		editor.executeEdits('test', [{ range: new Range(1, 1, 1, transcript.length + 1), text: '' }]);
		await stopDictation();

		assert.strictEqual(editor.getValue(), '');
	});

	test('hides interim transcript and inserts final transcript when stopped', async () => {
		const transcript = 'hello world';
		const onDidUpdateTranscript = store.add(new Emitter<IChatDictationTranscript>());
		const onDidChangeState = store.add(new Emitter<ChatSpeechToTextState>());
		let state = ChatSpeechToTextState.Idle;
		const service: IChatSpeechToTextService = {
			_serviceBrand: undefined,
			onDidUpdateTranscript: onDidUpdateTranscript.event,
			onDidChangeState: onDidChangeState.event,
			onDidChangePreparingModel: store.add(new Emitter<boolean>()).event,
			onDidChangeModelDownloadProgress: store.add(new Emitter<void>()).event,
			get state() { return state; },
			get showTranscriptWhileDictating() { return false; },
			get analyserNode() { return undefined; },
			get isConfigured() { return true; },
			get isPreparingModel() { return false; },
			get modelDownloadProgress() { return undefined; },
			get currentBackend() { return 'mai' as const; },
			async start() {
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
		const editor = store.add(createTestCodeEditor(model));

		await startDictation(service, editor, mainWindow, new NullLogService());
		onDidUpdateTranscript.fire({ text: transcript, finalizedText: '' });
		const interimValue = editor.getValue();
		await stopDictation();

		assert.deepStrictEqual([interimValue, editor.getValue()], ['', transcript]);
	});

	test('continues dictating after the user edits the transcript', async () => {
		let transcript = 'one two';
		const onDidUpdateTranscript = store.add(new Emitter<IChatDictationTranscript>());
		const onDidChangeState = store.add(new Emitter<ChatSpeechToTextState>());
		let state = ChatSpeechToTextState.Idle;
		const service: IChatSpeechToTextService = {
			_serviceBrand: undefined,
			onDidUpdateTranscript: onDidUpdateTranscript.event,
			onDidChangeState: onDidChangeState.event,
			onDidChangePreparingModel: store.add(new Emitter<boolean>()).event,
			onDidChangeModelDownloadProgress: store.add(new Emitter<void>()).event,
			get state() { return state; },
			get showTranscriptWhileDictating() { return true; },
			get analyserNode() { return undefined; },
			get isConfigured() { return true; },
			get isPreparingModel() { return false; },
			get modelDownloadProgress() { return undefined; },
			get currentBackend() { return 'mai' as const; },
			async start() {
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
		const editor = store.add(createTestCodeEditor(model));

		await startDictation(service, editor, mainWindow, new NullLogService());
		onDidUpdateTranscript.fire({ text: 'one two', finalizedText: '' });
		// The user manually deletes the trailing character of the dictated text.
		editor.executeEdits('test', [{ range: new Range(1, 7, 1, 8), text: '' }]);
		editor.setPosition(new Position(1, 7));
		// More speech arrives as a cumulative transcript; only the new tail is
		// inserted, leaving the user's edit intact.
		transcript = 'one two three';
		onDidUpdateTranscript.fire({ text: 'one two three', finalizedText: '' });
		const afterMore = editor.getValue();
		await stopDictation();

		assert.deepStrictEqual([afterMore, editor.getValue()], ['one tw three', 'one tw three']);
	});
});
