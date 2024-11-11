/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatEditorController.css';
import { getTotalWidth } from '../../../../base/browser/dom.js';
import { binarySearch, coalesceInPlace } from '../../../../base/common/arrays.js';
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
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
import { MenuWorkbenchButtonBar } from '../../../../platform/actions/browser/buttonbar.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';

export const ctxHasEditorModification = new RawContextKey<boolean>('chat.hasEditorModifications', undefined, localize('chat.hasEditorModifications', "The current editor contains chat modifications"));

export class ChatEditorController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.chatEditorController';

	private readonly _decorations = this._editor.createDecorationsCollection();
	private readonly _diffHunksRenderStore = this._register(new DisposableStore());
	private readonly _diffHunkWidgets: DiffHunkWidget[] = [];

	private _viewZones: string[] = [];
	private readonly _ctxHasEditorModification: IContextKey<boolean>;

	static get(editor: ICodeEditor): ChatEditorController | null {
		const controller = editor.getContribution<ChatEditorController>(ChatEditorController.ID);
		return controller;
	}

	constructor(
		private readonly _editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this._ctxHasEditorModification = ctxHasEditorModification.bindTo(contextKeyService);

		const configSignal = observableFromEvent(
			Event.filter(this._editor.onDidChangeConfiguration, e => e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.lineHeight)),
			_ => undefined
		);

		const modelObs = observableFromEvent(this._editor.onDidChangeModel, _ => this._editor.getModel());

		this._register(autorun(r => {

			if (this._editor.getOption(EditorOption.inDiffEditor)) {
				this._clearRendering();
				return;
			}

			configSignal.read(r);

			const model = modelObs.read(r);

			const session = this._chatEditingService.currentEditingSessionObs.read(r);
			const entry = session?.entries.read(r).find(e => isEqual(e.modifiedURI, model?.uri));

			if (!entry || entry.state.read(r) !== WorkingSetEntryState.Modified) {
				this._clearRendering();
				return;
			}

			const diff = entry?.diffInfo.read(r);
			this._updateWithDiff(entry, diff);
		}));

		const shouldBeReadOnly = derived(this, r => {
			const value = this._chatEditingService.currentEditingSessionObs.read(r);
			if (!value || value.state.read(r) !== ChatEditingSessionState.StreamingEdits) {
				return false;
			}
			return value.entries.read(r).some(e => isEqual(e.modifiedURI, this._editor.getModel()?.uri));
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
		this._decorations.clear();
		this._ctxHasEditorModification.reset();
	}

	private _updateWithDiff(entry: IModifiedFileEntry, diff: IDocumentDiff | null | undefined): void {
		if (!diff) {
			this._clearRendering();
			return;
		}

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
			const modifiedDecorations: IModelDeltaDecoration[] = [];
			const mightContainNonBasicASCII = originalModel.mightContainNonBasicASCII();
			const mightContainRTL = originalModel.mightContainRTL();
			const renderOptions = RenderOptions.fromEditor(this._editor);

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
					modifiedDecorations.push({
						range: i.modifiedRange, options: chatDiffAddDecoration
					});
				}
				if (!diffEntry.modified.isEmpty) {
					modifiedDecorations.push({
						range: diffEntry.modified.toInclusiveRange()!,
						options: chatDiffWholeLineAddDecoration
					});
				}

				if (diffEntry.original.isEmpty) {
					// insertion
					modifiedDecorations.push({
						range: diffEntry.modified.toInclusiveRange()!,
						options: addedDecoration
					});
				} else if (diffEntry.modified.isEmpty) {
					// deletion
					modifiedDecorations.push({
						range: new Range(diffEntry.modified.startLineNumber - 1, 1, diffEntry.modified.startLineNumber, 1),
						options: deletedDecoration
					});
				} else {
					// modification
					modifiedDecorations.push({
						range: diffEntry.modified.toInclusiveRange()!,
						options: modifiedDecoration
					});
				}
				const domNode = document.createElement('div');
				domNode.className = 'chat-editing-original-zone view-lines line-delete monaco-mouse-cursor-text';
				const result = renderLines(source, renderOptions, decorations, domNode);

				const isCreatedContent = decorations.length === 1 && decorations[0].range.isEmpty() && decorations[0].range.startLineNumber === 1;
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

				const widget = this._instantiationService.createInstance(DiffHunkWidget, undoEdits, this._editor.getModel()!.getVersionId(), this._editor, isCreatedContent ? 0 : result.heightInLines);
				widget.layout(diffEntry.modified.startLineNumber);

				this._diffHunkWidgets.push(widget);
				diffHunkDecorations.push({
					range: diffEntry.modified.toInclusiveRange() ?? new Range(diffEntry.modified.startLineNumber, 1, diffEntry.modified.startLineNumber, Number.MAX_SAFE_INTEGER),
					options: {
						description: 'diff-hunk-widget',
						stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges
					}
				});
			}

			this._decorations.set(modifiedDecorations);
		});

		const diffHunkDecoCollection = this._editor.createDecorationsCollection(diffHunkDecorations);

		this._diffHunksRenderStore.add(toDisposable(() => {
			dispose(this._diffHunkWidgets);
			this._diffHunkWidgets.length = 0;
			diffHunkDecoCollection.clear();
		}));

		const toggleWidget = (activeWidget: DiffHunkWidget | undefined) => {
			for (const widget of this._diffHunkWidgets) {
				widget.toggle(widget === activeWidget);
			}
		};

		this._diffHunksRenderStore.add(this._editor.onMouseMove(e => {
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

		const decorations: (Range | undefined)[] = this._decorations
			.getRanges()
			.sort((a, b) => Range.compareRangesUsingStarts(a, b));

		// TODO@jrieken this is slow and should be done smarter, e.g being able to read
		// only whole range decorations because the goal is to go from change to change, skipping
		// over word level changes
		for (let i = 0; i < decorations.length; i++) {
			const decoration = decorations[i];
			for (let j = 0; j < decorations.length; j++) {
				if (i !== j && decoration && decorations[j]?.containsRange(decoration)) {
					decorations[i] = undefined;
					break;
				}
			}
		}

		coalesceInPlace(decorations);

		if (decorations.length === 0) {
			return false;
		}

		let idx = binarySearch(decorations, Range.fromPositions(position), Range.compareRangesUsingStarts);
		if (idx < 0) {
			idx = ~idx;
		}

		let target: number;
		if (decorations[idx]?.containsPosition(position)) {
			target = idx + (next ? 1 : -1);
		} else {
			target = next ? idx : idx - 1;
		}

		if (strict && (target < 0 || target >= decorations.length)) {
			return false;
		}

		target = (target + decorations.length) % decorations.length;

		const targetPosition = decorations[target].getStartPosition();
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
}

class DiffHunkWidget implements IOverlayWidget {

	private static _idPool = 0;
	private readonly _id: string = `diff-change-widget-${DiffHunkWidget._idPool++}`;

	private readonly _domNode: HTMLElement;
	private readonly _store = new DisposableStore();
	private _position: IOverlayWidgetPosition | undefined;
	private _lastStartLineNumber: number | undefined;


	constructor(
		private readonly _undoEdits: ISingleEditOperation[],
		private readonly _versionId: number,
		private readonly _editor: ICodeEditor,
		private readonly _lineDelta: number,
		@IInstantiationService instaService: IInstantiationService,
	) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'chat-diff-change-content-widget';

		const btns = instaService.createInstance(MenuWorkbenchButtonBar, this._domNode, MenuId.ChatEditingEditorHunk, {
			telemetrySource: 'chatEditingEditorHunk',
			toolbarOptions: { primaryGroup: () => true, },
			menuOptions: {
				renderShortTitle: true,
				arg: this,
			},
			buttonConfigProvider: () => {
				return {
					isSecondary: true,
					showIcon: true,
					showLabel: true
				};
			}
		});

		this._store.add(btns);
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

	// ---

	undo() {
		if (this._versionId === this._editor.getModel()?.getVersionId()) {
			this._editor.executeEdits('chatEdits.undo', this._undoEdits);
		}
	}
}
