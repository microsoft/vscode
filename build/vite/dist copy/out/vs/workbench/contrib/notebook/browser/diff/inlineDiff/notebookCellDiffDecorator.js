/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorunWithStore, derived, observableFromEvent } from '../../../../../../base/common/observable.js';
import { ThrottledDelayer } from '../../../../../../base/common/async.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { themeColorFromId } from '../../../../../../base/common/themables.js';
import { RenderOptions, LineSource, renderLines } from '../../../../../../editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js';
import { diffAddDecoration, diffWholeLineAddDecoration, diffDeleteDecoration } from '../../../../../../editor/browser/widget/diffEditor/registrations.contribution.js';
import { OverviewRulerLane } from '../../../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../../../editor/common/model/textModel.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from '../../../../scm/common/quickDiff.js';
import { INotebookOriginalCellModelFactory } from './notebookOriginalCellModelFactory.js';
import { InlineDecoration } from '../../../../../../editor/common/viewModel/inlineDecorations.js';
//TODO: allow client to set read-only - chateditsession should set read-only while making changes
let NotebookCellDiffDecorator = class NotebookCellDiffDecorator extends DisposableStore {
    constructor(notebookEditor, modifiedCell, originalCell, editor, _editorWorkerService, originalCellModelFactory) {
        super();
        this.modifiedCell = modifiedCell;
        this.originalCell = originalCell;
        this.editor = editor;
        this._editorWorkerService = _editorWorkerService;
        this.originalCellModelFactory = originalCellModelFactory;
        this._viewZones = [];
        this.throttledDecorator = this.add(new ThrottledDelayer(50));
        this.perEditorDisposables = this.add(new DisposableStore());
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
                    if (e.hasChanged(59 /* EditorOption.fontInfo */) || e.hasChanged(75 /* EditorOption.lineHeight */)) {
                        this.update(editor);
                    }
                }));
                this.update(editor);
            }
        }));
    }
    update(editor) {
        this.throttledDecorator.trigger(() => this._updateImpl(editor));
    }
    async _updateImpl(editor) {
        if (this.isDisposed) {
            return;
        }
        if (editor.getOption(70 /* EditorOption.inDiffEditor */)) {
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
        const diff = await this._editorWorkerService.computeDiff(originalModel.uri, model.uri, { computeMoves: true, ignoreTrimWhitespace: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER }, 'advanced');
        if (this.isDisposed) {
            return;
        }
        if (diff && !diff.identical && this.modifiedCell.textModel && originalModel && model === editor.getModel() && editor.getModel()?.getVersionId() === version) {
            this._updateWithDiff(editor, originalModel, diff, this.modifiedCell.textModel);
        }
        else {
            this.perEditorDisposables.clear();
        }
    }
    getOrCreateOriginalModel(editor) {
        if (!this._originalModel) {
            const model = editor.getModel();
            if (!model) {
                return;
            }
            this._originalModel = this.add(this.originalCellModelFactory.getOrCreate(model.uri, this.originalCell.getValue(), model.getLanguageId(), this.modifiedCell.cellKind)).object;
        }
        return this._originalModel;
    }
    _updateWithDiff(editor, originalModel, diff, currentModel) {
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
            stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */
        });
        const chatDiffWholeLineAddDecoration = ModelDecorationOptions.createDynamic({
            ...diffWholeLineAddDecoration,
            stickiness: 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */,
        });
        const createOverviewDecoration = (overviewRulerColor, minimapColor) => {
            return ModelDecorationOptions.createDynamic({
                description: 'chat-editing-decoration',
                overviewRuler: { color: themeColorFromId(overviewRulerColor), position: OverviewRulerLane.Left },
                minimap: { color: themeColorFromId(minimapColor), position: 2 /* MinimapPosition.Gutter */ },
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
            const modifiedVisualDecorations = [];
            const mightContainNonBasicASCII = originalModel.mightContainNonBasicASCII();
            const mightContainRTL = originalModel.mightContainRTL();
            const renderOptions = RenderOptions.fromEditor(this.editor);
            const editorLineCount = currentModel.getLineCount();
            for (const diffEntry of diff.changes) {
                const originalRange = diffEntry.original;
                originalModel.tokenization.forceTokenization(Math.max(1, originalRange.endLineNumberExclusive - 1));
                const source = new LineSource(originalRange.mapToLineArray(l => originalModel.tokenization.getLineTokens(l)), [], mightContainNonBasicASCII, mightContainRTL);
                const decorations = [];
                for (const i of diffEntry.innerChanges || []) {
                    decorations.push(new InlineDecoration(i.originalRange.delta(-(diffEntry.original.startLineNumber - 1)), diffDeleteDecoration.className, 0 /* InlineDecorationType.Regular */));
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
                        range: diffEntry.modified.toInclusiveRange(),
                        options: chatDiffWholeLineAddDecoration
                    });
                }
                if (diffEntry.original.isEmpty) {
                    // insertion
                    modifiedVisualDecorations.push({
                        range: diffEntry.modified.toInclusiveRange(),
                        options: addedDecoration
                    });
                }
                else if (diffEntry.modified.isEmpty) {
                    // deletion
                    modifiedVisualDecorations.push({
                        range: new Range(diffEntry.modified.startLineNumber - 1, 1, diffEntry.modified.startLineNumber, 1),
                        options: deletedDecoration
                    });
                }
                else {
                    // modification
                    modifiedVisualDecorations.push({
                        range: diffEntry.modified.toInclusiveRange(),
                        options: modifiedDecoration
                    });
                }
                const domNode = document.createElement('div');
                domNode.className = 'chat-editing-original-zone view-lines line-delete monaco-mouse-cursor-text';
                const result = renderLines(source, renderOptions, decorations, domNode);
                if (!isCreatedContent) {
                    const viewZoneData = {
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
};
NotebookCellDiffDecorator = __decorate([
    __param(4, IEditorWorkerService),
    __param(5, INotebookOriginalCellModelFactory)
], NotebookCellDiffDecorator);
export { NotebookCellDiffDecorator };
function areDiffsEqual(a, b) {
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
    }
    else if (!a && !b) {
        return true;
    }
    else {
        return false;
    }
}
function areLineRangeMappinsEqual(a, b) {
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
            const bInnerC = bChange.innerChanges[innerIdx];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tDZWxsRGlmZkRlY29yYXRvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvZGlmZi9pbmxpbmVEaWZmL25vdGVib29rQ2VsbERpZmZEZWNvcmF0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMzRixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFN0csT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFMUUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFFaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsV0FBVyxFQUFFLE1BQU0sa0dBQWtHLENBQUM7QUFDMUosT0FBTyxFQUFFLGlCQUFpQixFQUFFLDBCQUEwQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sa0ZBQWtGLENBQUM7QUFFdkssT0FBTyxFQUE4RSxpQkFBaUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3pKLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUd0RSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsOEJBQThCLEVBQUUsK0JBQStCLEVBQUUsNEJBQTRCLEVBQUUsOEJBQThCLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNuUCxPQUFPLEVBQUUsaUNBQWlDLEVB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