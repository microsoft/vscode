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
import * as DOM from '../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { FoldingController } from '../../controller/foldingController.js';
import { CellEditState } from '../../notebookBrowser.js';
import { CellContentPart } from '../cellPart.js';
import { executingStateIcon } from '../../notebookIcons.js';
import { INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';
import { CellKind, NotebookCellExecutionState } from '../../../common/notebookCommon.js';
import { MutableDisposable } from '../../../../../../base/common/lifecycle.js';
let FoldedCellHint = class FoldedCellHint extends CellContentPart {
    constructor(_notebookEditor, _container, _notebookExecutionStateService) {
        super();
        this._notebookEditor = _notebookEditor;
        this._container = _container;
        this._notebookExecutionStateService = _notebookExecutionStateService;
        this._runButtonListener = this._register(new MutableDisposable());
        this._cellExecutionListener = this._register(new MutableDisposable());
    }
    didRenderCell(element) {
        this.update(element);
    }
    update(element) {
        if (!this._notebookEditor.hasModel()) {
            this._cellExecutionListener.clear();
            this._runButtonListener.clear();
            return;
        }
        if (element.isInputCollapsed || element.getEditState() === CellEditState.Editing) {
            this._cellExecutionListener.clear();
            this._runButtonListener.clear();
            DOM.hide(this._container);
        }
        else if (element.foldingState === 2 /* CellFoldingState.Collapsed */) {
            const idx = this._notebookEditor.getViewModel().getCellIndex(element);
            const length = this._notebookEditor.getViewModel().getFoldedLength(idx);
            const runSectionButton = this.getRunFoldedSectionButton({ start: idx, end: idx + length + 1 });
            if (!runSectionButton) {
                DOM.reset(this._container, this.getHiddenCellsLabel(length), this.getHiddenCellHintButton(element));
            }
            else {
                DOM.reset(this._container, runSectionButton, this.getHiddenCellsLabel(length), this.getHiddenCellHintButton(element));
            }
            DOM.show(this._container);
            const foldHintTop = element.layoutInfo.previewHeight;
            this._container.style.top = `${foldHintTop}px`;
        }
        else {
            this._cellExecutionListener.clear();
            this._runButtonListener.clear();
            DOM.hide(this._container);
        }
    }
    getHiddenCellsLabel(num) {
        const label = num === 1 ?
            localize('hiddenCellsLabel', "1 cell hidden") :
            localize('hiddenCellsLabelPlural', "{0} cells hidden", num);
        return DOM.$('span.notebook-folded-hint-label', undefined, label);
    }
    getHiddenCellHintButton(element) {
        const expandIcon = DOM.$('span.cell-expand-part-button');
        expandIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.more));
        this._register(DOM.addDisposableListener(expandIcon, DOM.EventType.CLICK, () => {
            const controller = this._notebookEditor.getContribution(FoldingController.id);
            const idx = this._notebookEditor.getCellIndex(element);
            if (typeof idx === 'number') {
                controller.setFoldingStateDown(idx, 1 /* CellFoldingState.Expanded */, 1);
            }
        }));
        return expandIcon;
    }
    getRunFoldedSectionButton(range) {
        const runAllContainer = DOM.$('span.folded-cell-run-section-button');
        const cells = this._notebookEditor.getCellsInRange(range);
        // Check if any cells are code cells, if not, we won't show the run button
        const hasCodeCells = cells.some(cell => cell.cellKind === CellKind.Code);
        if (!hasCodeCells) {
            return undefined;
        }
        const isRunning = cells.some(cell => {
            const cellExecution = this._notebookExecutionStateService.getCellExecution(cell.uri);
            return cellExecution && cellExecution.state === NotebookCellExecutionState.Executing;
        });
        const runAllIcon = isRunning ?
            ThemeIcon.modify(executingStateIcon, 'spin') :
            Codicon.play;
        runAllContainer.classList.add(...ThemeIcon.asClassNameArray(runAllIcon));
        this._runButtonListener.value = DOM.addDisposableListener(runAllContainer, DOM.EventType.CLICK, () => {
            this._notebookEditor.executeNotebookCells(cells);
        });
        this._cellExecutionListener.value = this._notebookExecutionStateService.onDidChangeExecution(() => {
            const isRunning = cells.some(cell => {
                const cellExecution = this._notebookExecutionStateService.getCellExecution(cell.uri);
                return cellExecution && cellExecution.state === NotebookCellExecutionState.Executing;
            });
            const runAllIcon = isRunning ?
                ThemeIcon.modify(executingStateIcon, 'spin') :
                Codicon.play;
            runAllContainer.className = '';
            runAllContainer.classList.add('folded-cell-run-section-button', ...ThemeIcon.asClassNameArray(runAllIcon));
        });
        return runAllContainer;
    }
    updateInternalLayoutNow(element) {
        this.update(element);
    }
};
FoldedCellHint = __decorate([
    __param(2, INotebookExecutionStateService)
], FoldedCellHint);
export { FoldedCellHint };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZm9sZGVkQ2VsbEhpbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3ZpZXcvY2VsbFBhcnRzL2ZvbGRlZENlbGxIaW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUNBQXVDLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDcEQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGFBQWEsRUFBcUMsTUFBTSwwQkFBMEIsQ0FBQztBQUM1RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFHakQsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sd0JBQXdCLENBQUM7QUFDNUQsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEcsT0FBTyxFQUFFLFFBQVEsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRXhFLElBQU0sY0FBYyxHQUFwQixNQUFNLGNBQWUsU0FBUSxlQUFlO0lBS2xELFlBQ2tCLGVBQWdDLEVBQ2hDLFVBQXVCLEVBQ1IsOEJBQStFO1FBRS9HLEtBQUssRUFBRSxDQUFDO1FBSlMsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBQ2hDLGVBQVUsR0FBVixVQUFVLENBQWE7UUFDUyxtQ0FBOEIsR0FBOUIsOEJBQThCLENB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