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
import { ITextModel } from '../../../../../editor/common/model.js';
import { createTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ChatSpeechToTextState, IChatDictationTranscript, IChatSpeechToTextService } from '../../browser/speechToText/chatSpeechToTextService.js';
import { startDictation, stopDictation } from '../../browser/speechToText/dictationSession.js';

suite('DictationSession', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * A dictation service that records `transcript` as its final result and lets
	 * the test drive interim updates through the returned emitter. `setTranscript`
	 * updates what a subsequent `stopAndTranscribe` resolves with.
	 */
	function createService(transcript: string, showTranscriptWhileDictating: boolean): { service: IChatSpeechToTextService; onDidUpdateTranscript: Emitter<IChatDictationTranscript>; setTranscript(text: string): void } {
		const onDidUpdateTranscript = store.add(new Emitter<IChatDictationTranscript>());
		const onDidChangeState = store.add(new Emitter<ChatSpeechToTextState>());
		let state = ChatSpeechToTextState.Idle;
		let finalTranscript = transcript;
		const service: IChatSpeechToTextService = {
			_serviceBrand: undefined,
			onDidUpdateTranscript: onDidUpdateTranscript.event,
			onDidChangeState: onDidChangeState.event,
			onDidChangePreparingModel: store.add(new Emitter<boolean>()).event,
			onDidChangeDownloadingModel: store.add(new Emitter<boolean>()).event,
			onDidChangeModelDownloadProgress: store.add(new Emitter<void>()).event,
			get state() { return state; },
			get showTranscriptWhileDictating() { return showTranscriptWhileDictating; },
			get analyserNode() { return undefined; },
			get isConfigured() { return true; },
			get isPreparingModel() { return false; },
			get isDownloadingModel() { return false; },
			get modelDownloadProgress() { return undefined; },
			get currentBackend() { return 'mai' as const; },
			async switchMicrophone() { return undefined; },
			async start() {
				state = ChatSpeechToTextState.Recording;
				onDidChangeState.fire(state);
			},
			async stopAndTranscribe() {
				state = ChatSpeechToTextState.Idle;
				onDidChangeState.fire(state);
				return finalTranscript;
			},
			cancel() { },
			logDictationAccuracy() { },
		};
		return { service, onDidUpdateTranscript, setTranscript: text => { finalTranscript = text; } };
	}

	/** Ranges rendered as still being processed, as `[startLine,startColumn -> endLine,endColumn]`. */
	function processingRanges(model: ITextModel): string[] {
		return model.getAllDecorations()
			.filter(decoration => decoration.options.inlineClassName === 'dictation-interim-processing')
			.map(decoration => Range.lift(decoration.range).toString());
	}

	test('does not restore dictated text deleted before stopping', async () => {
		const transcript = 'hello world';
		const { service, onDidUpdateTranscript } = createService(transcript, true);
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
		const { service, onDidUpdateTranscript } = createService(transcript, false);
		const model = store.add(createTextModel(''));
		const editor = store.add(createTestCodeEditor(model));

		await startDictation(service, editor, mainWindow, new NullLogService());
		onDidUpdateTranscript.fire({ text: transcript, finalizedText: '' });
		const interimValue = editor.getValue();
		await stopDictation();

		assert.deepStrictEqual([interimValue, editor.getValue()], ['', transcript]);
	});

	test('renders the whole in-progress transcript as still processing', async () => {
		const transcript = 'hello world';
		const { service, onDidUpdateTranscript } = createService(transcript, true);
		const model = store.add(createTextModel(''));
		const editor = store.add(createTestCodeEditor(model));

		await startDictation(service, editor, mainWindow, new NullLogService());
		// Even where the recognizer reports a committed prefix, the whole
		// in-progress transcript reads as provisional until dictation ends.
		onDidUpdateTranscript.fire({ text: transcript, finalizedText: 'hello' });
		const whileProcessing = processingRanges(model);
		await stopDictation();

		assert.deepStrictEqual([whileProcessing, processingRanges(model)], [['[1,1 -> 1,12]'], []]);
	});

	test('continues dictating after the user edits the transcript', async () => {
		const { service, onDidUpdateTranscript, setTranscript } = createService('one two', true);
		const model = store.add(createTextModel(''));
		const editor = store.add(createTestCodeEditor(model));

		await startDictation(service, editor, mainWindow, new NullLogService());
		onDidUpdateTranscript.fire({ text: 'one two', finalizedText: '' });
		// The user manually deletes the trailing character of the dictated text.
		editor.executeEdits('test', [{ range: new Range(1, 7, 1, 8), text: '' }]);
		editor.setPosition(new Position(1, 7));
		// More speech arrives as a cumulative transcript; only the new tail is
		// inserted, leaving the user's edit intact.
		setTranscript('one two three');
		onDidUpdateTranscript.fire({ text: 'one two three', finalizedText: '' });
		const afterMore = editor.getValue();
		await stopDictation();

		assert.deepStrictEqual([afterMore, editor.getValue()], ['one tw three', 'one tw three']);
	});

	test('appends a stray keystroke after the transcript instead of at the start', async () => {
		const { service, onDidUpdateTranscript, setTranscript } = createService('one two', true);
		const model = store.add(createTextModel(''));
		const editor = store.add(createTestCodeEditor(model));

		await startDictation(service, editor, mainWindow, new NullLogService());
		onDidUpdateTranscript.fire({ text: 'one two', finalizedText: '' });
		// A bumped key must be appended at the hidden caret after the dictated region.
		editor.trigger('test', 'type', { text: 'x' });
		// More speech arrives and is appended after the stray character rather
		// than jumping to the start of the input.
		setTranscript('one two three');
		onDidUpdateTranscript.fire({ text: 'one two three', finalizedText: '' });
		const afterMore = editor.getValue();
		await stopDictation();

		assert.deepStrictEqual([afterMore, editor.getValue()], ['one twox three', 'one twox three']);
	});
});
