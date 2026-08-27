/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { createTestCodeEditor } from '../../../../../editor/test/browser/testCodeEditor.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ChatDictationSurface, ChatSpeechToTextState, IChatDictationTranscript, IChatSpeechToTextService, isDictationActiveOnSurface } from '../../browser/speechToText/chatSpeechToTextService.js';
import { isDictating, isDictationActiveForEditor, onDidChangeDictationEditor, startDictation, stopDictation, stopDictationForEditor } from '../../browser/speechToText/dictationSession.js';

suite('DictationSession', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * A dictation service that records `transcript` as its final result and lets
	 * the test drive interim updates through the returned emitter. `setTranscript`
	 * updates what a subsequent `stopAndTranscribe` resolves with.
	 */
	function createService(transcript: string, showTranscriptWhileDictating: boolean, cancelBarrier?: Promise<void>): { service: IChatSpeechToTextService; onDidUpdateTranscript: Emitter<IChatDictationTranscript>; setTranscript(text: string): void; starts: ChatDictationSurface[]; blockStop(): () => void } {
		const onDidUpdateTranscript = store.add(new Emitter<IChatDictationTranscript>());
		const onDidChangeState = store.add(new Emitter<ChatSpeechToTextState>());
		const starts: ChatDictationSurface[] = [];
		let state = ChatSpeechToTextState.Idle;
		let currentSurface: ChatDictationSurface = 'chat';
		let finalTranscript = transcript;
		let stopBarrier: Promise<void> | undefined;
		const service: IChatSpeechToTextService = {
			_serviceBrand: undefined,
			onDidUpdateTranscript: onDidUpdateTranscript.event,
			onDidChangeState: onDidChangeState.event,
			onDidChangePreparingModel: store.add(new Emitter<boolean>()).event,
			onDidChangeDownloadingModel: store.add(new Emitter<boolean>()).event,
			onDidChangeModelDownloadProgress: store.add(new Emitter<void>()).event,
			get state() { return state; },
			get isBusy() { return state !== ChatSpeechToTextState.Idle; },
			get currentSurface() { return currentSurface; },
			get showTranscriptWhileDictating() { return showTranscriptWhileDictating; },
			get analyserNode() { return undefined; },
			get isConfigured() { return true; },
			get isPreparingModel() { return false; },
			get isDownloadingModel() { return false; },
			get modelDownloadProgress() { return undefined; },
			get currentBackend() { return 'mai' as const; },
			async switchMicrophone() { return undefined; },
			async start(_window, surface = 'chat') {
				currentSurface = surface;
				starts.push(surface);
				state = ChatSpeechToTextState.Recording;
				onDidChangeState.fire(state);
			},
			async stopAndTranscribe() {
				// Lets a test hold the finalization open to exercise concurrent stops.
				await stopBarrier;
				state = ChatSpeechToTextState.Idle;
				onDidChangeState.fire(state);
				return finalTranscript;
			},
			async cancel() {
				state = ChatSpeechToTextState.Idle;
				onDidChangeState.fire(state);
				await cancelBarrier;
			},
			logDictationAccuracy() { },
		};
		return {
			service,
			onDidUpdateTranscript,
			setTranscript: text => { finalTranscript = text; },
			starts,
			blockStop: () => {
				const deferred = new DeferredPromise<void>();
				stopBarrier = deferred.p;
				return () => deferred.complete();
			},
		};
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

	test('stops only when the submitted editor owns dictation', async () => {
		const { service } = createService('hello world', true);
		const dictationEditor = store.add(createTestCodeEditor(store.add(createTextModel(''))));
		const otherEditor = store.add(createTestCodeEditor(store.add(createTextModel(''))));

		await startDictation(service, dictationEditor, mainWindow, new NullLogService());
		await stopDictationForEditor(otherEditor);
		const afterOtherEditor = isDictating();
		await stopDictationForEditor(dictationEditor);

		assert.deepStrictEqual({
			afterOtherEditor,
			afterDictationEditor: isDictating(),
			value: dictationEditor.getValue(),
		}, {
			afterOtherEditor: true,
			afterDictationEditor: false,
			value: 'hello world',
		});
	});

	test('a second submit during finalization waits for the final transcript', async () => {
		const { service, onDidUpdateTranscript, blockStop } = createService('hello world', true);
		const model = store.add(createTextModel(''));
		const editor = store.add(createTestCodeEditor(model));
		const otherEditor = store.add(createTestCodeEditor(store.add(createTextModel(''))));

		await startDictation(service, editor, mainWindow, new NullLogService());
		onDidUpdateTranscript.fire({ text: 'hello world', finalizedText: '' });
		const ownershipChanges: boolean[] = [];
		store.add(onDidChangeDictationEditor(() => ownershipChanges.push(isDictationActiveForEditor(editor))));

		// The first submit begins finalizing but blocks inside stopAndTranscribe.
		const release = blockStop();
		const firstStop = stopDictationForEditor(editor);
		const ownsFinalizingDictation = isDictationActiveForEditor(editor);
		const otherOwnsFinalizingDictation = isDictationActiveForEditor(otherEditor);
		// A second submit for the same editor arrives mid-finalization; it must
		// await the in-flight finalization rather than returning early.
		let secondResolved = false;
		const secondStop = stopDictationForEditor(editor).then(() => { secondResolved = true; });
		await timeout(0);
		const secondResolvedWhileBlocked = secondResolved;

		release();
		await Promise.all([firstStop, secondStop]);

		assert.deepStrictEqual({
			ownsFinalizingDictation,
			otherOwnsFinalizingDictation,
			ownershipChanges,
			secondResolvedWhileBlocked,
			secondResolvedAfterFinal: secondResolved,
			ownsCompletedDictation: isDictationActiveForEditor(editor),
			value: editor.getValue(),
		}, {
			ownsFinalizingDictation: true,
			otherOwnsFinalizingDictation: false,
			ownershipChanges: [false, true, false],
			secondResolvedWhileBlocked: false,
			secondResolvedAfterFinal: true,
			ownsCompletedDictation: false,
			value: 'hello world',
		});
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

	test('starting dictation in another editor takes over the shared session', async () => {
		const { service, onDidUpdateTranscript, setTranscript } = createService('hello', true);
		const model1 = store.add(createTextModel(''));
		const editor1 = store.add(createTestCodeEditor(model1));
		const model2 = store.add(createTextModel(''));
		const editor2 = store.add(createTestCodeEditor(model2));

		await startDictation(service, editor1, mainWindow, new NullLogService());
		onDidUpdateTranscript.fire({ text: 'hello', finalizedText: '' });
		const editor1WhileDictating = editor1.getValue();
		// Starting dictation in a second editor cancels the first session (keeping
		// its already-inserted text) and takes over the shared engine.
		await startDictation(service, editor2, mainWindow, new NullLogService());
		onDidUpdateTranscript.fire({ text: 'world', finalizedText: '' });
		const editor2WhileDictating = editor2.getValue();
		setTranscript('world');
		await stopDictation();

		assert.deepStrictEqual(
			[editor1WhileDictating, editor1.getValue(), editor2WhileDictating, editor2.getValue()],
			['hello', 'hello', 'world', 'world'],
		);
	});

	test('reports dictation activity only for the active surface', async () => {
		const { service } = createService('', true);
		const model = store.add(createTextModel(''));
		const editor = store.add(createTestCodeEditor(model));

		await startDictation(service, editor, mainWindow, new NullLogService(), 'editor');
		const whileDictating = [
			isDictationActiveOnSurface(service, 'chat'),
			isDictationActiveOnSurface(service, 'editor'),
			isDictationActiveOnSurface(service, 'terminal'),
		];
		await stopDictation();

		assert.deepStrictEqual(
			[whileDictating, isDictationActiveOnSurface(service, 'editor')],
			[[false, true, false], false],
		);
	});

	test('waits for cancellation to settle before starting a replacement', async () => {
		const cancelBarrier = new DeferredPromise<void>();
		const { service, starts } = createService('', true, cancelBarrier.p);
		const firstModel = store.add(createTextModel(''));
		const firstEditor = store.add(createTestCodeEditor(firstModel));
		const secondModel = store.add(createTextModel(''));
		const secondEditor = store.add(createTestCodeEditor(secondModel));

		await startDictation(service, firstEditor, mainWindow, new NullLogService(), 'chat');
		const replacement = startDictation(service, secondEditor, mainWindow, new NullLogService(), 'terminal');
		assert.deepStrictEqual(starts, ['chat']);

		cancelBarrier.complete();
		await replacement;
		await stopDictation();

		assert.deepStrictEqual(starts, ['chat', 'terminal']);
	});
});
