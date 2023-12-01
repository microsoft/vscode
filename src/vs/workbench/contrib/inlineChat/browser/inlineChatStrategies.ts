/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableWindowInterval } from 'vs/base/browser/dom';
import { $window } from 'vs/base/browser/window';
import { IAction, toAction } from 'vs/base/common/actions';
import { equals, tail } from 'vs/base/common/arrays';
import { AsyncIterableObject, AsyncIterableSource } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Codicon } from 'vs/base/common/codicons';
import { Emitter, Event } from 'vs/base/common/event';
import { Lazy } from 'vs/base/common/lazy';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { ICodeEditor, IViewZone } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { StableEditorScrollState } from 'vs/editor/browser/stableEditorScroll';
import { LineSource, RenderOptions, renderLines } from 'vs/editor/browser/widget/diffEditor/renderLines';
import { EditOperation, ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IDocumentDiff } from 'vs/editor/common/diff/documentDiffProvider';
import { DetailedLineRangeMapping, LineRangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { TextEdit } from 'vs/editor/common/languages';
import { ICursorStateComputer, IIdentifiedSingleEditOperation, IModelDecorationOptions, IModelDeltaDecoration, ITextModel, IValidEditOperation, TrackedRangeStickiness } from 'vs/editor/common/model';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { InlineDecoration, InlineDecorationType } from 'vs/editor/common/viewModel';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { SaveReason } from 'vs/workbench/common/editor';
import { countWords, getNWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { InlineChatFileCreatePreviewWidget, InlineChatLivePreviewWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatLivePreviewWidget';
import { ReplyResponse, Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { InlineChatZoneWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { CTX_INLINE_CHAT_CHANGE_HAS_DIFF, CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF, CTX_INLINE_CHAT_DOCUMENT_CHANGED } from 'vs/workbench/contrib/inlineChat/common/inlineChat';

export abstract class EditModeStrategy {

	protected readonly _onDidAccept = new Emitter<void>();
	protected readonly _onDidDiscard = new Emitter<void>();

	readonly onDidAccept: Event<void> = this._onDidAccept.event;
	readonly onDidDiscard: Event<void> = this._onDidDiscard.event;

	toggleDiff?: () => any;

	constructor(protected readonly _zone: InlineChatZoneWidget) { }

	dispose(): void {
		this._onDidAccept.dispose();
		this._onDidDiscard.dispose();
	}

	abstract start(): Promise<void>;

	abstract apply(): Promise<void>;

	abstract cancel(): Promise<void>;

	abstract makeProgressiveChanges(edits: ISingleEditOperation[], timings: ProgressingEditsOptions): Promise<void>;

	abstract makeChanges(edits: ISingleEditOperation[]): Promise<void>;

	abstract undoChanges(altVersionId: number): Promise<void>;

	abstract renderChanges(response: ReplyResponse): Promise<Position | undefined>;

	abstract hasFocus(): boolean;

	abstract needsMargin(): boolean;
}

export class PreviewStrategy extends EditModeStrategy {

	private readonly _ctxDocumentChanged: IContextKey<boolean>;
	private readonly _listener: IDisposable;

	constructor(
		private readonly _session: Session,
		zone: InlineChatZoneWidget,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(zone);

		this._ctxDocumentChanged = CTX_INLINE_CHAT_DOCUMENT_CHANGED.bindTo(contextKeyService);
		this._listener = Event.debounce(_session.textModelN.onDidChangeContent.bind(_session.textModelN), () => { }, 350)(_ => {
			if (!_session.textModelN.isDisposed() && !_session.textModel0.isDisposed()) {
				this._ctxDocumentChanged.set(_session.hasChangedText);
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

	override async makeChanges(_edits: ISingleEditOperation[]): Promise<void> {
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

	needsMargin(): boolean {
		return true;
	}
}


class InlineDiffDecorations {

	private readonly _collection: IEditorDecorationsCollection;

	private _data: { tracking: IModelDeltaDecoration; decorating: IModelDecorationOptions }[] = [];
	private _visible: boolean = false;

	constructor(editor: ICodeEditor, visible: boolean = false) {
		this._collection = editor.createDecorationsCollection();
		this._visible = visible;
	}

	get visible() {
		return this._visible;
	}

	set visible(value: boolean) {
		this._visible = value;
		this.update();
	}

	clear() {
		this._collection.clear();
		this._data.length = 0;
	}

	collectEditOperation(op: IValidEditOperation) {
		this._data.push(InlineDiffDecorations._asDecorationData(op));
	}

	update() {
		this._collection.set(this._data.map(d => {
			const res = { ...d.tracking };
			if (this._visible) {
				res.options = { ...res.options, ...d.decorating };
			}
			return res;
		}));
	}

	private static _asDecorationData(edit: IValidEditOperation): { tracking: IModelDeltaDecoration; decorating: IModelDecorationOptions } {
		let content = edit.text;
		if (content.length > 12) {
			content = content.substring(0, 12) + '…';
		}
		const tracking: IModelDeltaDecoration = {
			range: edit.range,
			options: {
				description: 'inline-chat-inline-diff',
			}
		};

		const decorating: IModelDecorationOptions = {
			description: 'inline-chat-inline-diff',
			className: !edit.range.isEmpty() ? 'inline-chat-lines-inserted-range' : undefined,
			showIfCollapsed: true,
			before: {
				content,
				inlineClassName: 'inline-chat-lines-deleted-range-inline',
				attachedData: edit,
			}
		};

		return { tracking, decorating };
	}
}

export interface ProgressingEditsOptions {
	duration: number;
	token: CancellationToken;
}

export class LiveStrategy extends EditModeStrategy {

	protected _diffEnabled: boolean = false;

	private readonly _inlineDiffDecorations: InlineDiffDecorations;
	private readonly _store: DisposableStore = new DisposableStore();

	private _editCount: number = 0;

	constructor(
		protected readonly _session: Session,
		protected readonly _editor: ICodeEditor,
		zone: InlineChatZoneWidget,
		@IConfigurationService configService: IConfigurationService,
		@IStorageService protected _storageService: IStorageService,
		@IBulkEditService protected readonly _bulkEditService: IBulkEditService,
		@IEditorWorkerService protected readonly _editorWorkerService: IEditorWorkerService,
		@IInstantiationService protected readonly _instaService: IInstantiationService,
	) {
		super(zone);
		this._diffEnabled = configService.getValue<boolean>('inlineChat.showDiff');

		this._inlineDiffDecorations = new InlineDiffDecorations(this._editor, this._diffEnabled);
		this._inlineDiffDecorations.visible = this._diffEnabled;

		this._store.add(configService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('inlineChat.showDiff')) {
				this._diffEnabled = !this._diffEnabled;
				this._doToggleDiff();
			}
		}));
	}

	override dispose(): void {
		super.dispose();
		this._inlineDiffDecorations.clear();
		this._store.dispose();
	}

	protected _doToggleDiff(): void {
		this._inlineDiffDecorations.visible = this._diffEnabled;
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
		LiveStrategy._undoModelUntil(modelN, targetAltVersion);
	}

	override async makeChanges(edits: ISingleEditOperation[]): Promise<void> {
		const cursorStateComputerAndInlineDiffCollection: ICursorStateComputer = (undoEdits) => {
			let last: Position | null = null;
			for (const edit of undoEdits) {
				last = !last || last.isBefore(edit.range.getEndPosition()) ? edit.range.getEndPosition() : last;
				this._inlineDiffDecorations.collectEditOperation(edit);
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
		LiveStrategy._undoModelUntil(textModelN, altVersionId);
	}

	override async makeProgressiveChanges(edits: ISingleEditOperation[], opts: ProgressingEditsOptions): Promise<void> {

		// push undo stop before first edit
		if (++this._editCount === 1) {
			this._editor.pushUndoStop();
		}

		const durationInSec = opts.duration / 1000;
		for (const edit of edits) {
			const wordCount = countWords(edit.text ?? '');
			const speed = wordCount / durationInSec;
			// console.log({ durationInSec, wordCount, speed: wordCount / durationInSec });
			await performAsyncTextEdit(this._session.textModelN, asProgressiveEdit(edit, speed, opts.token));
		}
	}

	override async renderChanges(response: ReplyResponse): Promise<undefined> {
		const diff = await this._editorWorkerService.computeDiff(this._session.textModel0.uri, this._session.textModelN.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: 5000, computeMoves: false }, 'advanced');
		this._updateSummaryMessage(diff?.changes ?? []);
		this._inlineDiffDecorations.update();

		if (response.untitledTextModel) {
			this._zone.widget.showCreatePreview(response.untitledTextModel);
		} else {
			this._zone.widget.hideCreatePreview();
		}
	}

	private static _undoModelUntil(model: ITextModel, targetAltVersion: number): void {
		while (targetAltVersion < model.getAlternativeVersionId() && model.canUndo()) {
			model.undo();
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

	override needsMargin(): boolean {
		return true;
	}

	hasFocus(): boolean {
		return this._zone.widget.hasFocus();
	}
}

export class LivePreviewStrategy extends LiveStrategy {

	private readonly _previewZone: Lazy<InlineChatFileCreatePreviewWidget>;
	private readonly _diffZonePool: InlineChatLivePreviewWidget[] = [];
	private _currentLineRangeGroups: LineRangeMapping[][] = [];

	constructor(
		session: Session,
		editor: ICodeEditor,
		zone: InlineChatZoneWidget,
		@IConfigurationService configService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IBulkEditService bulkEditService: IBulkEditService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		super(session, editor, zone, configService, storageService, bulkEditService, editorWorkerService, instaService);

		this._previewZone = new Lazy(() => instaService.createInstance(InlineChatFileCreatePreviewWidget, editor));
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

	override async makeProgressiveChanges(edits: ISingleEditOperation[], opts: ProgressingEditsOptions): Promise<void> {

		const changeTask = super.makeProgressiveChanges(edits, opts);

		//add a listener that shows the diff zones as soon as the first edit is applied
		let renderTask = Promise.resolve();
		const changeListener = this._session.textModelN.onDidChangeContent(() => {
			changeListener.dispose();
			renderTask = this._updateDiffZones();
		});
		await changeTask;
		await renderTask;
		changeListener.dispose();
	}

	override async undoChanges(altVersionId: number): Promise<void> {
		await super.undoChanges(altVersionId);
		await this._updateDiffZones();
	}

	override async renderChanges(response: ReplyResponse): Promise<undefined> {

		await this._updateDiffZones();

		if (response.untitledTextModel && !response.untitledTextModel.isDisposed()) {
			this._previewZone.value.showCreation(this._session.wholeRange.value.getStartPosition().delta(-1), response.untitledTextModel);
		} else {
			this._previewZone.value.hide();
		}
	}

	override hasFocus(): boolean {
		return super.hasFocus() || Boolean(this._previewZone.rawValue?.hasFocus()) || this._diffZonePool.some(zone => zone.isVisible && zone.hasFocus());
	}
}

export interface AsyncTextEdit {
	readonly range: IRange;
	readonly newText: AsyncIterable<string>;
}

export async function performAsyncTextEdit(model: ITextModel, edit: AsyncTextEdit) {

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

		model.pushEditOperations(null, [edit], () => null);
		first = false;
	}
}

export function asAsyncEdit(edit: IIdentifiedSingleEditOperation): AsyncTextEdit {
	return {
		range: edit.range,
		newText: AsyncIterableObject.fromArray([edit.text ?? ''])
	} satisfies AsyncTextEdit;
}

export function asProgressiveEdit(edit: IIdentifiedSingleEditOperation, wordsPerSec: number, token: CancellationToken): AsyncTextEdit {

	wordsPerSec = Math.max(10, wordsPerSec);

	const stream = new AsyncIterableSource<string>();
	let newText = edit.text ?? '';
	// const wordCount = countWords(newText);

	const handle = disposableWindowInterval($window, () => {

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

export class LiveStrategy3 extends EditModeStrategy {

	private readonly _store: DisposableStore = new DisposableStore();
	private readonly _sessionStore: DisposableStore = new DisposableStore();
	private readonly _previewZone: Lazy<InlineChatFileCreatePreviewWidget>;

	private readonly _ctxCurrentChangeHasDiff: IContextKey<boolean>;
	private readonly _ctxCurrentChangeShowsDiff: IContextKey<boolean>;

	private readonly _modifiedRangesDecorations: IEditorDecorationsCollection;
	private readonly _modifiedRangesThatHaveBeenInteractedWith: string[] = [];

	private _editCount: number = 0;

	constructor(
		protected readonly _session: Session,
		protected readonly _editor: ICodeEditor,
		zone: InlineChatZoneWidget,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService protected _storageService: IStorageService,
		@IBulkEditService protected readonly _bulkEditService: IBulkEditService,
		@IEditorWorkerService protected readonly _editorWorkerService: IEditorWorkerService,
		@IInstantiationService protected readonly _instaService: IInstantiationService,
	) {
		super(zone);
		this._ctxCurrentChangeHasDiff = CTX_INLINE_CHAT_CHANGE_HAS_DIFF.bindTo(contextKeyService);
		this._ctxCurrentChangeShowsDiff = CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF.bindTo(contextKeyService);

		this._modifiedRangesDecorations = this._editor.createDecorationsCollection();
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
		this._sessionStore.clear();
		this._modifiedRangesDecorations.clear();
		this._modifiedRangesThatHaveBeenInteractedWith.length = 0;
		this._zone.widget.updateStatus('');
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
		LiveStrategy3._undoModelUntil(modelN, targetAltVersion);
	}

	override async makeChanges(edits: ISingleEditOperation[]): Promise<void> {
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
		this._sessionStore.clear();
		this._modifiedRangesDecorations.clear();
		this._modifiedRangesThatHaveBeenInteractedWith.length = 0;

		const { textModelN } = this._session;
		LiveStrategy3._undoModelUntil(textModelN, altVersionId);
	}

	override async makeProgressiveChanges(edits: ISingleEditOperation[], opts: ProgressingEditsOptions): Promise<void> {

		// push undo stop before first edit
		if (++this._editCount === 1) {
			this._editor.pushUndoStop();
		}

		const listener = this._session.textModelN.onDidChangeContent(async () => {
			await this._showDiff(false, false);
		});

		try {
			const durationInSec = opts.duration / 1000;
			for (const edit of edits) {
				const wordCount = countWords(edit.text ?? '');
				const speed = wordCount / durationInSec;
				// console.log({ durationInSec, wordCount, speed: wordCount / durationInSec });
				await performAsyncTextEdit(this._session.textModelN, asProgressiveEdit(edit, speed, opts.token));
			}
		} finally {
			listener.dispose();
		}
	}

	private async _computeDiff(): Promise<IDocumentDiff> {
		const diff = await this._editorWorkerService.computeDiff(this._session.textModel0.uri, this._session.textModelN.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER, computeMoves: false }, 'advanced');

		if (!diff || diff.changes.length === 0) {
			return { identical: false, quitEarly: false, changes: [], moves: [] };
		}

		// merge changes neighboring changes
		const mergedChanges = [diff.changes[0]];
		for (let i = 1; i < diff.changes.length; i++) {
			const lastChange = mergedChanges[mergedChanges.length - 1];
			const thisChange = diff.changes[i];
			if (thisChange.modified.startLineNumber - lastChange.modified.endLineNumberExclusive <= 5) {
				mergedChanges[mergedChanges.length - 1] = new DetailedLineRangeMapping(
					lastChange.original.join(thisChange.original),
					lastChange.modified.join(thisChange.modified),
					(lastChange.innerChanges ?? []).concat(thisChange.innerChanges ?? [])
				);
			} else {
				mergedChanges.push(thisChange);
			}
		}

		return {
			identical: diff.identical,
			quitEarly: diff.quitEarly,
			changes: mergedChanges,
			moves: []
		};
	}


	private readonly _decoModifiedInteractedWith = ModelDecorationOptions.register({ description: 'inline-chat-modified-interacted-with', stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges });

	private async _showDiff(isFinalChanges: boolean, isAfterManualInteraction: boolean): Promise<Position | undefined> {

		const diff = await this._computeDiff();

		this._sessionStore.clear();

		if (diff.identical || diff.changes.length === 0) {

			if (isAfterManualInteraction) {
				this._sessionStore.clear();
				this._onDidDiscard.fire();
			}
			return undefined;
		}

		const viewZoneIds = new Set<string>();
		const newDecorations: IModelDeltaDecoration[] = [];
		const mightContainNonBasicASCII = this._session.textModel0.mightContainNonBasicASCII() ?? false;
		const mightContainRTL = this._session.textModel0.mightContainRTL() ?? false;
		const renderOptions = RenderOptions.fromEditor(this._editor);

		let widgetData: { distance: number; position: Position; actions: IAction[]; index: number; toggleDiff?: () => any } | undefined;

		for (let i = 0; i < diff.changes.length; i++) {
			const { original, modified, innerChanges } = diff.changes[i];

			const modifiedRange: Range = modified.isEmpty
				? new Range(modified.startLineNumber, 1, modified.startLineNumber, this._session.textModelN.getLineLength(modified.startLineNumber))
				: new Range(modified.startLineNumber, 1, modified.endLineNumberExclusive - 1, this._session.textModelN.getLineLength(modified.endLineNumberExclusive - 1));

			const hasBeenInteractedWith = this._modifiedRangesThatHaveBeenInteractedWith.some(id => {
				const range = this._session.textModelN.getDecorationRange(id);
				return range && Range.areIntersecting(range, modifiedRange);
			});

			if (hasBeenInteractedWith) {
				continue;
			}

			if (innerChanges) {
				for (const { modifiedRange } of innerChanges) {
					newDecorations.push({
						range: modifiedRange,
						options: {
							description: 'inline-modified',
							className: 'inline-chat-inserted-range',
						}
					});
					newDecorations.push({
						range: modifiedRange,
						options: {
							description: 'inline-modified',
							className: 'inline-chat-inserted-range-linehighlight',
							isWholeLine: true
						}
					});
				}
			}

			// original view zone
			const source = new LineSource(
				original.mapToLineArray(l => this._session.textModel0.tokenization.getLineTokens(l)),
				[],
				mightContainNonBasicASCII,
				mightContainRTL,
			);

			const domNode = document.createElement('div');
			domNode.className = 'inline-chat-original-zone2';
			const result = renderLines(source, renderOptions, [new InlineDecoration(new Range(original.startLineNumber, 1, original.startLineNumber, 1), '', InlineDecorationType.Regular)], domNode);

			let myViewZoneId: string = '';
			const myViewZone: IViewZone = {
				afterLineNumber: modifiedRange.startLineNumber - 1,
				heightInLines: result.heightInLines,
				domNode,
			};

			if (isFinalChanges) {

				const [id] = this._modifiedRangesDecorations.append([{ range: modifiedRange, options: this._decoModifiedInteractedWith }]);

				const actions = [
					toAction({
						id: 'accept',
						label: localize('accept', "Accept"),
						class: ThemeIcon.asClassName(Codicon.check),
						run: () => {
							this._modifiedRangesThatHaveBeenInteractedWith.push(id);
							return this._showDiff(true, true);
						}
					}),
					toAction({
						id: 'discard',
						label: localize('discard', "Discard"),
						class: ThemeIcon.asClassName(Codicon.discard),
						run: () => {
							const edits: ISingleEditOperation[] = [];
							for (const innerChange of innerChanges!) {
								const originalValue = this._session.textModel0.getValueInRange(innerChange.originalRange);
								edits.push(EditOperation.replace(innerChange.modifiedRange, originalValue));
							}
							this._session.textModelN.pushEditOperations(null, edits, () => null);
							return this._showDiff(true, true);
						}
					}),
				];
				const toggleDiff = !original.isEmpty
					? () => {
						const scrollState = StableEditorScrollState.capture(this._editor);
						if (!viewZoneIds.has(myViewZoneId)) {
							this._editor.changeViewZones(accessor => {
								myViewZoneId = accessor.addZone(myViewZone);
								viewZoneIds.add(myViewZoneId);
							});
							this._ctxCurrentChangeShowsDiff.set(true);
						} else {
							this._editor.changeViewZones(accessor => {
								accessor.removeZone(myViewZoneId);
								viewZoneIds.delete(myViewZoneId);
							});
							this._ctxCurrentChangeShowsDiff.set(false);
						}
						scrollState.restore(this._editor);
					}
					: undefined;

				const zoneLineNumber = this._zone.position!.lineNumber;
				const myDistance = zoneLineNumber <= modifiedRange.startLineNumber
					? modifiedRange.startLineNumber - zoneLineNumber
					: zoneLineNumber - modifiedRange.endLineNumber;

				if (!widgetData || widgetData.distance > myDistance) {
					widgetData = { distance: myDistance, position: modifiedRange.getStartPosition().delta(-1), index: i, actions, toggleDiff };
				}
			}
		}

		if (widgetData) {
			this._zone.widget.setExtraButtons(widgetData.actions);
			this._zone.updatePositionAndHeight(widgetData.position);
			this._editor.revealPositionInCenterIfOutsideViewport(widgetData.position);

			this._updateSummaryMessage(diff.changes, widgetData.index);

			this._ctxCurrentChangeHasDiff.set(Boolean(widgetData.toggleDiff));
			this.toggleDiff = widgetData.toggleDiff;
		}

		const decorations = this._editor.createDecorationsCollection(newDecorations);

		this._sessionStore.add(toDisposable(() => {
			decorations.clear();
			this._editor.changeViewZones(accessor => viewZoneIds.forEach(accessor.removeZone, accessor));
			viewZoneIds.clear();
			this._zone.widget.setExtraButtons([]);
		}));

		if (isAfterManualInteraction && newDecorations.length === 0) {
			this._sessionStore.clear();
			this._onDidAccept.fire();
		}

		return widgetData?.position;
	}

	override async renderChanges(response: ReplyResponse) {

		if (response.untitledTextModel && !response.untitledTextModel.isDisposed()) {
			this._previewZone.value.showCreation(this._session.wholeRange.value.getStartPosition().delta(-1), response.untitledTextModel);
		} else {
			this._previewZone.value.hide();
		}

		return await this._showDiff(true, false);
	}

	private static _undoModelUntil(model: ITextModel, targetAltVersion: number): void {
		while (targetAltVersion < model.getAlternativeVersionId() && model.canUndo()) {
			model.undo();
		}
	}

	protected _updateSummaryMessage(mappings: readonly LineRangeMapping[], index: number) {
		const changesCount = mappings.length;
		let message: string;
		if (changesCount === 0) {
			message = localize('change.0', "Nothing changed");
		} else if (changesCount === 1) {
			message = localize('change.1', "1 change");
		} else {
			// message = localize('lines.NM', "{0} of {1} changes", index + 1, changesCount);
			message = localize('lines.NM', "{1} changes", index + 1, changesCount);
		}
		this._zone.widget.updateStatus(message);
	}

	override needsMargin(): boolean {
		return true;
	}

	hasFocus(): boolean {
		return this._zone.widget.hasFocus();
	}
}
