/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableWindowInterval } from 'vs/base/browser/dom';
import { IAction, toAction } from 'vs/base/common/actions';
import { coalesceInPlace, equals, tail } from 'vs/base/common/arrays';
import { AsyncIterableObject, AsyncIterableSource } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { Iterable } from 'vs/base/common/iterator';
import { Lazy } from 'vs/base/common/lazy';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon, themeColorFromId } from 'vs/base/common/themables';
import { ICodeEditor, IViewZone, IViewZoneChangeAccessor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { StableEditorScrollState } from 'vs/editor/browser/stableEditorScroll';
import { LineSource, RenderOptions, renderLines } from 'vs/editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines';
import { EditOperation, ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { LineRange } from 'vs/editor/common/core/lineRange';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { DetailedLineRangeMapping, LineRangeMapping, RangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { TextEdit } from 'vs/editor/common/languages';
import { ICursorStateComputer, IIdentifiedSingleEditOperation, IModelDecorationsChangeAccessor, IModelDeltaDecoration, ITextModel, IValidEditOperation, OverviewRulerLane, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { InlineDecoration, InlineDecorationType } from 'vs/editor/common/viewModel';
import { localize } from 'vs/nls';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgress, Progress } from 'vs/platform/progress/common/progress';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { SaveReason } from 'vs/workbench/common/editor';
import { countWords, getNWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { InlineChatFileCreatePreviewWidget, InlineChatLivePreviewWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatLivePreviewWidget';
import { ReplyResponse, Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { InlineChatZoneWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { CTX_INLINE_CHAT_CHANGE_HAS_DIFF, CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF, CTX_INLINE_CHAT_DOCUMENT_CHANGED, overviewRulerInlineChatDiffInserted } from 'vs/workbench/contrib/inlineChat/common/inlineChat';

export abstract class EditModeStrategy {

	protected static _decoBlock = ModelDecorationOptions.register({
		description: 'inline-chat',
		showIfCollapsed: false,
		isWholeLine: true,
		className: 'inline-chat-block-selection',
	});


	protected readonly _onDidAccept = new Emitter<void>();
	protected readonly _onDidDiscard = new Emitter<void>();

	readonly onDidAccept: Event<void> = this._onDidAccept.event;
	readonly onDidDiscard: Event<void> = this._onDidDiscard.event;

	toggleDiff?: () => any;

	constructor(
		protected readonly _session: Session,
		protected readonly _zone: InlineChatZoneWidget,
	) { }

	dispose(): void {
		this._onDidAccept.dispose();
		this._onDidDiscard.dispose();
	}

	abstract start(): Promise<void>;

	abstract apply(): Promise<void>;

	abstract cancel(): Promise<void>;

	abstract makeProgressiveChanges(targetWindow: Window, edits: ISingleEditOperation[], timings: ProgressingEditsOptions): Promise<void>;

	abstract makeChanges(targetWindow: Window, edits: ISingleEditOperation[]): Promise<void>;

	abstract undoChanges(altVersionId: number): Promise<void>;

	abstract renderChanges(response: ReplyResponse): Promise<Position | undefined>;

	abstract hasFocus(): boolean;

	getWholeRangeDecoration(): IModelDeltaDecoration[] {
		const ranges = [this._session.wholeRange.value];
		const newDecorations = ranges.map(range => range.isEmpty() ? undefined : ({ range, options: EditModeStrategy._decoBlock }));
		coalesceInPlace(newDecorations);
		return newDecorations;
	}
}

export class PreviewStrategy extends EditModeStrategy {

	private readonly _ctxDocumentChanged: IContextKey<boolean>;
	private readonly _listener: IDisposable;

	constructor(
		session: Session,
		zone: InlineChatZoneWidget,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(session, zone);

		this._ctxDocumentChanged = CTX_INLINE_CHAT_DOCUMENT_CHANGED.bindTo(contextKeyService);
		this._listener = Event.debounce(session.textModelN.onDidChangeContent.bind(session.textModelN), () => { }, 350)(_ => {
			if (!session.textModelN.isDisposed() && !session.textModel0.isDisposed()) {
				this._ctxDocumentChanged.set(session.hasChangedText);
			}
		});
	}

	override dispose(): void {
		this._listener.dispose();
		this._ctxDocumentChanged.reset();
		super.dispose();
	}

	async start() {
		// nothing to do
	}

	async apply() {

		if (!(this._session.lastExchange?.response instanceof ReplyResponse)) {
			return;
		}
		const editResponse = this._session.lastExchange?.response;
		const { textModelN: modelN } = this._session;

		if (modelN.equalsTextBuffer(this._session.textModel0.getTextBuffer())) {
			modelN.pushStackElement();
			for (const edits of editResponse.allLocalEdits) {
				modelN.pushEditOperations(null, edits.map(TextEdit.asEditOperation), () => null);
			}
			modelN.pushStackElement();
		}

		const { untitledTextModel } = this._session.lastExchange.response;
		if (untitledTextModel && !untitledTextModel.isDisposed() && untitledTextModel.isDirty()) {
			await untitledTextModel.save({ reason: SaveReason.EXPLICIT });
		}
	}

	async cancel(): Promise<void> {
		// nothing to do
	}

	override async makeChanges(_targetWindow: Window, _edits: ISingleEditOperation[]): Promise<void> {
		// nothing to do
	}

	override async undoChanges(_altVersionId: number): Promise<void> {
		// nothing to do
	}

	override async makeProgressiveChanges(): Promise<void> {
		// nothing to do
	}

	override async renderChanges(response: ReplyResponse): Promise<undefined> {
		if (response.allLocalEdits.length > 0) {
			const allEditOperation = response.allLocalEdits.map(edits => edits.map(TextEdit.asEditOperation));
			await this._zone.widget.showEditsPreview(this._session.textModel0, this._session.textModelN, allEditOperation);
		} else {
			this._zone.widget.hideEditsPreview();
		}

		if (response.untitledTextModel) {
			this._zone.widget.showCreatePreview(response.untitledTextModel);
		} else {
			this._zone.widget.hideCreatePreview();
		}
	}

	hasFocus(): boolean {
		return this._zone.widget.hasFocus();
	}
}


export interface ProgressingEditsOptions {
	duration: number;
	token: CancellationToken;
}

export class LivePreviewStrategy extends EditModeStrategy {

	private readonly _previewZone: Lazy<InlineChatFileCreatePreviewWidget>;
	private readonly _diffZonePool: InlineChatLivePreviewWidget[] = [];
	private _currentLineRangeGroups: LineRangeMapping[][] = [];
	private _editCount: number = 0;

	constructor(
		session: Session,
		private readonly _editor: ICodeEditor,
		zone: InlineChatZoneWidget,
		@IStorageService storageService: IStorageService,
		@IBulkEditService bulkEditService: IBulkEditService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IInstantiationService private readonly _instaService: IInstantiationService,
	) {
		super(session, zone);

		this._previewZone = new Lazy(() => _instaService.createInstance(InlineChatFileCreatePreviewWidget, _editor));
	}

	override dispose(): void {
		for (const zone of this._diffZonePool) {
			zone.hide();
			zone.dispose();
		}
		this._previewZone.rawValue?.hide();
		this._previewZone.rawValue?.dispose();
		super.dispose();
	}
	async start() {
		// nothing to do
	}

	async apply() {
		if (this._editCount > 0) {
			this._editor.pushUndoStop();
		}
		if (!(this._session.lastExchange?.response instanceof ReplyResponse)) {
			return;
		}
		const { untitledTextModel } = this._session.lastExchange.response;
		if (untitledTextModel && !untitledTextModel.isDisposed() && untitledTextModel.isDirty()) {
			await untitledTextModel.save({ reason: SaveReason.EXPLICIT });
		}
	}

	async cancel() {
		const { textModelN: modelN, textModelNAltVersion, textModelNSnapshotAltVersion } = this._session;
		if (modelN.isDisposed()) {
			return;
		}
		const targetAltVersion = textModelNSnapshotAltVersion ?? textModelNAltVersion;
		await undoModelUntil(modelN, targetAltVersion);
	}
	override async makeChanges(_targetWindow: Window, edits: ISingleEditOperation[]): Promise<void> {
		const cursorStateComputerAndInlineDiffCollection: ICursorStateComputer = (undoEdits) => {
			let last: Position | null = null;
			for (const edit of undoEdits) {
				last = !last || last.isBefore(edit.range.getEndPosition()) ? edit.range.getEndPosition() : last;
			}
			return last && [Selection.fromPositions(last)];
		};

		// push undo stop before first edit
		if (++this._editCount === 1) {
			this._editor.pushUndoStop();
		}
		this._editor.executeEdits('inline-chat-live', edits, cursorStateComputerAndInlineDiffCollection);
	}

	override async undoChanges(altVersionId: number): Promise<void> {
		const { textModelN } = this._session;
		await undoModelUntil(textModelN, altVersionId);
		await this._updateDiffZones();
	}

	override async makeProgressiveChanges(targetWindow: Window, edits: ISingleEditOperation[], opts: ProgressingEditsOptions): Promise<void> {

		// push undo stop before first edit
		if (++this._editCount === 1) {
			this._editor.pushUndoStop();
		}

		//add a listener that shows the diff zones as soon as the first edit is applied
		let renderTask = Promise.resolve();
		const changeListener = this._session.textModelN.onDidChangeContent(() => {
			changeListener.dispose();
			renderTask = this._updateDiffZones();
		});

		const durationInSec = opts.duration / 1000;
		for (const edit of edits) {
			const wordCount = countWords(edit.text ?? '');
			const speed = wordCount / durationInSec;
			// console.log({ durationInSec, wordCount, speed: wordCount / durationInSec });
			await performAsyncTextEdit(this._session.textModelN, asProgressiveEdit(targetWindow, edit, speed, opts.token));
		}

		await renderTask;
		changeListener.dispose();
	}

	override async renderChanges(response: ReplyResponse): Promise<undefined> {

		await this._updateDiffZones();

		if (response.untitledTextModel && !response.untitledTextModel.isDisposed()) {
			this._previewZone.value.showCreation(this._session.wholeRange.value.getStartPosition().delta(-1), response.untitledTextModel);
		} else {
			this._previewZone.value.hide();
		}
	}

	protected _updateSummaryMessage(mappings: readonly LineRangeMapping[]) {
		let linesChanged = 0;
		for (const change of mappings) {
			linesChanged += change.changedLineCount;
		}
		let message: string;
		if (linesChanged === 0) {
			message = localize('lines.0', "Nothing changed");
		} else if (linesChanged === 1) {
			message = localize('lines.1', "Changed 1 line");
		} else {
			message = localize('lines.N', "Changed {0} lines", linesChanged);
		}
		this._zone.widget.updateStatus(message);
	}

	private async _updateDiffZones() {
		const diff = await this._editorWorkerService.computeDiff(this._session.textModel0.uri, this._session.textModelN.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: 5000, computeMoves: false }, 'advanced');
		if (!diff || diff.changes.length === 0) {
			for (const zone of this._diffZonePool) {
				zone.hide();
			}
			return;
		}

		const originalStartLineNumber = this._session.session.wholeRange?.startLineNumber ?? 1;

		const mainGroup: LineRangeMapping[] = [];
		let lastGroup: LineRangeMapping[] | undefined;
		const groups: LineRangeMapping[][] = [mainGroup];

		for (let i = 0; i < diff.changes.length; i++) {
			const change = diff.changes[i];

			// everything below the original start line is one group
			if (change.original.startLineNumber >= originalStartLineNumber || 'true') { // TODO@jrieken be smarter and fix this
				mainGroup.push(change);
				continue;
			}

			if (!lastGroup) {
				lastGroup = [change];
				groups.push(lastGroup);
				continue;
			}

			// when the distance between the two changes is less than 75% of the total number of lines changed
			// they get merged into the same group
			const last = tail(lastGroup);
			const treshold = Math.ceil((change.modified.length + last.modified.length) * .75);
			if (change.modified.startLineNumber - last.modified.endLineNumberExclusive <= treshold) {
				lastGroup.push(change);
			} else {
				lastGroup = [change];
				groups.push(lastGroup);
			}
		}

		const beforeAndNowAreEqual = equals(this._currentLineRangeGroups, groups, (groupA, groupB) => {
			return equals(groupA, groupB, (mappingA, mappingB) => {
				return mappingA.original.equals(mappingB.original) && mappingA.modified.equals(mappingB.modified);
			});
		});

		if (beforeAndNowAreEqual) {
			return;
		}

		this._updateSummaryMessage(diff.changes);
		this._currentLineRangeGroups = groups;

		const handleDiff = () => {
			this._updateDiffZones();
		};

		// create enough zones
		while (groups.length > this._diffZonePool.length) {
			this._diffZonePool.push(this._instaService.createInstance(InlineChatLivePreviewWidget, this._editor, this._session, {}, this._diffZonePool.length === 0 ? handleDiff : undefined));
		}
		for (let i = 0; i < groups.length; i++) {
			this._diffZonePool[i].showForChanges(groups[i]);
		}
		// hide unused zones
		for (let i = groups.length; i < this._diffZonePool.length; i++) {
			this._diffZonePool[i].hide();
		}
	}

	override hasFocus(): boolean {
		return this._zone.widget.hasFocus()
			|| Boolean(this._previewZone.rawValue?.hasFocus())
			|| this._diffZonePool.some(zone => zone.isVisible && zone.hasFocus());
	}
}

export interface AsyncTextEdit {
	readonly range: IRange;
	readonly newText: AsyncIterable<string>;
}

export async function performAsyncTextEdit(model: ITextModel, edit: AsyncTextEdit, progress?: IProgress<IValidEditOperation[]>) {

	const [id] = model.deltaDecorations([], [{
		range: edit.range,
		options: {
			description: 'asyncTextEdit',
			stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
		}
	}]);

	let first = true;
	for await (const part of edit.newText) {

		if (model.isDisposed()) {
			break;
		}

		const range = model.getDecorationRange(id);
		if (!range) {
			throw new Error('FAILED to perform async replace edit because the anchor decoration was removed');
		}

		const edit = first
			? EditOperation.replace(range, part) // first edit needs to override the "anchor"
			: EditOperation.insert(range.getEndPosition(), part);

		model.pushEditOperations(null, [edit], (undoEdits) => {
			progress?.report(undoEdits);
			return null;
		});
		first = false;
	}
}

export function asAsyncEdit(edit: IIdentifiedSingleEditOperation): AsyncTextEdit {
	return {
		range: edit.range,
		newText: AsyncIterableObject.fromArray([edit.text ?? ''])
	} satisfies AsyncTextEdit;
}

export function asProgressiveEdit(targetWindow: Window, edit: IIdentifiedSingleEditOperation, wordsPerSec: number, token: CancellationToken): AsyncTextEdit {

	wordsPerSec = Math.max(10, wordsPerSec);

	const stream = new AsyncIterableSource<string>();
	let newText = edit.text ?? '';
	// const wordCount = countWords(newText);

	const handle = disposableWindowInterval(targetWindow, () => {

		const r = getNWords(newText, 1);
		stream.emitOne(r.value);
		newText = newText.substring(r.value.length);
		if (r.isFullString) {
			handle.dispose();
			stream.resolve();
			d.dispose();
		}

	}, 1000 / wordsPerSec);

	// cancel ASAP
	const d = token.onCancellationRequested(() => {
		handle.dispose();
		stream.resolve();
		d.dispose();
	});

	return {
		range: edit.range,
		newText: stream.asyncIterable
	};
}


// ---

class Hunk {
	constructor(
		readonly original: LineRange,
		readonly modified: LineRange,
		readonly changes: RangeMapping[]
	) { }
}

export class LiveStrategy extends EditModeStrategy {

	private readonly _decoInsertedText = ModelDecorationOptions.register({
		description: 'inline-modified-line',
		className: 'inline-chat-inserted-range-linehighlight',
		isWholeLine: true,
		overviewRuler: {
			position: OverviewRulerLane.Full,
			color: themeColorFromId(overviewRulerInlineChatDiffInserted),
		}
	});

	private readonly _decoInsertedTextRange = ModelDecorationOptions.register({
		description: 'inline-chat-inserted-range-linehighlight',
		className: 'inline-chat-inserted-range',
	});

	private readonly _store: DisposableStore = new DisposableStore();
	private readonly _renderStore: DisposableStore = new DisposableStore();
	private readonly _previewZone: Lazy<InlineChatFileCreatePreviewWidget>;

	private readonly _ctxCurrentChangeHasDiff: IContextKey<boolean>;
	private readonly _ctxCurrentChangeShowsDiff: IContextKey<boolean>;

	private readonly _progressiveEditingDecorations: IEditorDecorationsCollection;

	private _editCount: number = 0;

	constructor(
		session: Session,
		protected readonly _editor: ICodeEditor,
		zone: InlineChatZoneWidget,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorWorkerService protected readonly _editorWorkerService: IEditorWorkerService,
		@IInstantiationService protected readonly _instaService: IInstantiationService,
	) {
		super(session, zone);
		this._ctxCurrentChangeHasDiff = CTX_INLINE_CHAT_CHANGE_HAS_DIFF.bindTo(contextKeyService);
		this._ctxCurrentChangeShowsDiff = CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF.bindTo(contextKeyService);

		this._progressiveEditingDecorations = this._editor.createDecorationsCollection();
		this._previewZone = new Lazy(() => _instaService.createInstance(InlineChatFileCreatePreviewWidget, _editor));

	}

	override dispose(): void {
		this._resetDiff();
		this._previewZone.rawValue?.dispose();
		this._store.dispose();
		super.dispose();
	}

	private _resetDiff(): void {
		this._ctxCurrentChangeHasDiff.reset();
		this._ctxCurrentChangeShowsDiff.reset();
		this._renderStore.clear();
		this._zone.widget.updateStatus('');
		this._progressiveEditingDecorations.clear();
	}

	async start() {
		this._resetDiff();
	}

	async apply() {
		this._resetDiff();
		if (this._editCount > 0) {
			this._editor.pushUndoStop();
		}
		if (!(this._session.lastExchange?.response instanceof ReplyResponse)) {
			return;
		}
		const { untitledTextModel } = this._session.lastExchange.response;
		if (untitledTextModel && !untitledTextModel.isDisposed() && untitledTextModel.isDirty()) {
			await untitledTextModel.save({ reason: SaveReason.EXPLICIT });
		}
	}

	async cancel() {
		this._resetDiff();
		const { textModelN: modelN, textModelNAltVersion, textModelNSnapshotAltVersion } = this._session;
		if (modelN.isDisposed()) {
			return;
		}
		const targetAltVersion = textModelNSnapshotAltVersion ?? textModelNAltVersion;
		await undoModelUntil(modelN, targetAltVersion);
	}

	override async undoChanges(altVersionId: number): Promise<void> {
		this._renderStore.clear();

		const { textModelN } = this._session;
		await undoModelUntil(textModelN, altVersionId);
	}

	override async makeChanges(targetWindow: Window, edits: ISingleEditOperation[]): Promise<void> {
		return this._makeChanges(targetWindow, edits, undefined);
	}

	override async makeProgressiveChanges(targetWindow: Window, edits: ISingleEditOperation[], opts: ProgressingEditsOptions): Promise<void> {
		return this._makeChanges(targetWindow, edits, opts);
	}

	private async _makeChanges(targetWindow: Window, edits: ISingleEditOperation[], opts: ProgressingEditsOptions | undefined): Promise<void> {

		// push undo stop before first edit
		if (++this._editCount === 1) {
			this._editor.pushUndoStop();
		}

		// add decorations once per line that got edited
		const progress = new Progress<IValidEditOperation[]>(edits => {

			const newLines = new Set<number>();
			for (const edit of edits) {
				LineRange.fromRange(edit.range).forEach(line => newLines.add(line));
			}
			const existingRanges = this._progressiveEditingDecorations.getRanges().map(LineRange.fromRange);
			for (const existingRange of existingRanges) {
				existingRange.forEach(line => newLines.delete(line));
			}
			const newDecorations: IModelDeltaDecoration[] = [];
			for (const line of newLines) {
				newDecorations.push({ range: new Range(line, 1, line, Number.MAX_VALUE), options: this._decoInsertedText });
			}

			this._progressiveEditingDecorations.append(newDecorations);
		});

		if (opts) {
			// ASYNC
			const durationInSec = opts.duration / 1000;
			for (const edit of edits) {
				const wordCount = countWords(edit.text ?? '');
				const speed = wordCount / durationInSec;
				// console.log({ durationInSec, wordCount, speed: wordCount / durationInSec });
				await performAsyncTextEdit(this._session.textModelN, asProgressiveEdit(targetWindow, edit, speed, opts.token), progress);
			}

		} else {
			// SYNC
			this._editor.executeEdits('inline-chat-live', edits, undoEdits => {
				progress.report(undoEdits);
				return null;
			});
		}
	}

	override async renderChanges(response: ReplyResponse) {

		if (response.untitledTextModel && !response.untitledTextModel.isDisposed()) {
			this._previewZone.value.showCreation(this._session.wholeRange.value.getStartPosition().delta(-1), response.untitledTextModel);
		} else {
			this._previewZone.value.hide();
		}

		this._progressiveEditingDecorations.clear();

		const hunks = await this._computeHunks();

		this._renderStore.clear();

		if (hunks.length === 0) {
			return undefined;
		}

		const enum HunkState {
			Accepted = 1,
			Rejected = 2,
		}

		type HunkDisplayData = {
			acceptedOrRejected: HunkState | undefined;
			decorationIds: string[];

			viewZoneId: string | undefined;
			viewZone: IViewZone;

			distance: number;
			position: Position;
			actions: IAction[];
			toggleDiff?: () => any;
		};

		let widgetData: HunkDisplayData | undefined;
		const hunkDisplayData = new Map<Hunk, HunkDisplayData>();

		const renderHunks = () => {

			changeDecorationsAndViewZones(this._editor, (decorationsAccessor, viewZoneAccessor) => {

				widgetData = undefined;

				for (const hunk of hunks) {

					const { modified } = hunk;

					let data = hunkDisplayData.get(hunk);
					if (!data) {
						// first time -> create decoration
						const decorationIds: string[] = [];
						const modifiedRange = asRange(modified, this._session.textModelN);
						decorationIds.push(decorationsAccessor.addDecoration(modifiedRange, this._decoInsertedText));
						for (const change of hunk.changes) {
							decorationIds.push(decorationsAccessor.addDecoration(change.modifiedRange, this._decoInsertedTextRange));
						}

						const actions = [
							toAction({
								id: 'accept',
								label: localize('accept', "Accept"),
								class: ThemeIcon.asClassName(Codicon.check),
								run: () => {
									// ACCEPT: stop rendering this as inserted
									hunkDisplayData.get(hunk)!.acceptedOrRejected = HunkState.Accepted;
									renderHunks();
								}
							}),
							toAction({
								id: 'discard',
								label: localize('discard', "Discard"),
								class: ThemeIcon.asClassName(Codicon.discard),
								run: () => {
									const edits: ISingleEditOperation[] = [];
									for (let i = 1; i < decorationIds.length; i++) {
										// DISCARD: replace modified range with original value. The modified range is retrieved from a decoration
										// which was created above so that typing in the editor keeps discard working.
										const modifiedRange = this._session.textModelN.getDecorationRange(decorationIds[i])!;
										const originalValue = this._session.textModel0.getValueInRange(hunk.changes[i - 1].originalRange);
										edits.push(EditOperation.replace(modifiedRange, originalValue));
									}
									this._session.textModelN.pushEditOperations(null, edits, () => null);
									hunkDisplayData.get(hunk)!.acceptedOrRejected = HunkState.Rejected;
									renderHunks();
								}
							}),
						];

						// original view zone
						const mightContainNonBasicASCII = this._session.textModel0.mightContainNonBasicASCII() ?? false;
						const mightContainRTL = this._session.textModel0.mightContainRTL() ?? false;
						const renderOptions = RenderOptions.fromEditor(this._editor);
						const source = new LineSource(
							hunk.original.mapToLineArray(l => this._session.textModel0.tokenization.getLineTokens(l)),
							[],
							mightContainNonBasicASCII,
							mightContainRTL,
						);
						const domNode = document.createElement('div');
						domNode.className = 'inline-chat-original-zone2';
						const result = renderLines(source, renderOptions, [new InlineDecoration(new Range(hunk.original.startLineNumber, 1, hunk.original.startLineNumber, 1), '', InlineDecorationType.Regular)], domNode);
						const viewZoneData: IViewZone = {
							afterLineNumber: -1,
							heightInLines: result.heightInLines,
							domNode,
						};

						const toggleDiff = () => {
							const scrollState = StableEditorScrollState.capture(this._editor);
							if (!data!.viewZoneId) {

								this._editor.changeViewZones(accessor => {
									viewZoneData.afterLineNumber = this._session.textModelN.getDecorationRange(decorationIds[0])!.startLineNumber - 1;
									data!.viewZoneId = accessor.addZone(viewZoneData);
								});
								this._ctxCurrentChangeShowsDiff.set(true);
							} else {
								this._editor.changeViewZones(accessor => {
									accessor.removeZone(data!.viewZoneId!);
									data!.viewZoneId = undefined;
								});
								this._ctxCurrentChangeShowsDiff.set(false);
							}
							scrollState.restore(this._editor);
						};

						const zoneLineNumber = this._zone.position!.lineNumber;
						const myDistance = zoneLineNumber <= modifiedRange.startLineNumber
							? modifiedRange.startLineNumber - zoneLineNumber
							: zoneLineNumber - modifiedRange.endLineNumber;

						data = {
							acceptedOrRejected: undefined,
							decorationIds,
							viewZoneId: '',
							viewZone: viewZoneData,
							distance: myDistance,
							position: modifiedRange.getStartPosition().delta(-1),
							toggleDiff: !hunk.original.isEmpty ? toggleDiff : undefined,
							actions
						};

						hunkDisplayData.set(hunk, data);

					} else if (data.acceptedOrRejected !== undefined) {
						// accepted or rejected -> remove decoration
						for (const decorationId of data.decorationIds) {
							decorationsAccessor.removeDecoration(decorationId);
						}
						if (data.viewZoneId) {
							viewZoneAccessor.removeZone(data.viewZoneId);
						}

						data.decorationIds = [];
						data.viewZoneId = undefined;

					} else {
						// update distance and position based on modifiedRange-decoration
						const zoneLineNumber = this._zone.position!.lineNumber;
						const modifiedRangeNow = this._session.textModelN.getDecorationRange(data.decorationIds[0])!;
						data.position = modifiedRangeNow.getStartPosition().delta(-1);
						data.distance = zoneLineNumber <= modifiedRangeNow.startLineNumber
							? modifiedRangeNow.startLineNumber - zoneLineNumber
							: zoneLineNumber - modifiedRangeNow.endLineNumber;
					}

					if (!data.acceptedOrRejected) {
						if (!widgetData || data.distance < widgetData.distance) {
							widgetData = data;
						}
					}
				}
			});

			if (widgetData) {
				this._zone.widget.setExtraButtons(widgetData.actions);
				this._zone.updatePositionAndHeight(widgetData.position);
				this._editor.revealPositionInCenterIfOutsideViewport(widgetData.position);

				const remainingHunks = Iterable.reduce(hunkDisplayData.values(), (p, c) => { return p + (c.acceptedOrRejected ? 0 : 1); }, 0);
				this._updateSummaryMessage(remainingHunks);

				this._ctxCurrentChangeHasDiff.set(Boolean(widgetData.toggleDiff));
				this.toggleDiff = widgetData.toggleDiff;

			} else if (hunkDisplayData.size > 0) {
				// everything accepted or rejected
				let oneAccepted = false;
				for (const data of hunkDisplayData.values()) {
					if (data.acceptedOrRejected === HunkState.Accepted) {
						oneAccepted = true;
						break;
					}
				}
				if (oneAccepted) {
					this._onDidAccept.fire();
				} else {
					this._onDidDiscard.fire();
				}
			}
		};

		renderHunks();

		this._renderStore.add(toDisposable(() => {
			this._zone.widget.setExtraButtons([]);

			changeDecorationsAndViewZones(this._editor, (decorationsAccessor, viewZoneAccessor) => {
				for (const data of hunkDisplayData.values()) {
					// remove decorations
					for (const decorationId of data.decorationIds) {
						decorationsAccessor.removeDecoration(decorationId);
					}
					// remove view zone
					if (data.viewZoneId) {
						viewZoneAccessor.removeZone(data.viewZoneId);
					}
					data.viewZone.domNode.remove();
				}
			});
		}));


		return widgetData?.position;
	}

	private static readonly HUNK_THRESHOLD = 8;

	private async _computeHunks(): Promise<Hunk[]> {
		const diff = await this._editorWorkerService.computeDiff(this._session.textModel0.uri, this._session.textModelN.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER, computeMoves: false }, 'advanced');

		if (!diff || diff.changes.length === 0) {
			return [];
		}

		// merge changes neighboring changes
		const mergedChanges = [diff.changes[0]];
		for (let i = 1; i < diff.changes.length; i++) {
			const lastChange = mergedChanges[mergedChanges.length - 1];
			const thisChange = diff.changes[i];
			if (thisChange.modified.startLineNumber - lastChange.modified.endLineNumberExclusive <= LiveStrategy.HUNK_THRESHOLD) {
				mergedChanges[mergedChanges.length - 1] = new DetailedLineRangeMapping(
					lastChange.original.join(thisChange.original),
					lastChange.modified.join(thisChange.modified),
					(lastChange.innerChanges ?? []).concat(thisChange.innerChanges ?? [])
				);
			} else {
				mergedChanges.push(thisChange);
			}
		}

		return mergedChanges.map(change => new Hunk(change.original, change.modified, change.innerChanges ?? []));
	}


	protected _updateSummaryMessage(hunkCount: number) {
		let message: string;
		if (hunkCount === 0) {
			message = localize('change.0', "Nothing changed");
		} else if (hunkCount === 1) {
			message = localize('change.1', "1 change");
		} else {
			message = localize('lines.NM', "{0} changes", hunkCount);
		}
		this._zone.widget.updateStatus(message);
	}

	hasFocus(): boolean {
		return this._zone.widget.hasFocus();
	}

	override getWholeRangeDecoration(): IModelDeltaDecoration[] {
		// don't render the blue in live mode
		return [];
	}
}


async function undoModelUntil(model: ITextModel, targetAltVersion: number): Promise<void> {
	while (targetAltVersion < model.getAlternativeVersionId() && model.canUndo()) {
		await model.undo();
	}
}


function asRange(lineRange: LineRange, model: ITextModel): Range {
	return lineRange.isEmpty
		? new Range(lineRange.startLineNumber, 1, lineRange.startLineNumber, model.getLineLength(lineRange.startLineNumber))
		: new Range(lineRange.startLineNumber, 1, lineRange.endLineNumberExclusive - 1, model.getLineLength(lineRange.endLineNumberExclusive - 1));
}


function changeDecorationsAndViewZones(editor: ICodeEditor, callback: (accessor: IModelDecorationsChangeAccessor, viewZoneAccessor: IViewZoneChangeAccessor) => void): void {
	editor.changeDecorations(decorationsAccessor => {
		editor.changeViewZones(viewZoneAccessor => {
			callback(decorationsAccessor, viewZoneAccessor);
		});
	});
}
