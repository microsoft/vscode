/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatEditorController.css';

import { getTotalWidth } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, dispose, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, IObservable, observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { themeColorFromId } from '../../../../../base/common/themables.js';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, IOverlayWidgetPositionCoordinates, IViewZone, MouseTargetType } from '../../../../../editor/browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../editor/browser/observableCodeEditor.js';
import { AccessibleDiffViewer, IAccessibleDiffViewerModel } from '../../../../../editor/browser/widget/diffEditor/components/accessibleDiffViewer.js';
import { LineSource, renderLines, RenderOptions } from '../../../../../editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { diffAddDecoration, diffDeleteDecoration, diffWholeLineAddDecoration } from '../../../../../editor/browser/widget/diffEditor/registrations.contribution.js';
import { EditorOption, IEditorOptions } from '../../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { LineRange } from '../../../../../editor/common/core/ranges/lineRange.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { IDocumentDiff } from '../../../../../editor/common/diff/documentDiffProvider.js';
import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { IEditorDecorationsCollection } from '../../../../../editor/common/editorCommon.js';
import { IModelDeltaDecoration, ITextModel, MinimapPosition, OverviewRulerLane, TrackedRangeStickiness } from '../../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { InlineDecoration, InlineDecorationType } from '../../../../../editor/common/viewModel/inlineDecorations.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { TextEditorSelectionRevealType } from '../../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { EditorsOrder, IEditorIdentifier, isDiffEditorInput } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from '../../../scm/common/quickDiff.js';
import { IModifiedFileEntry, IModifiedFileEntryChangeHunk, IModifiedFileEntryEditorIntegration, ModifiedFileEntryState } from '../../common/editing/chatEditingService.js';
import { isTextDiffEditorForEntry } from './chatEditing.js';
import { ActionViewItem } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ctxCursorInChangeRange } from './chatEditingEditorContextKeys.js';
import { LinkedList } from '../../../../../base/common/linkedList.js';

export interface IDocumentDiff2 extends IDocumentDiff {

	originalModel: ITextModel;
	modifiedModel: ITextModel;

	keep(changes: DetailedLineRangeMapping): Promise<boolean>;
	undo(changes: DetailedLineRangeMapping): Promise<boolean>;
}

class ObjectPool<T extends IDisposable> {

	private readonly _free = new LinkedList<T>();

	dispose(): void {
		dispose(this._free);
	}

	get(): T | undefined {
		return this._free.shift();
	}

	putBack(obj: T): void {
		this._free.push(obj);
	}

	get free(): Iterable<T> {
		return this._free;
	}
}

export class ChatEditingCodeEditorIntegration implements IModifiedFileEntryEditorIntegration {

	private static readonly _diffLineDecorationData = ModelDecorationOptions.register({ description: 'diff-line-decoration' });

	private readonly _currentIndex = observableValue(this, -1);
	readonly currentIndex: IObservable<number> = this._currentIndex;
	private readonly _store = new DisposableStore();

	private readonly _diffLineDecorations: IEditorDecorationsCollection;
	private readonly _diffVisualDecorations: IEditorDecorationsCollection;
	private readonly _diffHunksRenderStore = this._store.add(new DisposableStore());
	private readonly _diffHunkWidgetPool = this._store.add(new ObjectPool<DiffHunkWidget>());
	private readonly _diffHunkWidgets: DiffHunkWidget[] = [];
	private _viewZones: string[] = [];

	private readonly _accessibleDiffViewVisible = observableValue<boolean>(this, false);

	constructor(
		private readonly _entry: IModifiedFileEntry,
		private readonly _editor: ICodeEditor,
		documentDiffInfo: IObservable<IDocumentDiff2>,
		renderDiffImmediately: boolean,
		@IEditorService private readonly _editorService: IEditorService,
		@IAccessibilitySignalService private readonly _accessibilitySignalsService: IAccessibilitySignalService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		this._diffLineDecorations = _editor.createDecorationsCollection();
		const codeEditorObs = observableCodeEditor(_editor);

		this._diffLineDecorations = this._editor.createDecorationsCollection(); // tracks the line range w/o visuals (used for navigate)
		this._diffVisualDecorations = this._editor.createDecorationsCollection(); // tracks the real diff with character level inserts

		const enabledObs = derived(r => {
			if (!isEqual(codeEditorObs.model.read(r)?.uri, documentDiffInfo.read(r).modifiedModel.uri)) {
				return false;
			}
			if (this._editor.getOption(EditorOption.inDiffEditor) && !instantiationService.invokeFunction(isTextDiffEditorForEntry, _entry, this._editor)) {
				return false;
			}
			return true;
		});


		// update decorations
		this._store.add(autorun(r => {

			if (!enabledObs.read(r)) {
				this._diffLineDecorations.clear();
				return;
			}

			const data: IModelDeltaDecoration[] = [];
			const diff = documentDiffInfo.read(r);
			for (const diffEntry of diff.changes) {
				data.push({
					range: diffEntry.modified.toInclusiveRange() ?? new Range(diffEntry.modified.startLineNumber, 1, diffEntry.modified.startLineNumber, Number.MAX_SAFE_INTEGER),
					options: ChatEditingCodeEditorIntegration._diffLineDecorationData
				});
			}
			this._diffLineDecorations.set(data);
		}));

		// INIT current index when: enabled, not streaming anymore, once per request, and when having changes
		let lastModifyingRequestId: string | undefined;
		this._store.add(autorun(r => {

			if (enabledObs.read(r)
				&& !_entry.isCurrentlyBeingModifiedBy.read(r)
				&& lastModifyingRequestId !== _entry.lastModifyingRequestId
				&& !documentDiffInfo.read(r).identical
			) {
				lastModifyingRequestId = _entry.lastModifyingRequestId;
				const position = _editor.getPosition() ?? new Position(1, 1);
				const ranges = this._diffLineDecorations.getRanges();
				let initialIndex = ranges.findIndex(r => r.containsPosition(position));
				if (initialIndex < 0) {
					initialIndex = 0;
					for (; initialIndex < ranges.length - 1; initialIndex++) {
						const range = ranges[initialIndex];
						if (range.endLineNumber >= position.lineNumber) {
							break;
						}
					}
				}
				this._currentIndex.set(initialIndex, undefined);
				_editor.revealRange(ranges[initialIndex]);
			}
		}));

		// render diff decorations
		this._store.add(autorun(r => {

			if (!enabledObs.read(r)) {
				this._clearDiffRendering();
				return;
			}

			// done: render diff
			if (!_entry.isCurrentlyBeingModifiedBy.read(r) || renderDiffImmediately) {
				const isDiffEditor = this._editor.getOption(EditorOption.inDiffEditor);

				codeEditorObs.getOption(EditorOption.fontInfo).read(r);
				codeEditorObs.getOption(EditorOption.lineHeight).read(r);

				const reviewMode = _entry.reviewMode.read(r);
				const diff = documentDiffInfo.read(r);
				this._updateDiffRendering(diff, reviewMode, isDiffEditor);
			}
		}));

		const _ctxCursorInChangeRange = ctxCursorInChangeRange.bindTo(contextKeyService);

		// accessibility: signals while cursor changes
		// ctx: cursor in change range
		this._store.add(autorun(r => {
			const position = codeEditorObs.positions.read(r)?.at(0);
			if (!position || !enabledObs.read(r)) {
				_ctxCursorInChangeRange.reset();
				return;
			}

			const diff = documentDiffInfo.read(r);
			const changeAtCursor = diff.changes.find(m => m.modified.contains(position.lineNumber) || m.modified.isEmpty && m.modified.startLineNumber === position.lineNumber);

			_ctxCursorInChangeRange.set(!!changeAtCursor);

			if (changeAtCursor) {
				let signal: AccessibilitySignal;
				if (changeAtCursor.modified.isEmpty) {
					signal = AccessibilitySignal.diffLineDeleted;
				} else if (changeAtCursor.original.isEmpty) {
					signal = AccessibilitySignal.diffLineInserted;
				} else {
					signal = AccessibilitySignal.diffLineModified;
				}
				this._accessibilitySignalsService.playSignal(signal, { source: 'chatEditingEditor.cursorPositionChanged' });
			}
		}));

		// accessibility: diff view
		this._store.add(autorun(r => {

			const visible = this._accessibleDiffViewVisible.read(r);

			if (!visible || !enabledObs.read(r)) {
				return;
			}

			const accessibleDiffWidget = new AccessibleDiffViewContainer();
			_editor.addOverlayWidget(accessibleDiffWidget);
			r.store.add(toDisposable(() => _editor.removeOverlayWidget(accessibleDiffWidget)));

			r.store.add(instantiationService.createInstance(
				AccessibleDiffViewer,
				accessibleDiffWidget.getDomNode(),
				enabledObs,
				(visible, tx) => this._accessibleDiffViewVisible.set(visible, tx),
				constObservable(true),
				codeEditorObs.layoutInfo.map((v, r) => v.width),
				codeEditorObs.layoutInfo.map((v, r) => v.height),
				documentDiffInfo.map(diff => diff.changes.slice()),
				instantiationService.createInstance(AccessibleDiffViewerModel, documentDiffInfo, _editor),
			));
		}));


		// ---- readonly while streaming

		let actualOptions: IEditorOptions | undefined;

		const restoreActualOptions = () => {
			if (actualOptions !== undefined) {
				this._editor.updateOptions(actualOptions);
				actualOptions = undefined;
			}
		};

		this._store.add(toDisposable(restoreActualOptions));

		const renderAsBeingModified = derived(this, r => {
			return enabledObs.read(r) && Boolean(_entry.isCurrentlyBeingModifiedBy.read(r));
		});

		this._store.add(autorun(r => {
			const value = renderAsBeingModified.read(r);
			if (value) {

				actualOptions ??= {
					readOnly: this._editor.getOption(EditorOption.readOnly),
					stickyScroll: this._editor.getOption(EditorOption.stickyScroll),
					codeLens: this._editor.getOption(EditorOption.codeLens),
					guides: this._editor.getOption(EditorOption.guides)
				};

				this._editor.updateOptions({
					readOnly: true,
					stickyScroll: { enabled: false },
					codeLens: false,
					guides: { indentation: false, bracketPairs: false }
				});
			} else {
				restoreActualOptions();
			}
		}));
	}

	dispose(): void {
		this._clear();
		this._store.dispose();
	}

	private _clear() {
		this._diffLineDecorations.clear();
		this._clearDiffRendering();
		this._currentIndex.set(-1, undefined);
	}

	// ---- diff rendering logic

	private _clearDiffRendering() {
		this._editor.changeViewZones((viewZoneChangeAccessor) => {
			for (const id of this._viewZones) {
				viewZoneChangeAccessor.removeZone(id);
			}
		});
		this._viewZones = [];
		this._diffHunksRenderStore.clear();
		for (const widget of this._diffHunkWidgetPool.free) {
			widget.remove();
		}
		this._diffVisualDecorations.clear();
	}

	private _updateDiffRendering(diff: IDocumentDiff2, reviewMode: boolean, diffMode: boolean): void {

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
			const mightContainNonBasicASCII = diff.originalModel.mightContainNonBasicASCII();
			const mightContainRTL = diff.originalModel.mightContainRTL();
			const renderOptions = RenderOptions.fromEditor(this._editor);
			const editorLineCount = this._editor.getModel()?.getLineCount();

			for (const diffEntry of diff.changes) {

				const originalRange = diffEntry.original;
				diff.originalModel.tokenization.forceTokenization(Math.max(1, originalRange.endLineNumberExclusive - 1));
				const source = new LineSource(
					originalRange.mapToLineArray(l => diff.originalModel.tokenization.getLineTokens(l)),
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

				if (!diffEntry.modified.isEmpty) {
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

				let extraLines = 0;
				if (reviewMode && !diffMode) {
					const domNode = document.createElement('div');
					domNode.className = 'chat-editing-original-zone view-lines line-delete monaco-mouse-cursor-text';
					const result = renderLines(source, renderOptions, decorations, domNode);
					extraLines = result.heightInLines;
					if (!isCreatedContent) {

						const viewZoneData: IViewZone = {
							afterLineNumber: diffEntry.modified.startLineNumber - 1,
							heightInLines: result.heightInLines,
							domNode,
							ordinal: 50000 + 2 // more than https://github.com/microsoft/vscode/blob/bf52a5cfb2c75a7327c9adeaefbddc06d529dcad/src/vs/workbench/contrib/inlineChat/browser/inlineChatZoneWidget.ts#L42
						};

						this._viewZones.push(viewZoneChangeAccessor.addZone(viewZoneData));
					}
				}

				if (reviewMode || diffMode) {

					// Add content widget for each diff change
					let widget = this._diffHunkWidgetPool.get();
					if (!widget) {
						// make a new one
						widget = this._editor.invokeWithinContext(accessor => {
							const instaService = accessor.get(IInstantiationService);
							return instaService.createInstance(DiffHunkWidget, this._editor, diff, diffEntry, this._editor.getModel()!.getVersionId(), isCreatedContent ? 0 : extraLines);
						});
					} else {
						widget.update(diff, diffEntry, this._editor.getModel()!.getVersionId(), isCreatedContent ? 0 : extraLines);
					}
					this._diffHunksRenderStore.add(toDisposable(() => {
						this._diffHunkWidgetPool.putBack(widget);
					}));

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

			this._diffVisualDecorations.set(!diffMode ? modifiedVisualDecorations : []);
		});

		const diffHunkDecoCollection = this._editor.createDecorationsCollection(diffHunkDecorations);

		this._diffHunksRenderStore.add(toDisposable(() => {
			diffHunkDecoCollection.clear();
		}));

		// HIDE pooled widgets that are not used
		for (const extraWidget of this._diffHunkWidgetPool.free) {
			extraWidget.remove();
		}

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


		this._diffHunksRenderStore.add(this._editor.onMouseUp(e => {
			// set approximate position when clicking on view zone
			if (e.target.type === MouseTargetType.CONTENT_VIEW_ZONE) {
				const zone = e.target.detail;
				const idx = this._viewZones.findIndex(id => id === zone.viewZoneId);
				if (idx >= 0) {
					this._editor.setPosition(e.target.position);
					this._editor.focus();
				}
			}
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

	enableAccessibleDiffView(): void {
		this._accessibleDiffViewVisible.set(true, undefined);
	}

	// ---- navigation logic

	reveal(firstOrLast: boolean, preserveFocus?: boolean): void {

		const decorations = this._diffLineDecorations
			.getRanges()
			.sort((a, b) => Range.compareRangesUsingStarts(a, b));

		const index = firstOrLast ? 0 : decorations.length - 1;
		const range = decorations.at(index);
		if (range) {
			this._editor.setPosition(range.getStartPosition());
			this._editor.revealRange(range);
			if (!preserveFocus) {
				this._editor.focus();
			}
			this._currentIndex.set(index, undefined);
		}
	}

	next(wrap: boolean): boolean {
		return this._reveal(true, !wrap);
	}

	previous(wrap: boolean): boolean {
		return this._reveal(false, !wrap);
	}

	private _reveal(next: boolean, strict: boolean) {

		const position = this._editor.getPosition();
		if (!position) {
			this._currentIndex.set(-1, undefined);
			return false;
		}

		const decorations = this._diffLineDecorations
			.getRanges()
			.sort((a, b) => Range.compareRangesUsingStarts(a, b));

		if (decorations.length === 0) {
			this._currentIndex.set(-1, undefined);
			return false;
		}

		let newIndex: number = -1;
		for (let i = 0; i < decorations.length; i++) {
			const range = decorations[i];
			if (range.containsPosition(position)) {
				newIndex = i + (next ? 1 : -1);
				break;
			} else if (Position.isBefore(position, range.getStartPosition())) {
				newIndex = next ? i : i - 1;
				break;
			}
		}

		if (strict && (newIndex < 0 || newIndex >= decorations.length)) {
			// NO change
			return false;
		}

		newIndex = (newIndex + decorations.length) % decorations.length;

		this._currentIndex.set(newIndex, undefined);

		const targetRange = decorations[newIndex];
		const targetPosition = next ? targetRange.getStartPosition() : targetRange.getEndPosition();
		this._editor.setPosition(targetPosition);
		this._editor.revealPositionInCenter(targetRange.getStartPosition().delta(-1));
		this._editor.focus();

		return true;
	}

	// --- hunks

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

	async rejectNearestChange(closestWidget?: IModifiedFileEntryChangeHunk): Promise<void> {
		closestWidget = closestWidget ?? this._findClosestWidget();
		if (closestWidget instanceof DiffHunkWidget) {
			await closestWidget.reject();
			this.next(true);
		}
	}

	async acceptNearestChange(closestWidget?: IModifiedFileEntryChangeHunk): Promise<void> {
		closestWidget = closestWidget ?? this._findClosestWidget();
		if (closestWidget instanceof DiffHunkWidget) {
			await closestWidget.accept();
			this.next(true);
		}
	}

	async toggleDiff(widget: IModifiedFileEntryChangeHunk | undefined, show?: boolean): Promise<void> {
		if (!this._editor.hasModel()) {
			return;
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

		// Use the 'show' argument to control the diff state if provided
		if (show !== undefined ? show : !isDiffEditor) {
			// Open DIFF editor
			const diffEditor = await this._editorService.openEditor({
				original: { resource: this._entry.originalURI },
				modified: { resource: this._entry.modifiedURI },
				options: { selection },
				label: localize('diff.generic', '{0} (changes from chat)', basename(this._entry.modifiedURI))
			});

			if (diffEditor && diffEditor.input) {
				diffEditor.getControl()?.setSelection(selection);
				const d = autorun(r => {
					const state = this._entry.state.read(r);
					if (state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected) {
						d.dispose();
						const editorIdents: IEditorIdentifier[] = [];
						for (const candidate of this._editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
							if (isDiffEditorInput(candidate.editor)
								&& isEqual(candidate.editor.original.resource, this._entry.originalURI)
								&& isEqual(candidate.editor.modified.resource, this._entry.modifiedURI)
							) {
								editorIdents.push(candidate);
							}
						}

						this._editorService.closeEditors(editorIdents);
					}
				});
			}
		} else {
			// Open normal editor
			await this._editorService.openEditor({
				resource: this._entry.modifiedURI,
				options: {
					selection,
					selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport
				}
			});
		}
	}
}

class DiffHunkWidget implements IOverlayWidget, IModifiedFileEntryChangeHunk {

	private static _idPool = 0;
	private readonly _id: string = `diff-change-widget-${DiffHunkWidget._idPool++}`;

	private readonly _domNode: HTMLElement;
	private readonly _store = new DisposableStore();
	private _position: IOverlayWidgetPosition | undefined;
	private _lastStartLineNumber: number | undefined;
	private _removed: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		private _diffInfo: IDocumentDiff2,
		private _change: DetailedLineRangeMapping,
		private _versionId: number,
		private _lineDelta: number,
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
			actionViewItemProvider: (action, options) => {
				if (!action.class) {
					return new class extends ActionViewItem {
						constructor() {
							super(undefined, action, { ...options, keybindingNotRenderedWithLabel: true /* hide keybinding for actions without icon */, icon: false, label: true });
						}
					};
				}
				return undefined;
			}
		});

		this._store.add(toolbar);
		this._store.add(toolbar.actionRunner.onWillRun(_ => _editor.focus()));
		this._editor.addOverlayWidget(this);
	}

	update(diffInfo: IDocumentDiff2, change: DetailedLineRangeMapping, versionId: number, lineDelta: number): void {
		this._diffInfo = diffInfo;
		this._change = change;
		this._versionId = versionId;
		this._lineDelta = lineDelta;
	}

	dispose(): void {
		this._store.dispose();
		this._editor.removeOverlayWidget(this);
		this._removed = true;
	}

	getId(): string {
		return this._id;
	}

	layout(startLineNumber: number): void {

		const lineHeight = this._editor.getOption(EditorOption.lineHeight);
		const { contentLeft, contentWidth, verticalScrollbarWidth } = this._editor.getLayoutInfo();
		const scrollTop = this._editor.getScrollTop();

		this._position = {
			stackOrdinal: 1,
			preference: {
				top: this._editor.getTopForLineNumber(startLineNumber) - scrollTop - (lineHeight * this._lineDelta),
				left: contentLeft + contentWidth - (2 * verticalScrollbarWidth + getTotalWidth(this._domNode))
			}
		};

		if (this._removed) {
			this._removed = false;
			this._editor.addOverlayWidget(this);
		} else {
			this._editor.layoutOverlayWidget(this);
		}
		this._lastStartLineNumber = startLineNumber;
	}

	remove(): void {
		this._editor.removeOverlayWidget(this);
		this._removed = true;
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

	async reject(): Promise<boolean> {
		if (this._versionId !== this._editor.getModel()?.getVersionId()) {
			return false;
		}
		return await this._diffInfo.undo(this._change);
	}

	async accept(): Promise<boolean> {
		if (this._versionId !== this._editor.getModel()?.getVersionId()) {
			return false;
		}
		return this._diffInfo.keep(this._change);
	}
}


class AccessibleDiffViewContainer implements IOverlayWidget {

	private readonly _domNode: HTMLElement;

	constructor() {
		this._domNode = document.createElement('div');
		this._domNode.className = 'accessible-diff-view';
		this._domNode.style.width = '100%';
		this._domNode.style.position = 'absolute';
	}

	getId(): string {
		return 'chatEdits.accessibleDiffView';
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	getPosition(): IOverlayWidgetPosition | null {
		return {
			preference: { top: 0, left: 0 },
			stackOrdinal: 1
		};
	}
}

class AccessibleDiffViewerModel implements IAccessibleDiffViewerModel {
	constructor(
		private readonly _documentDiffInfo: IObservable<IDocumentDiff2>,
		private readonly _editor: ICodeEditor,
	) { }

	getOriginalModel() {
		return this._documentDiffInfo.get().originalModel;
	}

	getOriginalOptions() {
		return this._editor.getOptions();
	}

	originalReveal(range: Range) {
		const changes = this._documentDiffInfo.get().changes;
		const idx = changes.findIndex(value => value.original.intersect(LineRange.fromRange(range)));
		if (idx >= 0) {
			range = changes[idx].modified.toInclusiveRange() ?? range;
		}
		this.modifiedReveal(range);
	}

	getModifiedModel() {
		return this._editor.getModel()!;
	}

	getModifiedOptions() {
		return this._editor.getOptions();
	}

	modifiedReveal(range: Range) {
		if (range) {
			this._editor.revealRange(range);
			this._editor.setSelection(range);
		}
		this._editor.focus();
	}

	modifiedSetSelection(range: Range) {
		this._editor.setSelection(range);
	}

	modifiedFocus() {
		this._editor.focus();
	}

	getModifiedPosition() {
		return this._editor.getPosition() ?? undefined;
	}
}
