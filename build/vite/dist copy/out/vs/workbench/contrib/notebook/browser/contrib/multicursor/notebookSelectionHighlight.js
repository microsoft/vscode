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
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { Selection } from '../../../../../../editor/common/core/selection.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
let NotebookSelectionHighlighter = class NotebookSelectionHighlighter extends Disposable {
    static { this.id = 'notebook.selectionHighlighter'; }
    // right now this lets us mimic the more performant cache implementation of the text editor (doesn't need to be a delayer)
    // todo: in the future, implement caching and change to a 250ms delay upon recompute
    // private readonly runDelayer: Delayer<void> = this._register(new Delayer<void>(0));
    constructor(notebookEditor, configurationService) {
        super();
        this.notebookEditor = notebookEditor;
        this.configurationService = configurationService;
        this.isEnabled = false;
        this.cellDecorationIds = new Map();
        this.anchorDisposables = new DisposableStore();
        this.isEnabled = this.configurationService.getValue('editor.selectionHighlight');
        this._register(this.configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('editor.selectionHighlight')) {
                this.isEnabled = this.configurationService.getValue('editor.selectionHighlight');
            }
        }));
        this._register(this.notebookEditor.onDidChangeActiveCell(async () => {
            if (!this.isEnabled) {
                return;
            }
            this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
            if (!this.anchorCell) {
                return;
            }
            const activeCell = this.notebookEditor.getActiveCell();
            if (!activeCell) {
                return;
            }
            if (!activeCell.editorAttached) {
                await Event.toPromise(activeCell.onDidChangeEditorAttachState);
            }
            this.clearNotebookSelectionDecorations();
            this.anchorDisposables.clear();
            this.anchorDisposables.add(this.anchorCell[1].onDidChangeCursorPosition((e) => {
                if (e.reason !== 3 /* CursorChangeReason.Explicit */) {
                    this.clearNotebookSelectionDecorations();
                    return;
                }
                if (!this.anchorCell) {
                    return;
                }
                if (this.notebookEditor.hasModel()) {
                    this.clearNotebookSelectionDecorations();
                    this._update(this.notebookEditor);
                }
            }));
            if (this.notebookEditor.getEditorViewState().editorFocused && this.notebookEditor.hasModel()) {
                this._update(this.notebookEditor);
            }
        }));
    }
    _update(editor) {
        if (!this.anchorCell || !this.isEnabled) {
            return;
        }
        // TODO: isTooLargeForTokenization check, notebook equivalent?
        // unlikely that any one cell's textmodel would be too large
        // get the word
        const textModel = this.anchorCell[0].textModel;
        if (!textModel || textModel.isTooLargeForTokenization()) {
            return;
        }
        const s = this.anchorCell[0].getSelections()[0];
        if (s.startLineNumber !== s.endLineNumber || s.isEmpty()) {
            // empty selections do nothing
            // multiline forbidden for perf reasons
            return;
        }
        const searchText = this.getSearchText(s, textModel);
        if (!searchText) {
            return;
        }
        const results = editor.textModel.findMatches(searchText, false, true, null);
        for (const res of results) {
            const cell = editor.getCellByHandle(res.cell.handle);
            if (!cell) {
                continue;
            }
            this.updateCellDecorations(cell, res.matches);
        }
    }
    updateCellDecorations(cell, matches) {
        const selections = matches.map(m => {
            return Selection.fromRange(m.range, 0 /* SelectionDirection.LTR */);
        });
        const newDecorations = [];
        selections?.map(selection => {
            const isEmpty = selection.isEmpty();
            if (!isEmpty) {
                newDecorations.push({
                    range: selection,
                    options: {
                        description: '',
                        className: '.nb-selection-highlight',
                    }
                });
            }
        });
        const oldDecorations = this.cellDecorationIds.get(cell) ?? [];
        this.cellDecorationIds.set(cell, cell.deltaModelDecorations(oldDecorations, newDecorations));
    }
    clearNotebookSelectionDecorations() {
        this.cellDecorationIds.forEach((_, cell) => {
            const cellDecorations = this.cellDecorationIds.get(cell) ?? [];
            if (cellDecorations) {
                cell.deltaModelDecorations(cellDecorations, []);
                this.cellDecorationIds.delete(cell);
            }
        });
    }
    getSearchText(selection, model) {
        return model.getValueInRange(selection).replace(/\r\n/g, '\n');
    }
    dispose() {
        super.dispose();
        this.anchorDisposables.dispose();
    }
};
NotebookSelectionHighlighter = __decorate([
    __param(1, IConfigurationService)
], NotebookSelectionHighlighter);
registerNotebookContribution(NotebookSelectionHighlighter.id, NotebookSelectionHighlighter);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tTZWxlY3Rpb25IaWdobGlnaHQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIvbXVsdGljdXJzb3Ivbm90ZWJvb2tTZWxlY3Rpb25IaWdobGlnaHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFekYsT0FBTyxFQUFFLFNBQVMsRUFBc0IsTUFBTSxtREFBbUQsQ0FBQztBQUdsRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUV6RyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVqRixJQUFNLDRCQUE0QixHQUFsQyxNQUFNLDRCQUE2QixTQUFRLFVBQVU7YUFFcEMsT0FBRSxHQUFXLCtCQUErQixBQUExQyxDQUEyQztJQU83RCwwSEFBMEg7SUFDMUgsb0ZBQW9GO0lBQ3BGLHFGQUFxRjtJQUVyRixZQUNrQixjQUErQixFQUN6QixvQkFBNEQ7UUFFbkYsS0FBSyxFQUFFLENBQUM7UUFIUyxtQkFBYyxHQUFkLGNBQWMsQ0FBaUI7UUFDUix5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBWjVFLGNBQVMsR0FBWSxLQUFLLENBQUM7UUFFM0Isc0JBQWlCLEdBQUcsSUFBSSxHQUFHLEVBQTRCLENBQUM7UUFFL0Msc0JBQWlCLEdBQUcsSUFBSSxlQUFlLEVBQUUsQ0FBQztRQVkxRCxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxRQUFRLENBQVUsMkJBQTJCLENBQUMsQ0FBQztRQUMxRixJ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