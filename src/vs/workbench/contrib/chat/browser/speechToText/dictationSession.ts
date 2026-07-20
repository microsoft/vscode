/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/dictationSession.css';
import { status } from '../../../../../base/browser/ui/aria/aria.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { IEditorDecorationsCollection } from '../../../../../editor/common/editorCommon.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { TrackedRangeStickiness } from '../../../../../editor/common/model.js';
import { localize } from '../../../../../nls.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from './chatSpeechToTextService.js';

const INTERIM_SHIMMER_CLASS = 'dictation-interim-shimmer';
const INTERIM_SETTLED_CLASS = 'dictation-interim-settled';
const LOG_PREFIX = '[chat-stt-dictation]';

export const IChatDictationController = createDecorator<IChatDictationController>('chatDictationController');

export interface IChatDictationController {
	readonly _serviceBrand: undefined;
	readonly onDidChangeActive: Event<boolean>;
	readonly isActive: boolean;
	readonly activeEditor: ICodeEditor | undefined;
	start(editor: ICodeEditor, window: Window & typeof globalThis): Promise<void>;
	stop(): Promise<void>;
	cancel(): void;
}

function commonPrefixLength(a: string, b: string): number {
	const max = Math.min(a.length, b.length);
	let index = 0;
	while (index < max && a.charCodeAt(index) === b.charCodeAt(index)) {
		index++;
	}
	return index;
}

function wordBoundaryAtOrBefore(text: string, index: number): number {
	let result = index;
	while (result > 0 && !/\s/.test(text.charAt(result - 1))) {
		result--;
	}
	return result;
}

class LiveTranscriptInserter extends Disposable {
	private readonly _modelListeners = this._register(new DisposableStore());
	private _decorationId: string | undefined;
	private _selection: Selection | undefined;
	private _needsLeadingSpace = false;
	private _pendingOwnedChanges = 0;
	private _externalEditDetected = false;
	private _externalEditTouchedOwnedRange = false;
	private _lastOwnedRange: Range | undefined;
	private _originalReadOnly = false;
	private _settledDecorations: IEditorDecorationsCollection | undefined;
	private _shimmerDecorations: IEditorDecorationsCollection | undefined;
	private _previousInterimText = '';
	private _finalizing = false;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _onExternalEdit: () => void,
		private readonly _logService: ILogService,
	) {
		super();
	}

	begin(): void {
		const model = this._editor.getModel();
		if (!model || this._decorationId) {
			return;
		}
		const selection = this._editor.getSelection() ?? Selection.fromPositions(model.getFullModelRange().getEndPosition());
		const anchor = selection.getEndPosition();
		this._selection = selection;
		this._needsLeadingSpace = anchor.column > 1 && !/\s$/.test(model.getValueInRange(new Range(
			anchor.lineNumber,
			anchor.column - 1,
			anchor.lineNumber,
			anchor.column,
		)));
		this._decorationId = model.deltaDecorations([], [{
			range: Range.fromPositions(anchor),
			options: {
				description: 'chat-dictation-transcript',
				stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			}
		}])[0];
		this._lastOwnedRange = Range.fromPositions(anchor);
		this._originalReadOnly = this._editor.getOption(EditorOption.readOnly);
		this._editor.updateOptions({ readOnly: true });
		this._editor.focus();
		this._modelListeners.add(model.onDidChangeContent(event => {
			if (this._pendingOwnedChanges > 0) {
				this._pendingOwnedChanges--;
				return;
			}
			if (this._externalEditDetected) {
				return;
			}
			this._externalEditDetected = true;
			this._externalEditTouchedOwnedRange = !!this._lastOwnedRange
				&& event.changes.some(change => Range.areIntersecting(change.range, this._lastOwnedRange!));
			queueMicrotask(this._onExternalEdit);
		}));
	}

	update(fullText: string): void {
		if (this._finalizing || this._externalEditDetected) {
			return;
		}
		const model = this._editor.getModel();
		const range = this._ownedRange();
		if (!model || !range) {
			return;
		}
		const text = `${this._needsLeadingSpace ? ' ' : ''}${fullText}`;
		const startOffset = model.getOffsetAt(range.getStartPosition());
		this._applyWithoutUndo(range, text);
		const end = model.getPositionAt(startOffset + text.length);
		this._decorationId = model.deltaDecorations([this._decorationId!], [{
			range: Range.fromPositions(range.getStartPosition(), end),
			options: {
				description: 'chat-dictation-transcript',
				stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
			}
		}])[0];
		this._lastOwnedRange = Range.fromPositions(range.getStartPosition(), end);
		this._editor.setPosition(range.getStartPosition());
		this._updateInterimDecorations(text, fullText, range.getStartPosition(), end);
		this._previousInterimText = fullText;
	}

	beginFinalize(): void {
		this._logService.trace(`${LOG_PREFIX} beginFinalize`);
		this._finalizing = true;
		this._clearInterimDecorations();
	}

	commit(finalText: string): void {
		const model = this._editor.getModel();
		const range = this._ownedRange();
		if (!model || !range || this._externalEditDetected) {
			return;
		}
		const text = `${this._needsLeadingSpace ? ' ' : ''}${finalText}`;
		const start = range.getStartPosition();
		const startOffset = model.getOffsetAt(start);
		this._applyWithoutUndo(range, '');
		this._clearOwnedDecoration();
		this._editor.updateOptions({ readOnly: this._originalReadOnly });
		this._editor.pushUndoStop();
		this._pendingOwnedChanges++;
		this._editor.executeEdits('chatDictationFinal', [{ range: Range.fromPositions(start), text }]);
		this._editor.pushUndoStop();
		this._editor.setPosition(model.getPositionAt(startOffset + text.length));
		this._restoreEditor();
	}

	revert(): void {
		const range = this._ownedRange();
		if (range && !this._externalEditTouchedOwnedRange) {
			this._applyWithoutUndo(range, '');
		}
		this._clearOwnedDecoration();
		this._restoreEditor();
		if (this._selection) {
			this._editor.setSelection(this._selection);
		}
	}

	clearShimmer(): void {
		this._clearInterimDecorations();
	}

	private _updateInterimDecorations(text: string, fullText: string, start: Position, end: Position): void {
		const leading = this._needsLeadingSpace ? 1 : 0;
		const common = commonPrefixLength(fullText, this._previousInterimText);
		const settledCharacters = common >= fullText.length ? fullText.length : wordBoundaryAtOrBefore(fullText, common);
		const split = this._positionAtOffset(text, leading + settledCharacters, start);
		this._settledDecorations ??= this._editor.createDecorationsCollection();
		this._shimmerDecorations ??= this._editor.createDecorationsCollection();
		this._settledDecorations.set(Position.equals(start, split) ? [] : [{
			range: Range.fromPositions(start, split),
			options: { description: 'chatSpeechToText-settled', inlineClassName: INTERIM_SETTLED_CLASS },
		}]);
		this._shimmerDecorations.set(Position.equals(split, end) ? [] : [{
			range: Range.fromPositions(split, end),
			options: { description: 'chatSpeechToText-interim', inlineClassName: INTERIM_SHIMMER_CLASS },
		}]);
	}

	private _positionAtOffset(text: string, offset: number, anchor: Position): Position {
		const lines = text.slice(0, offset).split('\n');
		if (lines.length === 1) {
			return new Position(anchor.lineNumber, anchor.column + lines[0].length);
		}
		return new Position(anchor.lineNumber + lines.length - 1, lines[lines.length - 1].length + 1);
	}

	private _applyWithoutUndo(range: Range, text: string): void {
		const model = this._editor.getModel();
		if (!model) {
			return;
		}
		this._pendingOwnedChanges++;
		model.applyEdits([{ range, text, forceMoveMarkers: true }]);
	}

	private _ownedRange(): Range | undefined {
		const model = this._editor.getModel();
		return model && this._decorationId ? model.getDecorationRange(this._decorationId) ?? undefined : undefined;
	}

	private _clearInterimDecorations(): void {
		this._settledDecorations?.clear();
		this._shimmerDecorations?.clear();
	}

	private _clearOwnedDecoration(): void {
		const model = this._editor.getModel();
		if (model && this._decorationId) {
			model.deltaDecorations([this._decorationId], []);
		}
		this._decorationId = undefined;
		this._lastOwnedRange = undefined;
		this._clearInterimDecorations();
	}

	private _restoreEditor(): void {
		this._editor.updateOptions({ readOnly: this._originalReadOnly });
		this._editor.focus();
		this._modelListeners.clear();
	}

	override dispose(): void {
		this._clearOwnedDecoration();
		this._restoreEditor();
		super.dispose();
	}
}

interface IActiveDictation {
	readonly editor: ICodeEditor;
	readonly inserter: LiveTranscriptInserter;
	readonly disposables: DisposableStore;
	stopping: boolean;
}

export class ChatDictationController extends Disposable implements IChatDictationController {
	declare readonly _serviceBrand: undefined;

	private readonly _active = this._register(new MutableDisposable<DisposableStore>());
	private readonly _onDidChangeActive = this._register(new Emitter<boolean>());
	readonly onDidChangeActive = this._onDidChangeActive.event;
	private _session: IActiveDictation | undefined;

	get isActive(): boolean {
		return !!this._session;
	}

	get activeEditor(): ICodeEditor | undefined {
		return this._session?.editor;
	}

	constructor(
		@IChatSpeechToTextService private readonly _speechToTextService: IChatSpeechToTextService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async start(editor: ICodeEditor, window: Window & typeof globalThis): Promise<void> {
		if (this._session || this._speechToTextService.state !== ChatSpeechToTextState.Idle) {
			return;
		}
		const disposables = new DisposableStore();
		const inserter = new LiveTranscriptInserter(editor, () => this._cancelForExternalEdit(), this._logService);
		const previousPlaceholder = editor.getOption(EditorOption.placeholder);
		const listeningPlaceholder = localize('chatStt.listening', "Listening…");
		const updatePlaceholder = () => {
			if (!editor.getModel()) {
				return;
			}
			const shouldListen = this._speechToTextService.state === ChatSpeechToTextState.Recording
				&& !this._speechToTextService.isPreparingModel;
			if (shouldListen && editor.getOption(EditorOption.placeholder) !== listeningPlaceholder) {
				editor.updateOptions({ placeholder: listeningPlaceholder });
			} else if (!shouldListen && editor.getOption(EditorOption.placeholder) === listeningPlaceholder) {
				editor.updateOptions({ placeholder: previousPlaceholder });
			}
		};
		disposables.add(toDisposable(() => {
			inserter.clearShimmer();
			if (editor.getModel() && editor.getOption(EditorOption.placeholder) === listeningPlaceholder) {
				editor.updateOptions({ placeholder: previousPlaceholder });
			}
		}));
		disposables.add(inserter);
		disposables.add(this._speechToTextService.onDidUpdateTranscript(text => inserter.update(text)));
		disposables.add(this._speechToTextService.onDidFail(() => this._endSession({ revert: true, cancelService: false })));
		disposables.add(this._speechToTextService.onDidChangePreparingModel(updatePlaceholder));
		disposables.add(this._speechToTextService.onDidChangeState(state => {
			this._logService.trace(`${LOG_PREFIX} onDidChangeState ${state}`);
			if (state === ChatSpeechToTextState.Recording) {
				inserter.begin();
				status(localize('chatDictation.recordingStarted', "Dictation recording started."));
			} else if (state === ChatSpeechToTextState.Transcribing) {
				inserter.beginFinalize();
				status(localize('chatDictation.finalizing', "Finishing dictation."));
			} else if (state === ChatSpeechToTextState.Idle && this._session && !this._session.stopping) {
				this._endSession({ revert: true, cancelService: false });
			}
			updatePlaceholder();
		}));
		disposables.add(editor.onDidDispose(() => this._endSession({ revert: true, cancelService: true })));
		this._session = { editor, inserter, disposables, stopping: false };
		this._active.value = disposables;
		this._onDidChangeActive.fire(true);
		try {
			await this._speechToTextService.start(window);
			if (this._speechToTextService.state === ChatSpeechToTextState.Idle && this._session?.editor === editor) {
				this._endSession({ revert: true, cancelService: false });
			}
		} catch {
			this._endSession({ revert: true, cancelService: false });
		}
	}

	async stop(): Promise<void> {
		const session = this._session;
		if (!session || session.stopping || this._speechToTextService.state !== ChatSpeechToTextState.Recording) {
			return;
		}
		session.stopping = true;
		session.inserter.beginFinalize();
		try {
			const finalText = await this._speechToTextService.stopAndTranscribe();
			if (finalText !== undefined) {
				session.inserter.commit(finalText);
				status(localize('chatDictation.ready', "Dictation finished. Review or edit the text, then send it when ready."));
				this._clearSession();
			} else {
				this._endSession({ revert: true, cancelService: false });
			}
		} catch {
			this._endSession({ revert: true, cancelService: false });
		}
	}

	cancel(): void {
		this._endSession({
			revert: true,
			cancelService: true,
			announcement: localize('chatDictation.cancelled', "Dictation cancelled."),
		});
	}

	private _cancelForExternalEdit(): void {
		this._endSession({
			revert: true,
			cancelService: true,
			announcement: localize('chatDictation.externalEdit', "Dictation was cancelled because the input changed."),
		});
	}

	private _endSession(options: { revert: boolean; cancelService: boolean; announcement?: string }): void {
		const session = this._session;
		if (!session) {
			return;
		}
		if (options.revert) {
			session.inserter.revert();
		}
		this._clearSession();
		if (options.cancelService) {
			this._speechToTextService.cancel();
		}
		if (options.announcement) {
			status(options.announcement);
		}
	}

	private _clearSession(): void {
		if (!this._session) {
			return;
		}
		this._session = undefined;
		this._active.clear();
		this._onDidChangeActive.fire(false);
	}
}
