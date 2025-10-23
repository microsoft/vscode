/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorunWithStore, derived, observableFromEvent } from '../../../../../../base/common/observable.js';
import { INotebookEditor } from '../../notebookBrowser.js';
import { ThrottledDelayer } from '../../../../../../base/common/async.js';
import { ICodeEditor, IViewZone } from '../../../../../../editor/browser/editorBrowser.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { EditorOption } from '../../../../../../editor/common/config/editorOptions.js';
import { themeColorFromId } from '../../../../../../base/common/themables.js';
import { RenderOptions, LineSource, renderLines } from '../../../../../../editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { diffAddDecoration, diffWholeLineAddDecoration, diffDeleteDecoration } from '../../../../../../editor/browser/widget/diffEditor/registrations.contribution.js';
import { IDocumentDiff } from '../../../../../../editor/common/diff/documentDiffProvider.js';
import { ITextModel, TrackedRangeStickiness, MinimapPosition, IModelDeltaDecoration, OverviewRulerLane } from '../../../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../../../editor/common/model/textModel.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { NotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';
import { DetailedLineRangeMapping } from '../../../../../../editor/common/diff/rangeMapping.js';
import { minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from '../../../../scm/common/quickDiff.js';
import { INotebookOriginalCellModelFactory } from './notebookOriginalCellModelFactory.js';
import { InlineDecoration, InlineDecorationType } from '../../../../../../editor/common/viewModel/inlineDecorations.js';

//TODO: allow client to set read-only - chateditsession should set read-only while making changes
export class NotebookCellDiffDecorator extends DisposableStore {
	private _viewZones: string[] = [];
	private readonly throttledDecorator = new ThrottledDelayer(50);
	private diffForPreviouslyAppliedDecorators?: IDocumentDiff;

	private readonly perEditorDisposables = this.add(new DisposableStore());
	constructor(
		notebookEditor: INotebookEditor,
		public readonly modifiedCell: NotebookCellTextModel,
		public readonly originalCell: NotebookCellTextModel,
		private readonly editor: ICodeEditor,
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


		if (diff && !diff.identical && this.modifiedCell.textModel && originalModel && model === editor.getModel() && editor.getModel()?.getVersionId() === version) {
			this._updateWithDiff(editor, originalModel, diff, this.modifiedCell.textModel);
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

	private _updateWithDiff(editor: ICodeEditor, originalModel: ITextModel, diff: IDocumentDiff, currentModel: ITextModel): void {
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
			const modifiedVisualDecorations: IModelDeltaDecoration[] = [];
			const mightContainNonBasicASCII = originalModel.mightContainNonBasicASCII();
			const mightContainRTL = originalModel.mightContainRTL();
			const renderOptions = RenderOptions.fromEditor(this.editor);
			const editorLineCount = currentModel.getLineCount();
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
			}

			decorations.set(modifiedVisualDecorations);
		});
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
