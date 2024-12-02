/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatEditorController.css';
import { getTotalWidth } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { themeColorFromId } from '../../../../base/common/themables.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, IOverlayWidgetPositionCoordinates, IViewZone, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { LineSource, renderLines, RenderOptions } from '../../../../editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { diffAddDecoration, diffDeleteDecoration, diffWholeLineAddDecoration } from '../../../../editor/browser/widget/diffEditor/registrations.contribution.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { EditOperation, ISingleEditOperation } from '../../../../editor/common/core/editOperation.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IDocumentDiff } from '../../../../editor/common/diff/documentDiffProvider.js';
import { IEditorContribution, ScrollType } from '../../../../editor/common/editorCommon.js';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { InlineDecoration, InlineDecorationType } from '../../../../editor/common/viewModel.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from '../../scm/browser/dirtydiffDecorator.js';
import { ChatEditingSessionState, IChatEditingService, IModifiedFileEntry, WorkingSetEntryState } from '../common/chatEditingService.js';
import { Event } from '../../../../base/common/event.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';

export const ctxHasEditorModification = new RawContextKey<boolean>('chat.hasEditorModifications', undefined, localize('chat.hasEditorModifications', "The current editor contains chat modifications"));
export const ctxHasRequestInProgress = new RawContextKey<boolean>('chat.ctxHasRequestInProgress', false, localize('chat.ctxHasRequestInProgress', "The current editor shows a file from an edit session which is still in progress"));

export class ChatEditorController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.chatEditorController';

	private static _diffLineDecorationData = ModelDecorationOptions.register({ description: 'diff-line-decoration' });

	private readonly _diffLineDecorations = this._editor.createDecorationsCollection(); // tracks the line range w/o visuals (used for navigate)
	private readonly _diffVisualDecorations = this._editor.createDecorationsCollection(); // tracks the real diff with character level inserts
	private readonly _diffHunksRenderStore = this._register(new DisposableStore());
	private readonly _diffHunkWidgets: DiffHunkWidget[] = [];

	private _viewZones: string[] = [];
	private readonly _ctxHasEditorModification: IContextKey<boolean>;
	private readonly _ctxRequestInProgress: IContextKey<boolean>;

	static get(editor: ICodeEditor): ChatEditorController | null {
		const controller = editor.getContribution<ChatEditorController>(ChatEditorController.ID);
		return controller;
	}

	private readonly _currentChange = observableValue<Position | undefined>(this, undefined);
	readonly currentChange: IObservable<Position | undefined> = this._currentChange;

	private _scrollLock: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IEditorService private readonly _editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this._ctxHasEditorModification = ctxHasEditorModification.bindTo(contextKeyService);
		this._ctxRequestInProgress = ctxHasRequestInProgress.bindTo(contextKeyService);

		const fontInfoObs = observableCodeEditor(this._editor).getOption(EditorOption.fontInfo);
		const lineHeightObs = observableCodeEditor(this._editor).getOption(EditorOption.lineHeight);
		const modelObs = observableCodeEditor(this._editor).model;

		// scroll along unless "another" scroll happens
		let ignoreScrollEvent = false;
		this._store.add(this._editor.onDidScrollChange(e => {
			if (e.scrollTopChanged && !ignoreScrollEvent) {
				this._scrollLock = true;
			}
		}));

		this._store.add(autorun(r => {
			const session = this._chatEditingService.currentEditingSessionObs.read(r);
			this._ctxRequestInProgress.set(session?.state.read(r) === ChatEditingSessionState.StreamingEdits);
		}));

		this._register(autorun(r => {

			if (this._editor.getOption(EditorOption.inDiffEditor)) {
				this._clearRendering();
				return;
			}

			fontInfoObs.read(r);
			lineHeightObs.read(r);

			const model = modelObs.read(r);

			const session = this._chatEditingService.currentEditingSessionObs.read(r);
			const entry = model?.uri ? session?.readEntry(model.uri, r) : undefined;

			if (!entry || entry.state.read(r) !== WorkingSetEntryState.Modified) {
				this._clearRendering();
				return;
			}

			try {
				ignoreScrollEvent = true;
				if (!this._scrollLock) {
					const maxLineNumber = entry.maxLineNumber.read(r);
					this._editor.revealLineNearTop(maxLineNumber, ScrollType.Immediate);
				}
				const diff = entry?.diffInfo.read(r);
				this._updateWithDiff(entry, diff);
				this.initNavigation();
				if (this._currentChange.get() === undefined) {
					this.revealNext();
				}
			} finally {
				ignoreScrollEvent = false;
			}
		}));

		const shouldBeReadOnly = derived(this, r => {
			const value = this._chatEditingService.currentEditingSessionObs.read(r);
			if (!value || value.state.read(r) !== ChatEditingSessionState.StreamingEdits) {
				return false;
			}

			const model = modelObs.read(r);
			return model ? value.readEntry(model.uri, r) : undefined;
		});


		let actualReadonly: boolean | undefined;
		let actualDeco: 'off' | 'editable' | 'on' | undefined;

		this._register(autorun(r => {
			const value = shouldBeReadOnly.read(r);
			if (value) {
				actualReadonly ??= this._editor.getOption(EditorOption.readOnly);
				actualDeco ??= this._editor.getOption(EditorOption.renderValidationDecorations);

				this._editor.updateOptions({
					readOnly: true,
					renderValidationDecorations: 'off'
				});
			} else {
				if (actualReadonly !== undefined && actualDeco !== undefined) {
					this._editor.updateOptions({
						readOnly: actualReadonly,
						renderValidationDecorations: actualDeco
					});
					actualReadonly = undefined;
					actualDeco = undefined;
				}
			}
		}));
	}

	override dispose(): void {
		this._clearRendering();
		super.dispose();
	}

	private _clearRendering() {
		this._editor.changeViewZones((viewZoneChangeAccessor) => {
			for (const id of this._viewZones) {
				viewZoneChangeAccessor.removeZone(id);
			}
		});
		this._viewZones = [];
		this._diffHunksRenderStore.clear();
		this._diffVisualDecorations.clear();
		this._diffLineDecorations.clear();
		this._ctxHasEditorModification.reset();
		this._currentChange.set(undefined, undefined);
		this._scrollLock = false;
	}

	private _updateWithDiff(entry: IModifiedFileEntry, diff: IDocumentDiff): void {

		this._ctxHasEditorModification.set(true);
		const originalModel = entry.originalModel;

		const chatDiffAddDecoration = ModelDecorationOptions.createDynamic({
			...diffAddDecoration,
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
		});
		const chatDiffWholeLineAddDecoration = ModelDecorationOptions.createDynamic({
			...diffWholeLineAddDecoration,
			stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		});
		const createOverviewDecoration = (overviewRulerColor: string, minimapColor: string) => {
			return ModelDecorationOptions.createDynamic({
				description: 'chat-editing-decoration',
				overviewRuler: { color: themeColorFromId(overviewRulerColor), position: OverviewRulerLane.Left },
				minimap: { color: themeColorFromId(minimapColor), position: MinimapPosition.Gutter },
			});
		};
		const modifiedDecoration = createOverviewDecoration(overviewRulerModifiedForeground, minimapGutterModifiedBackground);
		const addedDecoration = createOverviewDecoration(overviewRulerAddedForeground, minimapGutterAddedBackground);
		const deletedDecoration = createOverviewDecoration(overviewRulerDeletedForeground, minimapGutterDeletedBackground);

		this._diffHunksRenderStore.clear();
		this._diffHunkWidgets.length = 0;
		const diffHunkDecorations: IModelDeltaDecoration[] = [];

		this._editor.changeViewZones((viewZoneChangeAccessor) => {
			for (const id of this._viewZones) {
				viewZoneChangeAccessor.removeZone(id);
			}
			this._viewZones = [];
			const modifiedVisualDecorations: IModelDeltaDecoration[] = [];
			const modifiedLineDecorations: IModelDeltaDecoration[] = [];
			const mightContainNonBasicASCII = originalModel.mightContainNonBasicASCII();
			const mightContainRTL = originalModel.mightContainRTL();
			const renderOptions = RenderOptions.fromEditor(this._editor);
			const editorLineCount = this._editor.getModel()?.getLineCount();

			for (const diffEntry of diff.changes) {

				const originalRange = diffEntry.original;
				originalModel.tokenization.forceTokenization(Math.max(1, originalRange.endLineNumberExclusive - 1));
				const source = new LineSource(
					originalRange.mapToLineArray(l => originalModel.tokenization.getLineTokens(l)),
					[],
					mightContainNonBasicASCII,
					mightContainRTL,
				);
				const decorations: InlineDecoration[] = [];
				for (const i of diffEntry.innerChanges || []) {
					decorations.push(new InlineDecoration(
						i.originalRange.delta(-(diffEntry.original.startLineNumber - 1)),
						diffDeleteDecoration.className!,
						InlineDecorationType.Regular
					));

					// If the original range is empty, the start line number is 1 and the new range spans the entire file, don't draw an Added decoration
					if (!(i.originalRange.isEmpty() && i.originalRange.startLineNumber === 1 && i.modifiedRange.endLineNumber === editorLineCount) && !i.modifiedRange.isEmpty()) {
						modifiedVisualDecorations.push({
							range: i.modifiedRange, options: chatDiffAddDecoration
						});
					}
				}

				// Render an added decoration but don't also render a deleted decoration for newly inserted content at the start of the file
				// Note, this is a workaround for the `LineRange.isEmpty()` in diffEntry.original being `false` for newly inserted content
				const isCreatedContent = decorations.length === 1 && decorations[0].range.isEmpty() && diffEntry.original.startLineNumber === 1;

				if (!diffEntry.modified.isEmpty && !(isCreatedContent && (diffEntry.modified.endLineNumberExclusive - 1) === editorLineCount)) {
					modifiedVisualDecorations.push({
						range: diffEntry.modified.toInclusiveRange()!,
						options: chatDiffWholeLineAddDecoration
					});
				}

				if (diffEntry.original.isEmpty) {
					// insertion
					modifiedVisualDecorations.push({
						range: diffEntry.modified.toInclusiveRange()!,
						options: addedDecoration
					});
				} else if (diffEntry.modified.isEmpty) {
					// deletion
					modifiedVisualDecorations.push({
						range: new Range(diffEntry.modified.startLineNumber - 1, 1, diffEntry.modified.startLineNumber, 1),
						options: deletedDecoration
					});
				} else {
					// modification
					modifiedVisualDecorations.push({
						range: diffEntry.modified.toInclusiveRange()!,
						options: modifiedDecoration
					});
				}
				const domNode = document.createElement('div');
				domNode.className = 'chat-editing-original-zone view-lines line-delete monaco-mouse-cursor-text';
				const result = renderLines(source, renderOptions, decorations, domNode);

				if (!isCreatedContent) {
					const viewZoneData: IViewZone = {
						afterLineNumber: diffEntry.modified.startLineNumber - 1,
						heightInLines: result.heightInLines,
						domNode,
						ordinal: 50000 + 2 // more than https://github.com/microsoft/vscode/blob/bf52a5cfb2c75a7327c9adeaefbddc06d529dcad/src/vs/workbench/contrib/inlineChat/browser/inlineChatZoneWidget.ts#L42
					};

					this._viewZones.push(viewZoneChangeAccessor.addZone(viewZoneData));
				}

				// Add content widget for each diff change
				const undoEdits: ISingleEditOperation[] = [];
				for (const c of diffEntry.innerChanges ?? []) {
					const oldText = originalModel.getValueInRange(c.originalRange);
					undoEdits.push(EditOperation.replace(c.modifiedRange, oldText));
				}

				const widget = this._instantiationService.createInstance(DiffHunkWidget, entry, undoEdits, this._editor.getModel()!.getVersionId(), this._editor, isCreatedContent ? 0 : result.heightInLines);
				widget.layout(diffEntry.modified.startLineNumber);

				this._diffHunkWidgets.push(widget);
				diffHunkDecorations.push({
					range: diffEntry.modified.toInclusiveRange() ?? new Range(diffEntry.modified.startLineNumber, 1, diffEntry.modified.startLineNumber, Number.MAX_SAFE_INTEGER),
					options: {
						description: 'diff-hunk-widget',
						stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
					}
				});

				// Add line decorations for diff navigation
				modifiedLineDecorations.push({
					range: diffEntry.modified.toInclusiveRange() ?? new Range(diffEntry.modified.startLineNumber, 1, diffEntry.modified.startLineNumber, Number.MAX_SAFE_INTEGER),
					options: ChatEditorController._diffLineDecorationData
				});
			}

			this._diffVisualDecorations.set(modifiedVisualDecorations);
			this._diffLineDecorations.set(modifiedLineDecorations);
		});

		const diffHunkDecoCollection = this._editor.createDecorationsCollection(diffHunkDecorations);

		this._diffHunksRenderStore.add(toDisposable(() => {
			dispose(this._diffHunkWidgets);
			this._diffHunkWidgets.length = 0;
			diffHunkDecoCollection.clear();
		}));



		const positionObs = observableFromEvent(this._editor.onDidChangeCursorPosition, _ => this._editor.getPosition());

		const activeWidgetIdx = derived(r => {
			const position = positionObs.read(r);
			if (!position) {
				return -1;
			}
			const idx = diffHunkDecoCollection.getRanges().findIndex(r => r.containsPosition(position));
			return idx;
		});
		const toggleWidget = (activeWidget: DiffHunkWidget | undefined) => {
			const positionIdx = activeWidgetIdx.get();
			for (let i = 0; i < this._diffHunkWidgets.length; i++) {
				const widget = this._diffHunkWidgets[i];
				widget.toggle(widget === activeWidget || i === positionIdx);
			}
		};

		this._diffHunksRenderStore.add(autorun(r => {
			// reveal when cursor inside
			const idx = activeWidgetIdx.read(r);
			const widget = this._diffHunkWidgets[idx];
			toggleWidget(widget);
		}));


		this._diffHunksRenderStore.add(this._editor.onMouseMove(e => {

			// reveal when hovering over
			if (e.target.type === MouseTargetType.OVERLAY_WIDGET) {
				const id = e.target.detail;
				const widget = this._diffHunkWidgets.find(w => w.getId() === id);
				toggleWidget(widget);

			} else if (e.target.type === MouseTargetType.CONTENT_VIEW_ZONE) {
				const zone = e.target.detail;
				const idx = this._viewZones.findIndex(id => id === zone.viewZoneId);
				toggleWidget(this._diffHunkWidgets[idx]);

			} else if (e.target.position) {
				const { position } = e.target;
				const idx = diffHunkDecoCollection.getRanges().findIndex(r => r.containsPosition(position));
				toggleWidget(this._diffHunkWidgets[idx]);

			} else {
				toggleWidget(undefined);
			}
		}));

		this._diffHunksRenderStore.add(Event.any(this._editor.onDidScrollChange, this._editor.onDidLayoutChange)(() => {
			for (let i = 0; i < this._diffHunkWidgets.length; i++) {
				const widget = this._diffHunkWidgets[i];
				const range = diffHunkDecoCollection.getRange(i);
				if (range) {
					widget.layout(range?.startLineNumber);
				} else {
					widget.dispose();
				}
			}
		}));
	}

	unlockScroll(): void {
		this._scrollLock = false;
	}

	initNavigation(): void {
		const position = this._editor.getPosition();
		const range = position && this._diffLineDecorations.getRanges().find(r => r.containsPosition(position));
		if (range) {
			this._currentChange.set(position, undefined);
		}
	}

	revealNext(strict = false): boolean {
		return this._reveal(true, strict);
	}

	revealPrevious(strict = false): boolean {
		return this._reveal(false, strict);
	}

	private _reveal(next: boolean, strict: boolean): boolean {
		const position = this._editor.getPosition();
		if (!position) {
			return false;
		}

		const decorations = this._diffLineDecorations
			.getRanges()
			.sort((a, b) => Range.compareRangesUsingStarts(a, b));

		if (decorations.length === 0) {
			return false;
		}

		let target: number = -1;
		for (let i = 0; i < decorations.length; i++) {
			const range = decorations[i];
			if (range.containsPosition(position)) {
				target = i + (next ? 1 : -1);
				break;
			} else if (Position.isBefore(position, range.getStartPosition())) {
				target = next ? i : i - 1;
				break;
			}
		}

		if (strict && (target < 0 || target >= decorations.length)) {
			return false;
		}

		target = (target + decorations.length) % decorations.length;

		const targetPosition = next ? decorations[target].getStartPosition() : decorations[target].getEndPosition();

		this._currentChange.set(targetPosition, undefined);

		this._editor.setPosition(targetPosition);
		this._editor.revealPositionInCenter(targetPosition, ScrollType.Smooth);
		this._editor.focus();
		return true;
	}

	undoNearestChange(closestWidget: DiffHunkWidget | undefined): void {
		if (!this._editor.hasModel()) {
			return;
		}
		const lineRelativeTop = this._editor.getTopForLineNumber(this._editor.getPosition().lineNumber) - this._editor.getScrollTop();
		let closestDistance = Number.MAX_VALUE;

		if (!(closestWidget instanceof DiffHunkWidget)) {
			for (const widget of this._diffHunkWidgets) {
				const widgetTop = (<IOverlayWidgetPositionCoordinates | undefined>widget.getPosition()?.preference)?.top;
				if (widgetTop !== undefined) {
					const distance = Math.abs(widgetTop - lineRelativeTop);
					if (distance < closestDistance) {
						closestDistance = distance;
						closestWidget = widget;
					}
				}
			}
		}

		if (closestWidget instanceof DiffHunkWidget) {
			closestWidget.undo();
		}
	}

	async openDiff(widget: DiffHunkWidget | undefined): Promise<void> {
		if (!this._editor.hasModel()) {
			return;
		}
		const lineRelativeTop = this._editor.getTopForLineNumber(this._editor.getPosition().lineNumber) - this._editor.getScrollTop();
		let closestDistance = Number.MAX_VALUE;

		if (!(widget instanceof DiffHunkWidget)) {
			for (const candidate of this._diffHunkWidgets) {
				const widgetTop = (<IOverlayWidgetPositionCoordinates | undefined>candidate.getPosition()?.preference)?.top;
				if (widgetTop !== undefined) {
					const distance = Math.abs(widgetTop - lineRelativeTop);
					if (distance < closestDistance) {
						closestDistance = distance;
						widget = candidate;
					}
				}
			}
		}

		if (widget instanceof DiffHunkWidget) {

			const lineNumber = widget.getStartLineNumber();
			const position = lineNumber ? new Position(lineNumber, 1) : undefined;
			let selection = this._editor.getSelection();
			if (position && !selection.containsPosition(position)) {
				selection = Selection.fromPositions(position);
			}

			const diffEditor = await this._editorService.openEditor({
				original: { resource: widget.entry.originalURI, options: { selection: undefined } },
				modified: { resource: widget.entry.modifiedURI, options: { selection } },
			});

			// this is needed, passing the selection doesn't seem to work
			diffEditor?.getControl()?.setSelection(selection);
		}
	}
}

class DiffHunkWidget implements IOverlayWidget {

	private static _idPool = 0;
	private readonly _id: string = `diff-change-widget-${DiffHunkWidget._idPool++}`;

	private readonly _domNode: HTMLElement;
	private readonly _store = new DisposableStore();
	private _position: IOverlayWidgetPosition | undefined;
	private _lastStartLineNumber: number | undefined;


	constructor(
		readonly entry: IModifiedFileEntry,
		private readonly _undoEdits: ISingleEditOperation[],
		private readonly _versionId: number,
		private readonly _editor: ICodeEditor,
		private readonly _lineDelta: number,
		@IInstantiationService instaService: IInstantiationService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'chat-diff-change-content-widget';

		const toolbar = instaService.createInstance(MenuWorkbenchToolBar, this._domNode, MenuId.ChatEditingEditorHunk, {
			telemetrySource: 'chatEditingEditorHunk',
			hiddenItemStrategy: HiddenItemStrategy.NoHide,
			toolbarOptions: { primaryGroup: () => true, },
			menuOptions: {
				renderShortTitle: true,
				arg: this,
			},
		});

		this._store.add(toolbar);
		this._editor.addOverlayWidget(this);
	}

	dispose(): void {
		this._store.dispose();
		this._editor.removeOverlayWidget(this);
	}

	getId(): string {
		return this._id;
	}

	layout(startLineNumber: number): void {

		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const { contentLeft, contentWidth, verticalScrollbarWidth } = this._editor.getLayoutInfo();
		const scrollTop = this._editor.getScrollTop();

		this._position = {
			stackOridinal: 1,
			preference: {
				top: this._editor.getTopForLineNumber(startLineNumber) - scrollTop - (lineHeight * this._lineDelta),
				left: contentLeft + contentWidth - (2 * verticalScrollbarWidth + getTotalWidth(this._domNode))
			}
		};

		this._editor.layoutOverlayWidget(this);
		this._lastStartLineNumber = startLineNumber;
	}

	toggle(show: boolean) {
		this._domNode.classList.toggle('hover', show);
		if (this._lastStartLineNumber) {
			this.layout(this._lastStartLineNumber);
		}
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return this._position ?? null;
	}

	getStartLineNumber(): number | undefined {
		return this._lastStartLineNumber;
	}

	// ---

	undo() {
		if (this._versionId === this._editor.getModel()?.getVersionId()) {
			this._editor.executeEdits('chatEdits.undo', this._undoEdits);
		}
	}
}
