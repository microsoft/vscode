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
import { Event } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { Lazy } from 'vs/base/common/lazy';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { ThemeIcon } from 'vs/base/common/themables';
import { Mutable } from 'vs/base/common/types';
import { ICodeEditor, IOverlayWidget } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { EditOperation, ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { LineRangeMapping } from 'vs/editor/common/diff/rangeMapping';
import { IEditorDecorationsCollection } from 'vs/editor/common/editorCommon';
import { TextEdit } from 'vs/editor/common/languages';
import { ICursorStateComputer, IIdentifiedSingleEditOperation, IModelDecorationOptions, IModelDeltaDecoration, ITextModel, IValidEditOperation, InjectedTextCursorStops, InjectedTextOptions, TrackedRangeStickiness } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { localize } from 'vs/nls';
import { WorkbenchButtonBar } from 'vs/platform/actions/browser/buttonbar';
import { WorkbenchToolBar } from 'vs/platform/actions/browser/toolbar';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { SaveReason } from 'vs/workbench/common/editor';
import { countWords, getNWords } from 'vs/workbench/contrib/chat/common/chatWordCounter';
import { InlineChatFileCreatePreviewWidget, InlineChatLivePreviewWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatLivePreviewWidget';
import { ReplyResponse, Session } from 'vs/workbench/contrib/inlineChat/browser/inlineChatSession';
import { InlineChatWidget } from 'vs/workbench/contrib/inlineChat/browser/inlineChatWidget';
import { CTX_INLINE_CHAT_DOCUMENT_CHANGED } from 'vs/workbench/contrib/inlineChat/common/inlineChat';

export abstract class EditModeStrategy {

	abstract dispose(): void;

	abstract apply(): Promise<void>;

	abstract cancel(): Promise<void>;

	abstract makeProgressiveChanges(edits: ISingleEditOperation[], timings: ProgressingEditsOptions): Promise<void>;

	abstract makeChanges(edits: ISingleEditOperation[]): Promise<void>;

	abstract undoChanges(altVersionId: number): Promise<void>;

	abstract renderChanges(response: ReplyResponse): Promise<void>;

	abstract hasFocus(): boolean;

	abstract needsMargin(): boolean;
}

export class PreviewStrategy extends EditModeStrategy {

	private readonly _ctxDocumentChanged: IContextKey<boolean>;
	private readonly _listener: IDisposable;

	constructor(
		private readonly _session: Session,
		private readonly _widget: InlineChatWidget,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

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

	override async renderChanges(response: ReplyResponse): Promise<void> {
		if (response.allLocalEdits.length > 0) {
			const allEditOperation = response.allLocalEdits.map(edits => edits.map(TextEdit.asEditOperation));
			await this._widget.showEditsPreview(this._session.textModel0, this._session.textModelN, allEditOperation);
		} else {
			this._widget.hideEditsPreview();
		}

		if (response.untitledTextModel) {
			this._widget.showCreatePreview(response.untitledTextModel);
		} else {
			this._widget.hideCreatePreview();
		}
	}

	hasFocus(): boolean {
		return this._widget.hasFocus();
	}

	needsMargin(): boolean {
		return true;
	}
}

export class LiveStrategy2 extends EditModeStrategy {

	private readonly _store: DisposableStore = new DisposableStore();

	private _cleanUpDiff: Function = () => { };
	private _editCount: number = 0;

	constructor(
		protected readonly _session: Session,
		protected readonly _editor: ICodeEditor,
		protected readonly _widget: InlineChatWidget,
		@IStorageService protected _storageService: IStorageService,
		@IBulkEditService protected readonly _bulkEditService: IBulkEditService,
		@IEditorWorkerService protected readonly _editorWorkerService: IEditorWorkerService,
		@IInstantiationService protected readonly _instaService: IInstantiationService,
	) {
		super();
	}

	override dispose(): void {
		this._store.dispose();
	}

	async apply() {
		this._cleanUpDiff();
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
		this._cleanUpDiff();
		const { textModelN: modelN, textModelNAltVersion, textModelNSnapshotAltVersion } = this._session;
		if (modelN.isDisposed()) {
			return;
		}
		const targetAltVersion = textModelNSnapshotAltVersion ?? textModelNAltVersion;
		LiveStrategy2._undoModelUntil(modelN, targetAltVersion);
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
		const { textModelN } = this._session;
		LiveStrategy2._undoModelUntil(textModelN, altVersionId);
	}

	override async makeProgressiveChanges(edits: ISingleEditOperation[], opts: ProgressingEditsOptions): Promise<void> {

		// push undo stop before first edit
		if (++this._editCount === 1) {
			this._editor.pushUndoStop();
		}

		const listener = this._session.textModelN.onDidChangeContent(async () => {
			await this._renderDiffInfo();
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

	override async renderChanges(response: ReplyResponse) {

		if (response.untitledTextModel) {
			this._widget.showCreatePreview(response.untitledTextModel);
		} else {
			this._widget.hideCreatePreview();
		}

		this._renderDiffInfo();
	}


	private async _renderDiffInfo(): Promise<void> {

		this._cleanUpDiff();

		const diff = await this._editorWorkerService.computeDiff(this._session.textModel0.uri, this._session.textModelN.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: 5000, computeMoves: false }, 'advanced');
		if (!diff?.changes) {
			return;
		}

		const summary = this._updateSummaryMessage(diff.changes);

		if (diff.identical) {
			return;
		}
		const storageKey = 'inlineChat.showDiffInfo';
		const showDiffInfo = this._storageService.getBoolean(storageKey, StorageScope.PROFILE, true);

		const store = new DisposableStore();
		const decorations = this._editor.createDecorationsCollection();
		const zoneIds: string[] = [];
		const overlays: IOverlayWidget[] = [];

		const { textModel0, textModelN } = this._session;

		const newDecorations: IModelDeltaDecoration[] = [];
		const originalLineOptions: InjectedTextOptions[] = [];
		let originalLineMaxLen = 0;


		for (const { original, modified } of diff.changes) {

			if (original.isEmpty) {
				// nothing special for insert only
				continue;
			}

			const originalRange = new Range(original.startLineNumber, 1, original.endLineNumberExclusive, 1);
			const originalValue = textModel0.getValueInRange(originalRange);
			const modifiedRange = new Range(modified.startLineNumber, 1, modified.endLineNumberExclusive, 1);

			const hoverMessage = new MarkdownString();
			hoverMessage.appendText(summary);
			hoverMessage.appendCodeblock(textModel0.getLanguageId(), originalValue);
			hoverMessage.appendText(localize('m', "Before/After ↓"));
			hoverMessage.appendCodeblock(textModelN.getLanguageId(), textModelN.getValueInRange(modifiedRange));

			newDecorations.push({
				range: modifiedRange,
				options: {
					description: 'inline-chat-hover',
					isWholeLine: true,
					hoverMessage
				}
			});

			// highlight modified lines


			if (showDiffInfo) {

				let originalLine = original.startLineNumber;

				modified.forEach(line => {
					newDecorations.push({
						range: new Range(line, 1, line, Number.MIN_SAFE_INTEGER),
						options: {
							stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
							description: 'inline-chat-line-decoration',
							isWholeLine: true,
							showIfCollapsed: true,
							blockClassName: 'inline-chat-line-modified',
						}
					});

					// render original line as inline decoration

					const isChangedLine = original.contains(originalLine);
					const content = isChangedLine
						? textModel0.getLineContent(originalLine).replaceAll('\t', '\u00A0'.repeat(textModel0.getOptions().tabSize))
						: '\u00A0'; // inserted lines (just whitespace)
					originalLineMaxLen = Math.max(originalLineMaxLen, content.length);

					const before: InjectedTextOptions = {
						content,
						inlineClassNameAffectsLetterSpacing: true,
						// inlineClassName: `inline-chat-line-original ${isChangedLine ? '' : 'diagonal-fill'}`,
						inlineClassName: `inline-chat-line-original`,
						cursorStops: InjectedTextCursorStops.Right,
					};

					originalLineOptions.push(before);

					newDecorations.push({
						range: new Range(line, 1, line, 1),
						options: {
							description: 'inline-chat-line-decoration',
							stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
							showIfCollapsed: true,
							before
						}
					});

					originalLine++;
				});

				for (let i = originalLine; i < original.endLineNumberExclusive; i++) {
					originalLineMaxLen = Math.max(originalLineMaxLen, textModel0.getLineLength(i));
				}

				const maxLen = Math.min(originalLineMaxLen, this._editor.getLayoutInfo().width * .5 / this._editor.getOption(EditorOption.fontInfo).typicalFullwidthCharacterWidth);
				const maxLenAdjusted = (s: string) => {
					if (s.length > maxLen) {
						s = s.slice(0, maxLen - 1) + '\u2026';
					} else {
						s += '\u00A0'.repeat(maxLen - s.length);
					}
					return s;
				};

				for (const before of originalLineOptions) {
					(before as any as Mutable<InjectedTextOptions>).content = maxLenAdjusted(before.content);
				}

				// check original lines that havn't been seen yet
				const linesNodes: HTMLElement[] = [];
				for (let i = 0; originalLine < original.endLineNumberExclusive; originalLine++, i++) {
					const line = maxLenAdjusted(textModel0.getLineContent(originalLine).replaceAll('\t', '\u00A0'.repeat(textModel0.getOptions().tabSize)));
					const lineElement = document.createElement('div');
					lineElement.classList.add('line');
					lineElement.textContent = line;
					linesNodes.push(lineElement);
				}
				if (linesNodes.length > 0) {
					this._editor.changeViewZones(accessor => {

						const domNode = document.createElement('span');
						domNode.append(...linesNodes);
						domNode.classList.add('inline-chat-original-zone');
						// domNode.classList.add('diagonal-fill');

						this._editor.applyFontInfo(domNode);
						zoneIds.push(accessor.addZone({
							domNode,
							afterLineNumber: modified.endLineNumberExclusive - 1,
							heightInLines: linesNodes.length,
							showInHiddenAreas: true,
							suppressMouseDown: true
						}));
					});
				}
			}
		}
		decorations.set(newDecorations);

		// inline toolbar
		const overlayWidget = document.createElement('div');
		overlayWidget.classList.add('inline-chat-toolbar');
		const widget: IOverlayWidget = {
			getId: () => `inline-chat-toolbar}`,
			getDomNode: () => overlayWidget,
			getPosition: () => null
		};
		overlays.push(widget);
		this._editor.addOverlayWidget(widget);
		const layoutOverlay = () => {
			overlayWidget.style.top = `${this._editor.getTopForLineNumber(this._session.wholeRange.value.startLineNumber) - this._editor.getScrollTop() + 4}px`;
			overlayWidget.style.right = `${this._editor.getLayoutInfo().minimap.minimapWidth + this._editor.getLayoutInfo().verticalScrollbarWidth + 4}px`;
		};
		layoutOverlay();
		this._editor.onDidScrollChange(layoutOverlay, null, store);

		const actions = [
			// toAction({ id: 'accept', label: 'Accept', class: ThemeIcon.asClassName(Codicon.check), run: () => { } }),
			// toAction({
			// 	id: 'discard',
			// 	label: 'Discard',
			// 	class: ThemeIcon.asClassName(Codicon.discard),
			// 	run: () => {
			// 		const edit = EditOperation.replace(modifiedRange, originalValue);
			// 		textModelN.pushEditOperations([], [edit], () => []);
			// 	}
			// }),
			toAction({
				id: 'diff',
				label: 'Toggle Diff',
				checked: showDiffInfo,
				class: ThemeIcon.asClassName(Codicon.diff),
				run: () => {
					this._storageService.store(storageKey, !showDiffInfo, StorageScope.PROFILE, StorageTarget.USER);
					this._renderDiffInfo();
				}
			}),
		];


		const toolbar = store.add(this._instaService.createInstance(WorkbenchToolBar, overlayWidget, { telemetrySource: 'inline-diff-toolbar' }));
		toolbar.setActions(actions);

		this._cleanUpDiff = () => {
			decorations.clear();
			this._editor.changeViewZones(accessor => zoneIds.forEach(id => accessor.removeZone(id)));
			overlays.forEach(widget => this._editor.removeOverlayWidget(widget));
			store.dispose();
		};
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
		this._widget.updateStatus(message);
		return message;
	}

	override needsMargin(): boolean {
		return true;
	}

	hasFocus(): boolean {
		return this._widget.hasFocus();
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
		protected readonly _widget: InlineChatWidget,
		@IConfigurationService configService: IConfigurationService,
		@IStorageService protected _storageService: IStorageService,
		@IBulkEditService protected readonly _bulkEditService: IBulkEditService,
		@IEditorWorkerService protected readonly _editorWorkerService: IEditorWorkerService,
		@IInstantiationService protected readonly _instaService: IInstantiationService,
	) {
		super();
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
		this._inlineDiffDecorations.clear();
		this._store.dispose();
	}

	protected _doToggleDiff(): void {
		this._inlineDiffDecorations.visible = this._diffEnabled;
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

	override async renderChanges(response: ReplyResponse) {
		const diff = await this._editorWorkerService.computeDiff(this._session.textModel0.uri, this._session.textModelN.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: 5000, computeMoves: false }, 'advanced');
		this._updateSummaryMessage(diff?.changes ?? []);
		this._inlineDiffDecorations.update();

		if (response.untitledTextModel) {
			this._widget.showCreatePreview(response.untitledTextModel);
		} else {
			this._widget.hideCreatePreview();
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
		this._widget.updateStatus(message);
	}

	override needsMargin(): boolean {
		return true;
	}

	hasFocus(): boolean {
		return this._widget.hasFocus();
	}
}

export class LivePreviewStrategy extends LiveStrategy {

	private readonly _previewZone: Lazy<InlineChatFileCreatePreviewWidget>;
	private readonly _diffZonePool: InlineChatLivePreviewWidget[] = [];
	private _currentLineRangeGroups: LineRangeMapping[][] = [];

	constructor(
		session: Session,
		editor: ICodeEditor,
		widget: InlineChatWidget,
		@IConfigurationService configService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IBulkEditService bulkEditService: IBulkEditService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService,
		@IInstantiationService instaService: IInstantiationService,
	) {
		super(session, editor, widget, configService, storageService, bulkEditService, editorWorkerService, instaService);

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

	override async renderChanges(response: ReplyResponse) {

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

	private readonly _inlineDiffDecorations: IEditorDecorationsCollection;
	private readonly _store: DisposableStore = new DisposableStore();
	private readonly _sessionStore: DisposableStore = new DisposableStore();

	private _editCount: number = 0;

	constructor(
		protected readonly _session: Session,
		protected readonly _editor: ICodeEditor,
		protected readonly _widget: InlineChatWidget,
		@IConfigurationService configService: IConfigurationService,
		@IStorageService protected _storageService: IStorageService,
		@IBulkEditService protected readonly _bulkEditService: IBulkEditService,
		@IEditorWorkerService protected readonly _editorWorkerService: IEditorWorkerService,
		@IInstantiationService protected readonly _instaService: IInstantiationService,
	) {
		super();

		this._inlineDiffDecorations = this._editor.createDecorationsCollection();
	}

	override dispose(): void {
		this._inlineDiffDecorations.clear();
		this._store.dispose();
	}


	async apply() {
		this._sessionStore.clear();
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
		this._sessionStore.clear();
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
		const { textModelN } = this._session;
		LiveStrategy3._undoModelUntil(textModelN, altVersionId);
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

	override async renderChanges(response: ReplyResponse) {
		const diff = await this._editorWorkerService.computeDiff(this._session.textModel0.uri, this._session.textModelN.uri, { ignoreTrimWhitespace: false, maxComputationTimeMs: 5000, computeMoves: false }, 'advanced');
		this._updateSummaryMessage(diff?.changes ?? []);

		if (response.untitledTextModel) {
			this._widget.showCreatePreview(response.untitledTextModel);
		} else {
			this._widget.hideCreatePreview();
		}

		const newDecorations: IModelDeltaDecoration[] = [];

		if (diff?.changes) {

			for (const { innerChanges } of diff.changes) {

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
			}
		}
		this._inlineDiffDecorations.set(newDecorations);

		let widget: InlineChatLivePreviewWidget | undefined;
		this._sessionStore.add(toDisposable(() => widget?.dispose()));


		const actions = [
			toAction({
				id: 'diff',
				label: 'Compare',
				checked: false,
				class: ThemeIcon.asClassName(Codicon.diff),
				run: () => {
					if (!widget || !widget.isVisible) {
						widget = widget ?? this._instaService.createInstance(InlineChatLivePreviewWidget, this._editor, this._session, {
							renderSideBySide: diff!.changes.length > 1,
							splitViewDefaultRatio: 0.5,
							renderIndicators: false

						}, () => { });
						widget.showForChanges(diff!.changes);
					} else {
						widget.hide();
					}
				}
			}),
			toAction({
				id: 'discard',
				label: 'Discard',
				class: ThemeIcon.asClassName(Codicon.discard),
				run: () => {

				}
			})
		];

		const toolbar = this._instaService.createInstance(FloatingToolbar, this._editor, this._session.wholeRange.value.startLineNumber, actions);
		this._sessionStore.add(toolbar);
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
		this._widget.updateStatus(message);
	}

	override needsMargin(): boolean {
		return true;
	}

	hasFocus(): boolean {
		return this._widget.hasFocus();
	}
}

class FloatingToolbar implements IDisposable {

	dispose: () => void;

	constructor(
		editor: ICodeEditor,
		line: number,
		actions: IAction[],
		@IInstantiationService instaService: IInstantiationService,
	) {

		const store = new DisposableStore();
		this.dispose = store.dispose.bind(store);

		const overlayWidget = document.createElement('div');
		overlayWidget.classList.add('inline-chat-toolbar');
		const widget: IOverlayWidget = {
			getId: () => `inline-chat-toolbar}`,
			getDomNode: () => overlayWidget,
			getPosition: () => null
		};

		store.add(toDisposable(() => editor.removeOverlayWidget(widget)));
		editor.addOverlayWidget(widget);

		const layoutOverlay = () => {
			overlayWidget.style.top = `${editor.getTopForLineNumber(line) - editor.getScrollTop() + 4}px`;
			overlayWidget.style.right = `${editor.getLayoutInfo().minimap.minimapWidth + editor.getLayoutInfo().verticalScrollbarWidth + 4}px`;
		};
		store.add(editor.onDidScrollChange(layoutOverlay));
		layoutOverlay();

		const buttons = store.add(instaService.createInstance(WorkbenchButtonBar, overlayWidget, { telemetrySource: 'inline-diff-toolbar' }));
		buttons.update(actions);

		// const toolbar = store.add(instaService.createInstance(WorkbenchToolBar, overlayWidget, { telemetrySource: 'inline-diff-toolbar' }));
		// toolbar.setActions(actions);
	}
}
