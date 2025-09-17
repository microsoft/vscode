/*---------------------------------------------------------------------------------------------
 * Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { INotebookEditor } from '../../../contrib/notebook/browser/notebookBrowser.js';
import { IModelDeltaDecoration } from '../../../../editor/common/model.js';

export interface CellDiffInfo {
    cellIndex: number;
    type: 'added' | 'deleted' | 'modified' | 'unchanged';
    lineDiffs?: Array<{
        type: 'added' | 'deleted' | 'unchanged';
        content: string;
        lineNumber: number;
    }>;
}

export class ErdosAiNotebookDiffDecorator extends Disposable {
    private readonly decorators = this._register(new DisposableStore());
    
    constructor(
        private readonly notebookEditor: INotebookEditor
    ) {
        super();
    }

    public apply(cellDiffs: CellDiffInfo[]): void {
        const model = this.notebookEditor.textModel;
        if (!model) {
            return;
        }

        this.clear();

        // Apply line-level decorations within each cell's Monaco editor
        for (const cellDiff of cellDiffs) {
            if (cellDiff.cellIndex < model.cells.length && cellDiff.lineDiffs) {
                const cell = model.cells[cellDiff.cellIndex];
                
                // Get the Monaco editor for this cell
                const cellEditors = this.notebookEditor.codeEditors;
                const cellEditorPair = cellEditors.find(([cellViewModel]) => 
                    cellViewModel.handle === cell.handle
                );
                
                if (cellEditorPair) {
                    const [, monacoEditor] = cellEditorPair;
                    const cellModel = monacoEditor.getModel();
                    
                    if (cellModel) {
                        const decorations: IModelDeltaDecoration[] = [];
                        
                        for (const lineDiff of cellDiff.lineDiffs) {
                            if (lineDiff.type === 'added' && lineDiff.lineNumber <= cellModel.getLineCount()) {
                                decorations.push({
                                    range: {
                                        startLineNumber: lineDiff.lineNumber,
                                        startColumn: 1,
                                        endLineNumber: lineDiff.lineNumber,
                                        endColumn: cellModel.getLineLength(lineDiff.lineNumber) + 1
                                    },
                                    options: {
                                        description: 'erdos-ai-added-line',
                                        isWholeLine: true,
                                        linesDecorationsClassName: 'diff-glyph-added',
                                        overviewRuler: {
                                            color: 'rgba(0, 255, 0, 0.6)',
                                            position: 7
                                        }
                                    }
                                });
                            } else if (lineDiff.type === 'deleted') {
                                // For deleted lines, show red dropdown arrow at appropriate position
                                const targetLine = Math.min(lineDiff.lineNumber, cellModel.getLineCount());
                                decorations.push({
                                    range: {
                                        startLineNumber: targetLine,
                                        startColumn: 1,
                                        endLineNumber: targetLine,
                                        endColumn: 1
                                    },
                                    options: {
                                        description: 'erdos-ai-deleted-line',
                                        glyphMarginClassName: 'erdos-ai-diff-deleted-arrow',
                                        glyphMarginHoverMessage: {
                                            value: `Deleted: ${lineDiff.content}`
                                        },
                                        overviewRuler: {
                                            color: 'rgba(255, 0, 0, 0.6)',
                                            position: 7
                                        }
                                    }
                                });
                            }
                        }
                        
                        // Apply decorations to this cell's Monaco editor
                        if (decorations.length > 0) {
                            const decorationIds = cellModel.deltaDecorations([], decorations);
                            
                            // Store for cleanup
                            this.decorators.add(toDisposable(() => {
                                if (!cellModel.isDisposed()) {
                                    cellModel.deltaDecorations(decorationIds, []);
                                }
                            }));
                        }
                    }
                }
            }
        }
    }

    public clear(): void {
        this.decorators.clear();
    }
}
