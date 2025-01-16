/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatEditorController.css';
import { addStandardDisposableListener, getTotalWidth } from '../../../../base/browser/dom.js';
import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived, IObservable, observableFromEvent, observableValue } from '../../../../base/common/observable.js';
import { themeColorFromId } from '../../../../base/common/themables.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, IOverlayWidgetPositionCoordinates, IViewZone, MouseTargetType } from '../../../../editor/browser/editorBrowser.js';
import { LineSource, renderLines, RenderOptions } from '../../../../editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { diffAddDecoration, diffDeleteDecoration, diffWholeLineAddDecoration } from '../../../../editor/browser/widget/diffEditor/registrations.contribution.js';
import { EditorOption, IEditorStickyScrollOptions } from '../../../../editor/common/config/editorOptions.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IDocumentDiff } from '../../../../editor/common/diff/documentDiffProvider.js';
import { IEditorContribution, ScrollType } from '../../../../editor/common/editorCommon.js';
import { IModelDeltaDecoration, MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from '../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../editor/common/model/textModel.js';
import { InlineDecoration, InlineDecorationType } from '../../../../editor/common/viewModel.js';
import { localize } from '../../../../nls.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatEditingSessionState, IChatEditingService, IModifiedFileEntry, WorkingSetEntryState } from '../common/chatEditingService.js';
import { Event } from '../../../../base/common/event.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { observableCodeEditor } from '../../../../editor/browser/observableCodeEditor.js';
import { minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from '../../scm/common/quickDiff.js';
import { DetailedLineRangeMapping } from '../../../../editor/common/diff/rangeMapping.js';
import { isDiffEditorForEntry } from './chatEditing/chatEditing.js';
import { basename, isEqual } from '../../../../base/common/resources.js';
import { ChatAgentLocation, IChatAgentService } from '../common/chatAgents.js';
import { EditorsOrder, IEditorIdentifier, isDiffEditorInput } from '../../../common/editor.js';
import { ChatEditorOverlayWidget } from './chatEditorOverlay.js';

export const ctxHasEditorModification = new RawContextKey<boolean>('chat.hasEditorModifications', undefined, localize('chat.hasEditorModifications', "The current editor contains chat modifications"));
export const ctxHasRequestInProgress = new RawContextKey<boolean>('chat.ctxHasRequestInProgress', false, localize('chat.ctxHasRequestInProgress', "The current editor shows a file from an edit session which is still in progress"));
export const ctxReviewModeEnabled = new RawContextKey<boolean>('chat.ctxReviewModeEnabled', true, localize('chat.ctxReviewModeEnabled', "Review mode for chat changes is enabled"));

export class ChatEditorController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.chatEditorController';

	private static _diffLineDecorationData = ModelDecorationOptions.register({ description: 'diff-line-decoration' });

	private readonly _diffLineDecorations = this._editor.createDecorationsCollection(); // tracks the line range w/o visuals (used for navigate)
	private readonly _diffVisualDecorations = this._editor.createDecorationsCollection(); // tracks the real diff with character level inserts
	private readonly _diffHunksRenderStore = this._register(new DisposableStore());
	private readonly _diffHunkWidgets: DiffHunkWidget[] = [];

	private _viewZones: string[] = [];

	private readonly _overlayWidget: ChatEditorOverlayWidget;

	private readonly _ctxHasEditorModification: IContextKey<boolean>;
	private readonly _ctxRequestInProgress: IContextKey<boolean>;
	private readonly _ctxReviewModelEnabled: IContextKey<boolean>;

	static get(editor: ICodeEditor): ChatEditorController | null {
		const controller = editor.getContribution<ChatEditorController>(ChatEditorController.ID);
		return controller;
	}

	private readonly _currentEntryIndex = observableValue<number | undefined>(this, undefined);
	readonly currentEntryIndex: IObservable<number | undefined> = this._currentEntryIndex;

	private readonly _currentChangeIndex = observableValue<number | undefined>(this, undefined);
	readonly currentChangeIndex: IObservable<number | undefined> = this._currentChangeIndex;

	private _scrollLock: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IEditorService private readonly _editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this._overlayWidget = _instantiationService.createInstance(ChatEditorOverlayWidget, _editor);
		this._ctxHasEditorModification = ctxHasEditorModification.bindTo(contextKeyService);
		this._ctxRequestInProgress = ctxHasRequestInProgress.bindTo(contextKeyService);
		this._ctxReviewModelEnabled = ctxReviewModeEnabled.bindTo(contextKeyService);

		const editorObs = observableCodeEditor(this._editor);
		const fontInfoObs = editorObs.getOption(EditorOption.fontInfo);
		const lineHeightObs = editorObs.getOption(EditorOption.lineHeight);
		const modelObs = editorObs.model;

		this._store.add(autorun(r => {
			let isStreamingEdits = false;
			for (const session of _chatEditingService.editingSessionsObs.read(r)) {
				isStreamingEdits ||= session.state.read(r) === ChatEditingSessionState.StreamingEdits;
			}
			this._ctxRequestInProgress.set(isStreamingEdits);
		}));

		const entryForEditor = derived(r => {
			const model = modelObs.read(r);
			if (!model) {
				return;
			}

			for (const session of _chatEditingService.editingSessionsObs.read(r)) {
				const entries = session.entries.read(r);
				const idx = model?.uri
					? entries.findIndex(e => isEqual(e.modifiedURI, model.uri))
					: -1;

				if (idx >= 0) {
					return { session, entry: entries[idx], entries, idx };
				}
			}

			return undefined;
		});


		let didReval = false;

		this._register(autorunWithStore((r, store) => {

			const currentEditorEntry = entryForEditor.read(r);

			if (!currentEditorEntry) {
				this._clear();
				didReval = false;
				return;
			}

			if (this._editor.getOption(EditorOption.inDiffEditor) && !_instantiationService.invokeFunction(isDiffEditorForEntry, currentEditorEntry.entry, this._editor)) {
				this._clear();
				return;
			}

			const { session, entries, idx, entry } = currentEditorEntry;

			this._ctxReviewModelEnabled.set(entry.reviewMode.read(r));

			// context
			this._currentEntryIndex.set(idx, undefined);

			// overlay widget
			if (entry.state.read(r) !== WorkingSetEntryState.Modified) {
				this._overlayWidget.hide();
			} else {
				this._overlayWidget.show(session, entry, entries[(idx + 1) % entries.length]);
			}

			// scrolling logic
			if (entry.isCurrentlyBeingModified.read(r)) {
				// while modified: scroll along unless locked
				if (!this._scrollLock) {
					const maxLineNumber = entry.maxLineNumber.read(r);
					this._editor.revealLineNearTop(maxLineNumber, ScrollType.Smooth);
				}
				const domNode = this._editor.getDomNode();
				if (domNode) {
					store.add(addStandardDisposableListener(domNode, 'wheel', () => {
						this._scrollLock = true;
					}));
				}
			} else {
				// done: render diff
				fontInfoObs.read(r);
				lineHeightObs.read(r);

				const diff = entry?.diffInfo.read(r);

				// Add line decorations (just markers, no UI) for diff navigation
				this._updateDiffLineDecorations(diff);

				const reviewMode = entry.reviewMode.read(r);

				// Add diff decoration to the UI (unless in diff editor)
				if (!this._editor.getOption(EditorOption.inDiffEditor)) {
					this._updateDiffRendering(entry, diff, reviewMode);
				} else {
					this._clearDiffRendering();
				}

				if (!didReval && !diff.identical) {
					didReval = true;
					this.revealNext();
				}
			}
		}));

		// ---- readonly while streaming

		const shouldBeReadOnly = derived(this, r => {

			const model = modelObs.read(r);
			if (!model) {
				return undefined;
			}
			for (const session of _chatEditingService.editingSessionsObs.read(r)) {
				if (session.readEntry(model.uri, r) && session.state.read(r) === ChatEditingSessionState.StreamingEdits) {
					return true;
				}
			}
			return false;
		});


		let actualReadonly: boolean | undefined;
		let actualDeco: 'off' | 'editable' | 'on' | undefined;
		let actualStickyScroll: IEditorStickyScrollOptions | undefined;

		this._register(autorun(r => {
			const value = shouldBeReadOnly.read(r);
			if (value) {
				actualReadonly ??= this._editor.getOption(EditorOption.readOnly);
				actualDeco ??= this._editor.getOption(EditorOption.renderValidationDecorations);
				actualStickyScroll ??= this._editor.getOption(EditorOption.stickyScroll);

				this._editor.updateOptions({
					readOnly: true,
					renderValidationDecorations: 'off',
					stickyScroll: { enabled: false }
				});
			} else {
				if (actualReadonly !== undefined && actualDeco !== undefined && actualStickyScroll !== undefined) {
					this._editor.updateOptions({
						readOnly: actualReadonly,
						renderValidationDecorations: actualDeco,
						stickyScroll: actualStickyScroll
					});
					actualReadonly = undefined;
					actualDeco = undefined;
					actualStickyScroll = undefined;
				}
			}
		}));
	}

	override dispose(): void {
		this._clear();
		super.dispose();
	}

	private _clear() {
		this._clearDiffRendering();
		this._overlayWidget.hide();
		this._diffLineDecorations.clear();
		this._currentChangeIndex.set(undefined, undefined);
		this._currentEntryIndex.set(undefined, undefined);
		this._ctxHasEditorModification.reset();
		this._ctxReviewModelEnabled.reset();
	}

	private _clearDiffRendering() {
		this._editor.changeViewZones((viewZoneChangeAccessor) => {
			for (const id of this._viewZones) {
				viewZoneChangeAccessor.removeZone(id);
			}
		});
		this._viewZones = [];
		this._diffHunksRenderStore.clear();
		this._diffVisualDecorations.clear();
		this._scrollLock = false;
	}

	private _updateDiffRendering(entry: IModifiedFileEntry, diff: IDocumentDiff, reviewMode: boolean): void {

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

				if (reviewMode) {
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

				if (reviewMode) {
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
					const widget = this._instantiationService.createInstance(DiffHunkWidget, entry, diffEntry, this._editor.getModel()!.getVersionId(), this._editor, isCreatedContent ? 0 : result.heightInLines);
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
			}

			this._diffVisualDecorations.set(modifiedVisualDecorations);
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

	private _updateDiffLineDecorations(diff: IDocumentDiff): void {
		this._ctxHasEditorModification.set(!diff.identical);

		const modifiedLineDecorations: IModelDeltaDecoration[] = [];

		for (const diffEntry of diff.changes) {
			modifiedLineDecorations.push({
				range: diffEntry.modified.toInclusiveRange() ?? new Range(diffEntry.modified.startLineNumber, 1, diffEntry.modified.startLineNumber, Number.MAX_SAFE_INTEGER),
				options: ChatEditorController._diffLineDecorationData
			});
		}
		this._diffLineDecorations.set(modifiedLineDecorations);
	}

	unlockScroll(): void {
		this._scrollLock = false;
	}

	initNavigation(): void {
		const position = this._editor.getPosition();
		const target = position ? this._diffLineDecorations.getRanges().findIndex(r => r.containsPosition(position)) : -1;
		this._currentChangeIndex.set(target >= 0 ? target : undefined, undefined);
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
			this._currentChangeIndex.set(undefined, undefined);
			return false;
		}

		const decorations = this._diffLineDecorations
			.getRanges()
			.sort((a, b) => Range.compareRangesUsingStarts(a, b));

		if (decorations.length === 0) {
			this._currentChangeIndex.set(undefined, undefined);
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
			this._currentChangeIndex.set(undefined, undefined);
			return false;
		}

		target = (target + decorations.length) % decorations.length;

		this._currentChangeIndex.set(target, undefined);

		const targetPosition = next ? decorations[target].getStartPosition() : decorations[target].getEndPosition();
		this._editor.setPosition(targetPosition);
		this._editor.revealPositionInCenter(targetPosition, ScrollType.Smooth);
		this._editor.focus();

		return true;
	}

	private _findClosestWidget(): DiffHunkWidget | undefined {
		if (!this._editor.hasModel()) {
			return undefined;
		}
		const lineRelativeTop = this._editor.getTopForLineNumber(this._editor.getPosition().lineNumber) - this._editor.getScrollTop();
		let closestWidget: DiffHunkWidget | undefined;
		let closestDistance = Number.MAX_VALUE;

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

		return closestWidget;
	}

	rejectNearestChange(closestWidget: DiffHunkWidget | undefined): void {
		closestWidget = closestWidget ?? this._findClosestWidget();
		if (closestWidget instanceof DiffHunkWidget) {
			closestWidget.reject();
			this.revealNext();
		}
	}

	acceptNearestChange(closestWidget: DiffHunkWidget | undefined): void {
		closestWidget = closestWidget ?? this._findClosestWidget();
		if (closestWidget instanceof DiffHunkWidget) {
			closestWidget.accept();
			this.revealNext();
		}
	}

	async toggleDiff(widget: DiffHunkWidget | undefined): Promise<void> {
		if (!this._editor.hasModel()) {
			return;
		}

		let entry: IModifiedFileEntry | undefined;
		for (const session of this._chatEditingService.editingSessionsObs.get()) {
			entry = session.getEntry(this._editor.getModel().uri);
			if (entry) {
				break;
			}
		}

		if (!entry) {
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

		let selection = this._editor.getSelection();
		if (widget instanceof DiffHunkWidget) {
			const lineNumber = widget.getStartLineNumber();
			const position = lineNumber ? new Position(lineNumber, 1) : undefined;
			if (position && !selection.containsPosition(position)) {
				selection = Selection.fromPositions(position);
			}
		}

		const isDiffEditor = this._editor.getOption(EditorOption.inDiffEditor);

		if (isDiffEditor) {
			// normal EDITOR
			await this._editorService.openEditor({ resource: entry.modifiedURI });

		} else {
			// DIFF editor
			const defaultAgentName = this._chatAgentService.getDefaultAgent(ChatAgentLocation.EditingSession)?.fullName;
			const diffEditor = await this._editorService.openEditor({
				original: { resource: entry.originalURI, options: { selection: undefined } },
				modified: { resource: entry.modifiedURI, options: { selection } },
				label: defaultAgentName
					? localize('diff.agent', '{0} (changes from {1})', basename(entry.modifiedURI), defaultAgentName)
					: localize('diff.generic', '{0} (changes from chat)', basename(entry.modifiedURI))
			});

			if (diffEditor && diffEditor.input) {

				// this is needed, passing the selection doesn't seem to work
				diffEditor.getControl()?.setSelection(selection);

				// close diff editor when entry is decided
				const d = autorun(r => {
					const state = entry.state.read(r);
					if (state === WorkingSetEntryState.Accepted || state === WorkingSetEntryState.Rejected) {
						d.dispose();

						const editorIdents: IEditorIdentifier[] = [];
						for (const candidate of this._editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
							if (isDiffEditorInput(candidate.editor)
								&& isEqual(candidate.editor.original.resource, entry.originalURI)
								&& isEqual(candidate.editor.modified.resource, entry.modifiedURI)
							) {
								editorIdents.push(candidate);
							}
						}

						this._editorService.closeEditors(editorIdents);
					}
				});
			}
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
		private readonly _change: DetailedLineRangeMapping,
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
		this._store.add(toolbar.actionRunner.onWillRun(_ => _editor.focus()));
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

	reject(): void {
		if (this._versionId === this._editor.getModel()?.getVersionId()) {
			this.entry.rejectHunk(this._change);
		}
	}

	accept(): void {
		if (this._versionId === this._editor.getModel()?.getVersionId()) {
			this.entry.acceptHunk(this._change);
		}
	}
}
