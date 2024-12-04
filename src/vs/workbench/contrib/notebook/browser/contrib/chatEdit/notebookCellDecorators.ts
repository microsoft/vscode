/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, dispose, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, autorunWithStore, derived, observableFromEvent } from '../../../../../../base/common/observable.js';
import { IChatEditingService, ChatEditingSessionState } from '../../../../chat/common/chatEditingService.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { INotebookEditor } from '../../notebookBrowser.js';
import { ThrottledDelayer } from '../../../../../../base/common/async.js';
import { CellDiffInfo } from '../../diff/notebookDiffViewModel.js';
import { ICodeEditor, IViewZone } from '../../../../../../editor/browser/editorBrowser.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { EditorOption } from '../../../../../../editor/common/config/editorOptions.js';
import { themeColorFromId } from '../../../../../../base/common/themables.js';
import { RenderOptions, LineSource, renderLines } from '../../../../../../editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { diffAddDecoration, diffWholeLineAddDecoration, diffDeleteDecoration } from '../../../../../../editor/browser/widget/diffEditor/registrations.contribution.js';
import { IDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { ITextModel, TrackedRangeStickiness, MinimapPosition, IModelDeltaDecoration, OverviewRulerLane } from '../../../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../../../editor/common/model/textModel.js';
import { InlineDecoration, InlineDecorationType } from '../../../../../../editor/common/viewModel.js';
import { overviewRulerModifiedForeground, minimapGutterModifiedBackground, overviewRulerAddedForeground, minimapGutterAddedBackground, overviewRulerDeletedForeground, minimapGutterDeletedBackground } from '../../../../scm/browser/dirtydiffDecorator.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { NotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';
import { tokenizeToString } from '../../../../../../editor/common/languages/textToHtmlTokenizer.js';
import * as DOM from '../../../../../../base/browser/dom.js';
import { createTrustedTypesPolicy } from '../../../../../../base/browser/trustedTypes.js';
import { splitLines } from '../../../../../../base/common/strings.js';
import { DefaultLineHeight } from '../../diff/diffElementViewModel.js';
import { INotebookOriginalCellModelFactory } from './notebookOriginalCellModelFactory.js';
import { DetailedLineRangeMapping } from '../../../../../../editor/common/diff/rangeMapping.js';
import { isEqual } from '../../../../../../base/common/resources.js';


export class NotebookCellDiffDecorator extends DisposableStore {
	private _viewZones: string[] = [];
	private readonly throttledDecorator = new ThrottledDelayer(50);
	private diffForPreviouslyAppliedDecorators?: IDocumentDiff;

	private readonly perEditorDisposables = this.add(new DisposableStore());
	constructor(
		notebookEditor: INotebookEditor,
		public readonly modifiedCell: NotebookCellTextModel,
		public readonly originalCell: NotebookCellTextModel,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@INotebookOriginalCellModelFactory private readonly originalCellModelFactory: INotebookOriginalCellModelFactory,

	) {
		super();

		const onDidChangeVisibleRanges = observableFromEvent(notebookEditor.onDidChangeVisibleRanges, () => notebookEditor.visibleRanges);
		const editorObs = derived((r) => {
			const visibleRanges = onDidChangeVisibleRanges.read(r);
			const visibleCellHandles = visibleRanges.map(range => notebookEditor.getCellsInRange(range)).flat().map(c => c.handle);
			if (!visibleCellHandles.includes(modifiedCell.handle)) {
				return;
			}
			const editor = notebookEditor.codeEditors.find(item => item[0].handle === modifiedCell.handle)?.[1];
			if (editor?.getModel() !== this.modifiedCell.textModel) {
				return;
			}
			return editor;
		});

		this.add(autorunWithStore((r, store) => {
			const editor = editorObs.read(r);
			this.perEditorDisposables.clear();

			if (editor) {
				store.add(editor.onDidChangeModel(() => {
					this.perEditorDisposables.clear();
				}));
				store.add(editor.onDidChangeModelContent(() => {
					this.update(editor);
				}));
				store.add(editor.onDidChangeConfiguration((e) => {
					if (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.lineHeight)) {
						this.update(editor);
					}
				}));
				this.update(editor);
			}
		}));

		const shouldBeReadOnly = derived(this, r => {
			const editor = editorObs.read(r);
			if (!editor) {
				return false;
			}
			const value = this._chatEditingService.currentEditingSessionObs.read(r);
			if (!value || value.state.read(r) !== ChatEditingSessionState.StreamingEdits) {
				return false;
			}
			return value.entries.read(r).some(e => isEqual(e.modifiedURI, editor.getModel()?.uri));
		});


		let actualReadonly: boolean | undefined;
		let actualDeco: 'off' | 'editable' | 'on' | undefined;

		this.add(autorun((r) => {
			const editor = editorObs.read(r);
			if (!editor) {
				return;
			}
			const value = shouldBeReadOnly.read(r);
			if (value) {
				actualReadonly ??= editor.getOption(EditorOption.readOnly);
				actualDeco ??= editor.getOption(EditorOption.renderValidationDecorations);

				editor.updateOptions({
					readOnly: true,
					renderValidationDecorations: 'off'
				});
			} else {
				if (actualReadonly !== undefined && actualDeco !== undefined) {
					editor.updateOptions({
						readOnly: actualReadonly,
						renderValidationDecorations: actualDeco
					});
					actualReadonly = undefined;
					actualDeco = undefined;
				}
			}
		}));
	}

	public update(editor: ICodeEditor): void {
		this.throttledDecorator.trigger(() => this._updateImpl(editor));
	}

	private async _updateImpl(editor: ICodeEditor) {
		if (this.isDisposed) {
			return;
		}
		if (editor.getOption(EditorOption.inDiffEditor)) {
			this.perEditorDisposables.clear();
			return;
		}
		const model = editor.getModel();
		if (!model || model !== this.modifiedCell.textModel) {
			this.perEditorDisposables.clear();
			return;
		}

		const originalModel = this.getOrCreateOriginalModel(editor);
		if (!originalModel) {
			this.perEditorDisposables.clear();
			return;
		}
		const version = model.getVersionId();
		const diff = await this._editorWorkerService.computeDiff(
			originalModel.uri,
			model.uri,
			{ computeMoves: true, ignoreTrimWhitespace: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER },
			'advanced'
		);


		if (this.isDisposed) {
			return;
		}


		if (diff && !diff.identical && originalModel && model === editor.getModel() && editor.getModel()?.getVersionId() === version) {
			this._updateWithDiff(editor, originalModel, diff);
		} else {
			this.perEditorDisposables.clear();
		}
	}

	private _originalModel?: ITextModel;
	private getOrCreateOriginalModel(editor: ICodeEditor) {
		if (!this._originalModel) {
			const model = editor.getModel();
			if (!model) {
				return;
			}
			this._originalModel = this.add(this.originalCellModelFactory.getOrCreate(model.uri, this.originalCell.getValue(), model.getLanguageId(), this.modifiedCell.cellKind)).object;
		}
		return this._originalModel;
	}

	private _updateWithDiff(editor: ICodeEditor, originalModel: ITextModel | undefined, diff: IDocumentDiff): void {
		if (areDiffsEqual(diff, this.diffForPreviouslyAppliedDecorators)) {
			return;
		}
		this.perEditorDisposables.clear();
		const decorations = editor.createDecorationsCollection();
		this.perEditorDisposables.add(toDisposable(() => {
			editor.changeViewZones((viewZoneChangeAccessor) => {
				for (const id of this._viewZones) {
					viewZoneChangeAccessor.removeZone(id);
				}
			});
			this._viewZones = [];
			decorations.clear();
			this.diffForPreviouslyAppliedDecorators = undefined;
		}));

		this.diffForPreviouslyAppliedDecorators = diff;

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

		editor.changeViewZones((viewZoneChangeAccessor) => {
			for (const id of this._viewZones) {
				viewZoneChangeAccessor.removeZone(id);
			}
			this._viewZones = [];
			const modifiedDecorations: IModelDeltaDecoration[] = [];
			const mightContainNonBasicASCII = originalModel?.mightContainNonBasicASCII();
			const mightContainRTL = originalModel?.mightContainRTL();
			const renderOptions = RenderOptions.fromEditor(editor);

			for (const diffEntry of diff.changes) {
				const originalRange = diffEntry.original;
				if (originalModel) {
					originalModel.tokenization.forceTokenization(Math.max(1, originalRange.endLineNumberExclusive - 1));
				}
				const source = new LineSource(
					(originalRange.length && originalModel) ? originalRange.mapToLineArray(l => originalModel.tokenization.getLineTokens(l)) : [],
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
						range: diffEntry.modified.toInclusiveRange()!, options: chatDiffWholeLineAddDecoration
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
			}

			decorations.set(modifiedDecorations);
		});
	}
}

export class NotebookInsertedCellDecorator extends Disposable {
	private readonly decorators = this._register(new DisposableStore());
	constructor(
		private readonly notebookEditor: INotebookEditor,
	) {
		super();

	}
	public apply(diffInfo: CellDiffInfo[]) {
		const model = this.notebookEditor.textModel;
		if (!model) {
			return;
		}
		const cells = diffInfo.filter(diff => diff.type === 'insert').map((diff) => model.cells[diff.modifiedCellIndex]);
		const ids = this.notebookEditor.deltaCellDecorations([], cells.map(cell => ({
			handle: cell.handle,
			options: { className: 'nb-insertHighlight', outputClassName: 'nb-insertHighlight' }
		})));
		this.clear();
		this.decorators.add(toDisposable(() => {
			if (!this.notebookEditor.isDisposed) {
				this.notebookEditor.deltaCellDecorations(ids, []);
			}
		}));
	}
	public clear() {
		this.decorators.clear();
	}
}

const ttPolicy = createTrustedTypesPolicy('notebookChatEditController', { createHTML: value => value });

export interface INotebookDeletedCellDecorator {
	getTop(deletedIndex: number): number | undefined;
}

export class NotebookDeletedCellDecorator extends Disposable implements INotebookDeletedCellDecorator {
	private readonly zoneRemover = this._register(new DisposableStore());
	private readonly createdViewZones = new Map<number, string>();
	private readonly deletedCellInfos = new Map<number, { height: number; previousIndex: number; offset: number }>();
	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();
	}

	public getTop(deletedIndex: number) {
		const info = this.deletedCellInfos.get(deletedIndex);
		if (!info) {
			return;
		}
		const cells = this._notebookEditor.getCellsInRange({ start: info.previousIndex, end: info.previousIndex + 1 });
		if (!cells.length) {
			return;
		}
		const cell = cells[0];
		const cellHeight = this._notebookEditor.getHeightOfElement(cell);
		const top = this._notebookEditor.getAbsoluteTopOfElement(cell);
		return top + cellHeight + info.offset;
	}

	public apply(diffInfo: CellDiffInfo[], original: NotebookTextModel): void {
		this.clear();

		let currentIndex = 0;
		const deletedCellsToRender: { cells: { cell: NotebookCellTextModel; originalIndex: number; previousIndex: number }[]; index: number } = { cells: [], index: 0 };
		diffInfo.forEach(diff => {
			if (diff.type === 'delete') {
				const deletedCell = original.cells[diff.originalCellIndex];
				if (deletedCell) {
					deletedCellsToRender.cells.push({ cell: deletedCell, originalIndex: diff.originalCellIndex, previousIndex: currentIndex });
					deletedCellsToRender.index = currentIndex;
				}
			} else {
				if (deletedCellsToRender.cells.length) {
					this._createWidget(deletedCellsToRender.index + 1, deletedCellsToRender.cells);
					deletedCellsToRender.cells.length = 0;
				}
				currentIndex = diff.modifiedCellIndex;
			}
		});
		if (deletedCellsToRender.cells.length) {
			this._createWidget(deletedCellsToRender.index + 1, deletedCellsToRender.cells);
		}
	}

	public clear() {
		this.deletedCellInfos.clear();
		this.zoneRemover.clear();
	}


	private _createWidget(index: number, cells: { cell: NotebookCellTextModel; originalIndex: number; previousIndex: number }[]) {
		this._createWidgetImpl(index, cells);
	}
	private async _createWidgetImpl(index: number, cells: { cell: NotebookCellTextModel; originalIndex: number; previousIndex: number }[]) {
		const rootContainer = document.createElement('div');
		const widgets: NotebookDeletedCellWidget[] = [];
		const heights = await Promise.all(cells.map(async cell => {
			const widget = new NotebookDeletedCellWidget(this._notebookEditor, cell.cell.getValue(), cell.cell.language, rootContainer, cell.originalIndex, this.languageService);
			widgets.push(widget);
			const height = await widget.render();
			this.deletedCellInfos.set(cell.originalIndex, { height, previousIndex: cell.previousIndex, offset: 0 });
			return height;
		}));

		Array.from(this.deletedCellInfos.keys()).sort((a, b) => a - b).forEach((originalIndex) => {
			const previousDeletedCell = this.deletedCellInfos.get(originalIndex - 1);
			if (previousDeletedCell) {
				const deletedCell = this.deletedCellInfos.get(originalIndex);
				if (deletedCell) {
					deletedCell.offset = previousDeletedCell.height + previousDeletedCell.offset;
				}
			}
		});

		const totalHeight = heights.reduce<number>((prev, curr) => prev + curr, 0);

		this._notebookEditor.changeViewZones(accessor => {
			const notebookViewZone = {
				afterModelPosition: index,
				heightInPx: totalHeight + 4,
				domNode: rootContainer
			};

			const id = accessor.addZone(notebookViewZone);
			accessor.layoutZone(id);
			this.createdViewZones.set(index, id);
			this.zoneRemover.add(toDisposable(() => {
				if (this.createdViewZones.get(index) === id) {
					this.createdViewZones.delete(index);
				}
				if (!this._notebookEditor.isDisposed) {
					this._notebookEditor.changeViewZones(accessor => {
						accessor.removeZone(id);
						dispose(widgets);
					});
				}
			}));
		});
	}

}

export class NotebookDeletedCellWidget extends Disposable {
	private readonly container: HTMLElement;
	constructor(
		private readonly _notebookEditor: INotebookEditor,
		// private readonly _index: number,
		private readonly code: string,
		private readonly language: string,
		container: HTMLElement,
		public readonly originalIndex: number,
		@ILanguageService private readonly languageService: ILanguageService,
	) {
		super();
		this.container = DOM.append(container, document.createElement('div'));
		this._register(toDisposable(() => {
			container.removeChild(this.container);
		}));
	}

	public async render() {
		const code = this.code;
		const languageId = this.language;
		const codeHtml = await tokenizeToString(this.languageService, code, languageId);

		// const colorMap = this.getDefaultColorMap();
		const fontInfo = this._notebookEditor.getBaseCellEditorOptions(languageId).value;
		const fontFamilyVar = '--notebook-editor-font-family';
		const fontSizeVar = '--notebook-editor-font-size';
		const fontWeightVar = '--notebook-editor-font-weight';
		// If we have any editors, then use left layout of one of those.
		const editor = this._notebookEditor.codeEditors.map(c => c[1]).find(c => c);
		const layoutInfo = editor?.getOptions().get(EditorOption.layoutInfo);

		const style = ``
			+ `font-family: var(${fontFamilyVar});`
			+ `font-weight: var(${fontWeightVar});`
			+ `font-size: var(${fontSizeVar});`
			+ fontInfo.lineHeight ? `line-height: ${fontInfo.lineHeight}px;` : ''
				+ layoutInfo?.contentLeft ? `margin-left: ${layoutInfo}px;` : ''
		+ `white-space: pre;`;



		const rootContainer = this.container;
		rootContainer.classList.add('code-cell-row');
		const container = DOM.append(rootContainer, DOM.$('.cell-inner-container'));
		const focusIndicatorLeft = DOM.append(container, DOM.$('.cell-focus-indicator.cell-focus-indicator-side.cell-focus-indicator-left'));
		const cellContainer = DOM.append(container, DOM.$('.cell.code'));
		DOM.append(focusIndicatorLeft, DOM.$('div.execution-count-label'));
		const editorPart = DOM.append(cellContainer, DOM.$('.cell-editor-part'));
		let editorContainer = DOM.append(editorPart, DOM.$('.cell-editor-container'));
		editorContainer = DOM.append(editorContainer, DOM.$('.code', { style }));
		if (fontInfo.fontFamily) {
			editorContainer.style.setProperty(fontFamilyVar, fontInfo.fontFamily);
		}
		if (fontInfo.fontSize) {
			editorContainer.style.setProperty(fontSizeVar, `${fontInfo.fontSize}px`);
		}
		if (fontInfo.fontWeight) {
			editorContainer.style.setProperty(fontWeightVar, fontInfo.fontWeight);
		}
		editorContainer.innerHTML = (ttPolicy?.createHTML(codeHtml) || codeHtml) as string;

		const lineCount = splitLines(code).length;
		const height = (lineCount * (fontInfo.lineHeight || DefaultLineHeight)) + 12 + 12; // We have 12px top and bottom in generated code HTML;
		const totalHeight = height + 16 + 16;

		return totalHeight;
	}
}

function areDiffsEqual(a: IDocumentDiff | undefined, b: IDocumentDiff | undefined): boolean {
	if (a && b) {
		if (a.changes.length !== b.changes.length) {
			return false;
		}
		if (a.moves.length !== b.moves.length) {
			return false;
		}
		if (!areLineRangeMappinsEqual(a.changes, b.changes)) {
			return false;
		}
		if (!a.moves.some((move, i) => {
			const bMove = b.moves[i];
			if (!areLineRangeMappinsEqual(move.changes, bMove.changes)) {
				return true;
			}
			if (move.lineRangeMapping.changedLineCount !== bMove.lineRangeMapping.changedLineCount) {
				return true;
			}
			if (!move.lineRangeMapping.modified.equals(bMove.lineRangeMapping.modified)) {
				return true;
			}
			if (!move.lineRangeMapping.original.equals(bMove.lineRangeMapping.original)) {
				return true;
			}
			return false;
		})) {
			return false;
		}
		return true;
	} else if (!a && !b) {
		return true;
	} else {
		return false;
	}
}

function areLineRangeMappinsEqual(a: readonly DetailedLineRangeMapping[], b: readonly DetailedLineRangeMapping[]): boolean {
	if (a.length !== b.length) {
		return false;
	}
	if (a.some((c, i) => {
		const bChange = b[i];
		if (c.changedLineCount !== bChange.changedLineCount) {
			return true;
		}
		if ((c.innerChanges || []).length !== (bChange.innerChanges || []).length) {
			return true;
		}
		if ((c.innerChanges || []).some((innerC, innerIdx) => {
			const bInnerC = bChange.innerChanges![innerIdx];
			if (!innerC.modifiedRange.equalsRange(bInnerC.modifiedRange)) {
				return true;
			}
			if (!innerC.originalRange.equalsRange(bInnerC.originalRange)) {
				return true;
			}
			return false;
		})) {
			return true;
		}

		return false;
	})) {
		return false;
	}
	return true;
}
