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
import { TrackedRangeStickiness } from '../../../../../editor/common/model.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
import { localize } from '../../../../../nls.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatDictationSurface, ChatSpeechToTextState, IChatSpeechToTextService } from './chatSpeechToTextService.js';

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
	private _isApplyingEdit = false;
	private _userModified = false;
	/**
	 * The last cumulative transcript this inserter rendered. Captured when the
	 * user manually edits the dictated text so everything spoken up to that
	 * point can be treated as committed and left untouched.
	 */
	private _lastCumulativeText = '';
	/**
	 * The leading portion of the cumulative transcript the user has taken
	 * ownership of (by editing the inserted text). Later transcript updates only
	 * insert the portion of the cumulative transcript that follows this prefix,
	 * so dictation keeps working after a manual edit instead of stopping.
	 */
	private _committedText = '';
	/**
	 * The position where dictation first began; set the first time `_anchor` is
	 * assigned and preserved even after user edits (unlike `_anchor`, which is
	 * reset to re-anchor subsequent speech). Used by `revert()` so cancellation
	 * can remove the full dictated region even after a user edit.
	 */
	private _revertAnchor: Position | undefined;
	/**
	 * The end of the last inserted transcript region at the time the user made
	 * a manual edit. Preserved so `revert()` can remove the original dictated
	 * text if the user cancels before any further speech arrives.
	 */
	private _revertEnd: Position | undefined;

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
	 *
	 * If the user has manually edited previously-dictated text, that text is
	 * committed and this inserter no longer manages it: only the portion of the
	 * cumulative transcript that follows the committed prefix is inserted, into a
	 * fresh region at the caret, so dictation keeps working after an edit.
	 */
	update(fullText: string, interim: boolean = true, finalizedText: string = ''): void {
		this._logService.trace(`${LOG_PREFIX} inserter.update interim=${interim} finalized=${this._finalized} userModified=${this._userModified} len=${fullText.length}`);
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

		this._lastCumulativeText = fullText;
		// After a manual edit, everything spoken up to that point is committed and
		// left as the user changed it; only render the remaining (new) tail of the
		// cumulative transcript, starting a fresh region at the caret.
		let renderText = fullText;
		let renderFinalized = finalizedText;
		if (this._committedText) {
			// Use the committed text's length as a stable boundary so that
			// backend-only corrections to already-committed words (e.g. "one
			// two" → "one too") do not produce spurious renderText and get
			// inserted at the caret as if the user had spoken something new.
			const committedLength = this._committedText.length;
			renderText = fullText.slice(committedLength);
			renderFinalized = finalizedText.length > committedLength ? finalizedText.slice(committedLength) : '';
			// Drop the whitespace that joined the committed and new portions; the
			// leading space is re-added below based on the character at the caret.
			const lead = renderText.length - renderText.replace(/^\s+/, '').length;
			renderText = renderText.slice(lead);
			renderFinalized = renderFinalized.length > lead ? renderFinalized.slice(lead) : '';
			if (renderText.length === 0) {
				// Nothing new has been dictated since the user's edit; leave the
				// committed text exactly as the user left it.
				this._logService.trace(`${LOG_PREFIX} inserter.update nothing new after user edit`);
				return;
			}
		}

		if (!this._anchor) {
			const selection = this._editor.getSelection() ?? model.getFullModelRange().collapseToEnd();
			const start = selection.getStartPosition();
			this._anchor = start;
			this._end = start;
			this._revertAnchor ??= start;
			this._needsLeadingSpace = start.column > 1 && !/\s$/.test(model.getValueInRange(new Range(
				start.lineNumber, Math.max(1, start.column - 1), start.lineNumber, start.column,
			)));
		}

		const text = (this._needsLeadingSpace ? ' ' : '') + renderText;

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
		this._isApplyingEdit = true;
		try {
			this._editor.executeEdits(
				'chatSpeechToText',
				[{ range: replaceRange, text, forceMoveMarkers: true }],
				[Selection.fromPositions(caret)],
			);
		} finally {
			this._isApplyingEdit = false;
		}

		this._updateInterimDecorations(text, renderText, interim, renderFinalized);
		this._prevInterimText = interim ? renderText : '';
	}

	onDidChangeModelContent(event: IModelContentChangedEvent): void {
		if (this._isApplyingEdit || !this._anchor || !this._end) {
			return;
		}
		const affectsTranscript = event.changes.some(change => Position.isBeforeOrEqual(
			new Position(change.range.startLineNumber, change.range.startColumn),
			this._end!,
		));
		if (!affectsTranscript) {
			return;
		}
		this._logService.trace(`${LOG_PREFIX} transcript invalidated by user edit`);
		this._userModified = true;
		// Commit everything dictated so far and re-anchor, so subsequent speech is
		// inserted into a fresh region at the caret instead of overwriting the
		// user's edits. This keeps dictation working after a manual edit.
		this._committedText = this._lastCumulativeText;
		// Preserve the current dictated range so revert() can still restore the
		// pre-dictation state if the user cancels before any further speech.
		this._revertAnchor ??= this._anchor;
		this._revertEnd = this._end;
		this._anchor = undefined;
		this._end = undefined;
		this._prevInterimText = '';
		// Do NOT reset _finalized: if stopAndTranscribe() is already in progress
		// (state is Transcribing), clearing the flag would let a trailing interim
		// transcript overwrite text despite the lock set by beginFinalize().
		this.clearShimmer();
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
	 * Range covering the finalized transcript text this inserter wrote,
	 * excluding any leading space it prepended, so its content equals the
	 * transcript exactly. `undefined` before anything is inserted. Used to track
	 * the dictated span for accuracy telemetry after the session ends.
	 */
	finalizedRange(): Range | undefined {
		if (this._userModified || !this._anchor || !this._end) {
			return undefined;
		}
		const start = this._needsLeadingSpace
			? new Position(this._anchor.lineNumber, this._anchor.column + 1)
			: this._anchor;
		return Range.fromPositions(start, this._end);
	}

	/**
	 * Remove everything this inserter has written (including any leading space it
	 * added) and restore the caret to where dictation began. Used when dictation
	 * is cancelled so no dictated text is left behind.
	 *
	 * Falls back to `_revertAnchor`/`_revertEnd` when `_anchor`/`_end` have been
	 * reset after a user edit, so cancelling dictation after a manual edit still
	 * removes the originally-dictated text.
	 */
	revert(): void {
		this._settledDecorations?.clear();
		this._shimmerDecorations?.clear();
		const model = this._editor.getModel();
		// Use the original dictation start if available; fall back to the current
		// anchor for the case where the user never edited.
		const anchor = this._revertAnchor ?? this._anchor;
		// Use the current end (covers new speech after a user edit) when present;
		// otherwise fall back to the preserved end from the last user edit.
		const end = this._end ?? this._revertEnd;
		if (!model || !anchor || !end) {
			return;
		}
		this._editor.executeEdits('chatSpeechToText', [{
			range: Range.fromPositions(anchor, end),
			text: '',
			forceMoveMarkers: true,
		}]);
		this._editor.setPosition(anchor);
		this._anchor = undefined;
		this._end = undefined;
		this._revertAnchor = undefined;
		this._revertEnd = undefined;
	}
}

interface IActiveDictation {
	readonly service: IChatSpeechToTextService;
	readonly editor: ICodeEditor;
	readonly inserter: LiveTranscriptInserter;
	readonly disposables: DisposableStore;
	readonly logService: ILogService;
	readonly surface: ChatDictationSurface;
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
export async function startDictation(service: IChatSpeechToTextService, editor: ICodeEditor, window: Window & typeof globalThis, logService: ILogService, surface: ChatDictationSurface = 'chat'): Promise<void> {
	if (_active || service.state !== ChatSpeechToTextState.Idle) {
		return;
	}
	const inserter = new LiveTranscriptInserter(editor, logService);
	const disposables = new DisposableStore();
	// Hide the editor's blinking caret for the duration of the dictation
	// session. During dictation the caret is parked at the start of the dictated
	// region (see LiveTranscriptInserter.update), so a blinking cursor there is
	// distracting as transcript text streams in.
	const HIDE_CURSOR_CLASS = 'dictation-hide-cursor';
	editor.getDomNode()?.classList.add(HIDE_CURSOR_CLASS);
	disposables.add(toDisposable(() => editor.getDomNode()?.classList.remove(HIDE_CURSOR_CLASS)));
	// Show a "Listening…" placeholder once the session is actually connected,
	// recording, and the on-device model has finished preparing. While the model
	// is still being prepared on first use (downloading/loading, which can take a
	// while), the toolbar mic shows a determinate download spinner
	// (DictationDownloadRing), so the placeholder stays on its previous value
	// instead of churning through "Downloading… X%" text. The placeholder must
	// not appear during microphone acquisition. It remains visible until
	// transcript text is inserted, and is restored to its previous value when the
	// session ends.
	const previousPlaceholder = editor.getOption(EditorOption.placeholder);
	const listeningPlaceholder = localize('chatStt.listening', "Listening…");
	// The placeholder we last applied, so we only ever restore the previous
	// placeholder when it was ours to restore.
	let appliedPlaceholder: string | undefined;
	const applyPlaceholder = () => {
		if (!editor.getModel()) {
			return;
		}
		const recording = service.state === ChatSpeechToTextState.Recording;
		// Only surface "Listening…" once the model is ready; while it prepares the
		// mic icon spinner conveys download/load progress.
		const desired = recording && !service.isPreparingModel
			? listeningPlaceholder
			: undefined;
		if (desired !== undefined) {
			if (appliedPlaceholder !== desired) {
				editor.updateOptions({ placeholder: desired });
				appliedPlaceholder = desired;
			}
		} else if (appliedPlaceholder !== undefined) {
			editor.updateOptions({ placeholder: previousPlaceholder });
			appliedPlaceholder = undefined;
		}
	};
	disposables.add(toDisposable(() => {
		// Ensure the interim shimmer never lingers, regardless of how the session
		// ends (final transcript, cancel, editor disposal, or a service-side error).
		inserter.clearShimmer();
		if (!editor.getModel() || appliedPlaceholder === undefined) {
			return;
		}
		editor.updateOptions({ placeholder: previousPlaceholder });
		appliedPlaceholder = undefined;
	}));
	const idleSettle = disposables.add(new MutableDisposable());
	disposables.add(service.onDidUpdateTranscript(update => {
		logService.trace(`${LOG_PREFIX} onDidUpdateTranscript len=${update.text.length} finalized=${update.finalizedText.length} state=${service.state}`);
		if (!service.showTranscriptWhileDictating) {
			// The setting is read live (not snapshotted) so transcript rendering
			// and the hidden-transcript mic glow always react to configuration
			// changes together. If the transcript is hidden mid-session, drop any
			// lingering interim shimmer so hidden mode renders no transcript at all.
			inserter.clearShimmer();
			idleSettle.clear();
			return;
		}
		inserter.update(update.text, true, update.finalizedText);
		// Restart the idle timer: if no further transcript arrives, the user has
		// paused, so stop shimmering the trailing (still-interim) words.
		idleSettle.value = disposableTimeout(() => inserter.settleShimmer(), IDLE_SETTLE_MS);
	}));
	disposables.add(editor.onDidChangeModelContent(event => inserter.onDidChangeModelContent(event)));
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
	_active = { service, editor, inserter, disposables, logService, surface };
	try {
		await service.start(window, surface);
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
			// Track how much of this dictated text the user edits before sending,
			// as an accuracy signal comparing the backends.
			trackDictationAccuracy(active, text);
		} else {
			// No final transcript to apply; make sure the shimmer does not linger
			// over the last interim text.
			active.inserter.clearShimmer();
		}
	} finally {
		active.logService.trace(`${LOG_PREFIX} stopDictation dispose`);
		active.disposables.dispose();
		// Return focus to the dictation editor so the caret (just un-hidden by
		// disposing the hide-cursor class) reappears immediately at the end of the
		// inserted transcript, ready for the user to continue typing.
		active.editor.focus();
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

/**
 * After a dictation finishes, watch the dictated span until its text leaves the
 * input and then report how much it was edited in the meantime as an accuracy
 * signal. Preferably triggered by an actual submit (see
 * {@link notifyDictationSubmitted}); otherwise falls back to the input being
 * cleared or the editor being torn down.
 *
 * The dictated region is followed with a tracked decoration so it stays aligned
 * as the user edits around it; edits typed at its edges are excluded so
 * unrelated text appended after the dictation is not counted. Only aggregate
 * character metrics are logged — never the transcript text. Runs independently
 * of the (already-disposed) dictation session and cleans itself up on measure.
 */
interface IDictationAccuracyTracker {
	readonly editor: ICodeEditor;
	measure(submitted: boolean): void;
}

/**
 * Live accuracy trackers awaiting their dictated text to leave the input. Keyed
 * at module scope (mirroring {@link _active}) so a submit handler can resolve
 * the tracker(s) for its editor via {@link notifyDictationSubmitted}.
 */
const _accuracyTrackers = new Set<IDictationAccuracyTracker>();

/**
 * Called by an input's submit path to measure any pending dictation accuracy
 * against the text actually being sent, before the input is cleared. This is
 * the precise signal; without it a tracker falls back to the clear/teardown
 * heuristic and reports `submitted: false`.
 */
export function notifyDictationSubmitted(editor: ICodeEditor): void {
	for (const tracker of [..._accuracyTrackers]) {
		if (tracker.editor === editor) {
			tracker.measure(true);
		}
	}
}

function trackDictationAccuracy(active: IActiveDictation, dictatedText: string): void {
	const { editor, inserter, service, surface } = active;
	const model = editor.getModel();
	const range = inserter.finalizedRange();
	if (!model || !range || !dictatedText) {
		return;
	}
	const backend = service.currentBackend;
	const collection = editor.createDecorationsCollection([{
		range,
		options: {
			description: 'chatSpeechToText-accuracy',
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		},
	}]);
	const store = new DisposableStore();
	let measured = false;
	const tracker: IDictationAccuracyTracker = {
		editor,
		measure(submitted: boolean) {
			if (measured) {
				return;
			}
			measured = true;
			const current = collection.getRange(0);
			const submittedText = current ? model.getValueInRange(current) : '';
			service.logDictationAccuracy({ dictatedText, submittedText, backend, surface, submitted });
			collection.clear();
			store.dispose();
			_accuracyTrackers.delete(tracker);
		},
	};
	// Fallbacks when no submit signal arrives: submitting the chat input clears
	// the editor to empty (also covers a manual clear-all), and the editor can
	// be torn down with dictated text still in it.
	store.add(model.onDidChangeContent(() => {
		if (model.getValueLength() === 0) {
			tracker.measure(false);
		}
	}));
	store.add(model.onWillDispose(() => tracker.measure(false)));
	store.add(editor.onDidDispose(() => tracker.measure(false)));
	_accuracyTrackers.add(tracker);
}
