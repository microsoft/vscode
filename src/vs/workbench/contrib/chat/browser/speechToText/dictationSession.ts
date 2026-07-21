/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/dictationSession.css';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { EditorOption } from '../../../../../editor/common/config/editorOptions.js';
import { IEditorDecorationsCollection } from '../../../../../editor/common/editorCommon.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from './chatSpeechToTextService.js';

/**
 * Inline decoration class for the still-processing tail of not-yet-finalized
 * dictation text: placeholder-colored with a shimmer animation.
 */
const INTERIM_SHIMMER_CLASS = 'dictation-interim-shimmer';

/**
 * Inline decoration class for the settled prefix of not-yet-finalized dictation
 * text: placeholder-colored but no longer shimmering, because it has stopped
 * changing between interim transcripts.
 */
const INTERIM_SETTLED_CLASS = 'dictation-interim-settled';

const LOG_PREFIX = '[chat-stt-dictation]';

/**
 * How long transcription updates must pause before the still-shimmering tail is
 * settled. Foundry keeps the last spoken segment as an interim result until more
 * audio (or `stop`) arrives, so on a trailing silence it never sends a final for
 * it; treat a gap this long as the user having paused and stop the shimmer.
 */
const IDLE_SETTLE_MS = 700;

/** Number of leading characters `a` and `b` share. */
function commonPrefixLength(a: string, b: string): number {
	const max = Math.min(a.length, b.length);
	let i = 0;
	while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) {
		i++;
	}
	return i;
}

/**
 * Back `index` up to the end of the last whole word at or before it, i.e. the
 * offset just after the previous whitespace. This keeps a partially-transcribed
 * trailing word in the shimmering (processing) region instead of prematurely
 * settling it.
 */
function wordBoundaryAtOrBefore(text: string, index: number): number {
	let i = index;
	while (i > 0 && !/\s/.test(text.charAt(i - 1))) {
		i--;
	}
	return i;
}

/**
 * Renders the cumulative transcript into a code editor, replacing its own
 * inserted region on each update so dictation appears live as the user speaks.
 */
class LiveTranscriptInserter {
	private _anchor: Position | undefined;
	private _end: Position | undefined;
	private _needsLeadingSpace = false;
	private _settledDecorations: IEditorDecorationsCollection | undefined;
	private _shimmerDecorations: IEditorDecorationsCollection | undefined;
	private _prevInterimText = '';
	private _finalized = false;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _logService: ILogService,
	) { }

	/**
	 * Render the cumulative transcript. While `interim` is true the text is not
	 * yet finalized, so it is rendered in the placeholder color: the settled
	 * leading portion (unchanged since the previous interim transcript) is shown
	 * statically, while the still-processing trailing portion shimmers. The final
	 * update (`interim === false`) clears both decorations, leaving solid text.
	 *
	 * Once a final update has been applied, later interim updates are ignored:
	 * the transcription service can emit a trailing interim transcript as it
	 * shuts down (after `stopAndTranscribe` resolves), which would otherwise
	 * overwrite the final text and re-apply the shimmer.
	 */
	update(fullText: string, interim: boolean = true, finalizedText: string = ''): void {
		this._logService.trace(`${LOG_PREFIX} inserter.update interim=${interim} finalized=${this._finalized} len=${fullText.length}`);
		if (this._finalized && interim) {
			this._logService.trace(`${LOG_PREFIX} inserter.update ignored (already finalized)`);
			return;
		}
		if (!interim) {
			this._finalized = true;
		}
		const model = this._editor.getModel();
		if (!model) {
			this._logService.trace(`${LOG_PREFIX} inserter.update no model`);
			return;
		}

		if (!this._anchor) {
			const selection = this._editor.getSelection() ?? model.getFullModelRange().collapseToEnd();
			const start = selection.getStartPosition();
			this._anchor = start;
			this._end = start;
			this._needsLeadingSpace = start.column > 1 && !/\s$/.test(model.getValueInRange(new Range(
				start.lineNumber, Math.max(1, start.column - 1), start.lineNumber, start.column,
			)));
		}

		const text = (this._needsLeadingSpace ? ' ' : '') + fullText;

		// The edit replaces the region this inserter wrote last time (anchor ..
		// previous end) with the new cumulative transcript.
		const replaceRange = Range.fromPositions(this._anchor, this._end ?? this._anchor);

		const lines = text.split('\n');
		const endLine = this._anchor.lineNumber + lines.length - 1;
		const endColumn = lines.length === 1 ? this._anchor.column + lines[0].length : lines[lines.length - 1].length + 1;
		this._end = new Position(endLine, endColumn);

		// While transcription is in progress keep the caret parked at the start
		// of the dictated region (a blinking cursor at the beginning) rather than
		// chasing the growing/revised interim text. Once finalized, move it to the
		// end so the user can continue typing after the dictated text. The caret
		// is passed as executeEdits' endCursorState so the editor never briefly
		// places it at the end of the applied edit first.
		const caret = interim ? this._anchor : this._end;
		this._editor.executeEdits(
			'chatSpeechToText',
			[{ range: replaceRange, text, forceMoveMarkers: true }],
			[Selection.fromPositions(caret)],
		);

		this._updateInterimDecorations(text, fullText, interim, finalizedText);
		this._prevInterimText = interim ? fullText : '';
	}

	/** Position of the given character offset within the inserted `text`. */
	private _positionAtOffset(text: string, offset: number): Position {
		const anchor = this._anchor!;
		const sub = text.slice(0, offset);
		const lines = sub.split('\n');
		if (lines.length === 1) {
			return new Position(anchor.lineNumber, anchor.column + lines[0].length);
		}
		return new Position(anchor.lineNumber + lines.length - 1, lines[lines.length - 1].length + 1);
	}

	/**
	 * Render the interim text in the placeholder color, shimmering only the
	 * still-processing trailing portion. The settled prefix is the longer of two
	 * measures: the part Foundry has actually finalized (`finalizedText`, which
	 * stops shimmering as soon as a segment is endpointed — including the last
	 * one after the user goes silent), and the part that has not changed since
	 * the previous interim update. Cleared entirely once the text is finalized.
	 */
	private _updateInterimDecorations(text: string, fullText: string, interim: boolean, finalizedText: string): void {
		if (!interim || !this._anchor || !this._end || Position.equals(this._anchor, this._end)) {
			this._logService.trace(`${LOG_PREFIX} interim decorations clear (interim=${interim})`);
			this._settledDecorations?.clear();
			this._shimmerDecorations?.clear();
			return;
		}

		const leading = this._needsLeadingSpace ? 1 : 0;
		const common = commonPrefixLength(fullText, this._prevInterimText);
		// When the tail diverges from the previous interim (a word is being
		// revised) settle only up to the last word boundary so the whole
		// in-progress word shimmers. But once the transcript stops changing (the
		// common prefix already covers the entire current text) settle
		// everything, otherwise the last word would shimmer forever.
		const heuristicSettled = common >= fullText.length ? fullText.length : wordBoundaryAtOrBefore(fullText, common);
		// Text Foundry has finalized never shimmers, regardless of the interim
		// diff — this is what settles the final words during a trailing silence,
		// where no later interim arrives to confirm they stopped changing.
		const finalizedChars = finalizedText ? commonPrefixLength(fullText, finalizedText) : 0;
		const settledChars = Math.min(fullText.length, Math.max(heuristicSettled, finalizedChars));
		const splitPosition = this._positionAtOffset(text, leading + settledChars);

		this._settledDecorations ??= this._editor.createDecorationsCollection();
		this._shimmerDecorations ??= this._editor.createDecorationsCollection();

		const settled = Position.equals(this._anchor, splitPosition) ? [] : [{
			range: Range.fromPositions(this._anchor, splitPosition),
			options: { description: 'chatSpeechToText-settled', inlineClassName: INTERIM_SETTLED_CLASS },
		}];
		const shimmer = Position.equals(splitPosition, this._end) ? [] : [{
			range: Range.fromPositions(splitPosition, this._end),
			options: { description: 'chatSpeechToText-interim', inlineClassName: INTERIM_SHIMMER_CLASS },
		}];
		this._logService.trace(`${LOG_PREFIX} interim decorations settledChars=${settledChars} split=${splitPosition.lineNumber}:${splitPosition.column}`);
		this._settledDecorations.set(settled);
		this._shimmerDecorations.set(shimmer);
	}

	/** Stop shimmering, leaving whatever text is currently inserted as solid. */
	clearShimmer(): void {
		this._logService.trace(`${LOG_PREFIX} clearShimmer`);
		this._settledDecorations?.clear();
		this._shimmerDecorations?.clear();
	}

	/**
	 * Settle the whole in-progress region, stopping the shimmer on the trailing
	 * words while keeping the not-yet-committed (placeholder) styling. Called
	 * after a pause in speech: Foundry holds the last spoken segment as an
	 * interim result until more audio (or `stop`) arrives, so without this the
	 * final words would shimmer indefinitely during a trailing silence. A later
	 * interim/final update re-applies the shimmer to any new tail.
	 */
	settleShimmer(): void {
		if (this._finalized || !this._anchor || !this._end || Position.equals(this._anchor, this._end)) {
			return;
		}
		this._logService.trace(`${LOG_PREFIX} settleShimmer`);
		this._settledDecorations ??= this._editor.createDecorationsCollection();
		this._shimmerDecorations ??= this._editor.createDecorationsCollection();
		this._settledDecorations.set([{
			range: Range.fromPositions(this._anchor, this._end),
			options: { description: 'chatSpeechToText-settled', inlineClassName: INTERIM_SETTLED_CLASS },
		}]);
		this._shimmerDecorations.clear();
	}

	/**
	 * Lock out further interim updates and stop shimmering immediately. Called
	 * when the user stops talking, before the (async) final transcription
	 * resolves, so a trailing interim transcript can neither overwrite the text
	 * nor re-apply the shimmer. The subsequent final `update(text, false)` still
	 * applies because it is not an interim update.
	 */
	beginFinalize(): void {
		this._logService.trace(`${LOG_PREFIX} beginFinalize`);
		this._finalized = true;
		this._settledDecorations?.clear();
		this._shimmerDecorations?.clear();
	}

	/**
	 * Remove everything this inserter has written (including any leading space it
	 * added) and restore the caret to where dictation began. Used when dictation
	 * is cancelled so no dictated text is left behind.
	 */
	revert(): void {
		this._settledDecorations?.clear();
		this._shimmerDecorations?.clear();
		const model = this._editor.getModel();
		if (!model || !this._anchor || !this._end) {
			return;
		}
		this._editor.executeEdits('chatSpeechToText', [{
			range: Range.fromPositions(this._anchor, this._end),
			text: '',
			forceMoveMarkers: true,
		}]);
		this._editor.setPosition(this._anchor);
		this._anchor = undefined;
		this._end = undefined;
	}
}

interface IActiveDictation {
	readonly service: IChatSpeechToTextService;
	readonly editor: ICodeEditor;
	readonly inserter: LiveTranscriptInserter;
	readonly disposables: DisposableStore;
	readonly logService: ILogService;
}

/**
 * Only one dictation can run at a time (the service is a singleton), so the
 * active session is tracked at module scope and shared by every entry point
 * (toggle action, hold-to-talk, and the sessions composer button).
 */
let _active: IActiveDictation | undefined;

/** True while a dictation is in progress. */
export function isDictating(): boolean {
	return !!_active;
}

/** The editor currently being dictated into, if any (used to scope the glow). */
export function activeDictationEditor(): ICodeEditor | undefined {
	return _active?.editor;
}

/** Start dictating into `editor`, rendering the transcript live. */
export async function startDictation(service: IChatSpeechToTextService, editor: ICodeEditor, window: Window & typeof globalThis, logService: ILogService): Promise<void> {
	if (_active || service.state !== ChatSpeechToTextState.Idle) {
		return;
	}
	const inserter = new LiveTranscriptInserter(editor, logService);
	const disposables = new DisposableStore();
	// Show a "Listening…" placeholder only once the session is actually
	// connected and recording, i.e. the service is in the Recording state and
	// the on-device model has finished preparing (downloading/loading). It must
	// not appear during microphone acquisition or while the model is still being
	// prepared, since transcription cannot happen yet. The placeholder remains
	// visible until transcript text is inserted, and is restored to its previous
	// value when the session ends.
	const previousPlaceholder = editor.getOption(EditorOption.placeholder);
	const listeningPlaceholder = localize('chatStt.listening', "Listening…");
	const applyPlaceholder = () => {
		if (!editor.getModel()) {
			return;
		}
		const shouldListen = service.state === ChatSpeechToTextState.Recording && !service.isPreparingModel;
		const current = editor.getOption(EditorOption.placeholder);
		if (shouldListen) {
			if (current !== listeningPlaceholder) {
				editor.updateOptions({ placeholder: listeningPlaceholder });
			}
		} else if (current === listeningPlaceholder) {
			editor.updateOptions({ placeholder: previousPlaceholder });
		}
	};
	disposables.add(toDisposable(() => {
		// Ensure the interim shimmer never lingers, regardless of how the session
		// ends (final transcript, cancel, editor disposal, or a service-side error).
		inserter.clearShimmer();
		if (!editor.getModel() || editor.getOption(EditorOption.placeholder) !== listeningPlaceholder) {
			return;
		}
		editor.updateOptions({ placeholder: previousPlaceholder });
	}));
	const idleSettle = disposables.add(new MutableDisposable());
	disposables.add(service.onDidUpdateTranscript(update => {
		logService.trace(`${LOG_PREFIX} onDidUpdateTranscript len=${update.text.length} finalized=${update.finalizedText.length} state=${service.state}`);
		inserter.update(update.text, true, update.finalizedText);
		// Restart the idle timer: if no further transcript arrives, the user has
		// paused, so stop shimmering the trailing (still-interim) words.
		idleSettle.value = disposableTimeout(() => inserter.settleShimmer(), IDLE_SETTLE_MS);
	}));
	disposables.add(service.onDidChangePreparingModel(() => applyPlaceholder()));
	disposables.add(service.onDidChangeState(state => {
		logService.trace(`${LOG_PREFIX} onDidChangeState ${state}`);
		if (state === ChatSpeechToTextState.Idle && _active?.service === service) {
			// If the service ends the session on its own (e.g. the model failed
			// to load and it surfaced an error), drop the stale active reference
			// so the toolbar and glow reflect that dictation is no longer running.
			_active = undefined;
			disposables.dispose();
			return;
		}
		applyPlaceholder();
	}));
	// The target editor can be disposed out from under us (e.g. the Agents
	// composer is closed); cancel dictation instead of leaving the microphone
	// and local transcription running against a dead editor.
	disposables.add(editor.onDidDispose(() => cancelDictation()));
	_active = { service, editor, inserter, disposables, logService };
	try {
		await service.start(window);
	} catch {
		// Acquisition/connection failure is surfaced by the service.
		if (_active?.service === service) {
			_active = undefined;
		}
		disposables.dispose();
	}
}

/** Stop the active dictation and apply the final transcript. */
export async function stopDictation(): Promise<void> {
	const active = _active;
	if (!active) {
		return;
	}
	_active = undefined;
	active.logService.trace(`${LOG_PREFIX} stopDictation begin, state=${active.service.state}`);
	// Stop shimmering and lock out interim updates right away so a trailing
	// interim transcript emitted while transcription finalizes cannot re-apply
	// the shimmer or overwrite the final text.
	active.inserter.beginFinalize();
	try {
		const text = await active.service.stopAndTranscribe();
		active.logService.trace(`${LOG_PREFIX} stopAndTranscribe resolved text=${text === undefined ? 'undefined' : `len=${text.length}`}`);
		if (text !== undefined) {
			// Final transcript: render it solid (no shimmer).
			active.inserter.update(text, false);
		} else {
			// No final transcript to apply; make sure the shimmer does not linger
			// over the last interim text.
			active.inserter.clearShimmer();
		}
	} finally {
		active.logService.trace(`${LOG_PREFIX} stopDictation dispose`);
		active.disposables.dispose();
	}
}

/** Abort the active dictation, discarding whatever was recorded. */
export function cancelDictation(): void {
	const active = _active;
	if (!active) {
		return;
	}
	_active = undefined;
	// Remove any live transcript already written to the editor so Escape leaves
	// the input exactly as it was before dictation started.
	active.inserter.revert();
	active.disposables.dispose();
	active.service.cancel();
}
