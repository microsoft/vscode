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
import { disposableTimeout } from '../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { clamp } from '../../../../../../base/common/numbers.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { CellContentPart } from '../cellPart.js';
import { CodeCellViewModel } from '../../viewModel/codeCellViewModel.js';
import { INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';
import { executingStateIcon } from '../../notebookIcons.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { hasKey } from '../../../../../../base/common/types.js';
const UPDATE_EXECUTION_ORDER_GRACE_PERIOD = 200;
let CellExecutionPart = class CellExecutionPart extends CellContentPart {
    constructor(_notebookEditor, _executionOrderLabel, _notebookExecutionStateService) {
        super();
        this._notebookEditor = _notebookEditor;
        this._executionOrderLabel = _executionOrderLabel;
        this._notebookExecutionStateService = _notebookExecutionStateService;
        this.kernelDisposables = this._register(new DisposableStore());
        // Add class to the outer container for styling
        this._executionOrderLabel.classList.add('cell-execution-order');
        // Create nested div for content
        this._executionOrderContent = DOM.append(this._executionOrderLabel, DOM.$('div'));
        // Add a method to watch for cell execution state changes
        this._register(this._notebookExecutionStateService.onDidChangeExecution(e => {
            if (this.currentCell && hasKey(e, { affectsCell: true }) && e.affectsCell(this.currentCell.uri)) {
                this._updatePosition();
            }
        }));
        this._register(this._notebookEditor.onDidChangeActiveKernel(() => {
            if (this.currentCell) {
                this.kernelDisposables.clear();
                if (this._notebookEditor.activeKernel) {
                    this.kernelDisposables.add(this._notebookEditor.activeKernel.onDidChange(() => {
                        if (this.currentCell) {
                            this.updateExecutionOrder(this.currentCell.internalMetadata);
                        }
                    }));
                }
                this.updateExecutionOrder(this.currentCell.internalMetadata);
            }
        }));
        this._register(this._notebookEditor.onDidScroll(() => {
            this._updatePosition();
        }));
    }
    didRenderCell(element) {
        this.updateExecutionOrder(element.internalMetadata, true);
    }
    updateState(element, e) {
        if (e.internalMetadataChanged) {
            this.updateExecutionOrder(element.internalMetadata);
        }
    }
    updateExecutionOrder(internalMetadata, forceClear = false) {
        if (this._notebookEditor.activeKernel?.implementsExecutionOrder || (!this._notebookEditor.activeKernel && typeof internalMetadata.executionOrder === 'number')) {
            // If the executionOrder was just cleared, and the cell is executing, wait just a bit before clearing the view to avoid flashing
            if (typeof internalMetadata.executionOrder !== 'number' && !forceClear && !!this._notebookExecutionStateService.getCellExecution(this.currentCell.uri)) {
                const renderingCell = this.currentCell;
                disposableTimeout(() => {
                    if (this.currentCell === renderingCell) {
                        this.updateExecutionOrder(this.currentCell.internalMetadata, true);
                        this._updatePosition();
                    }
                }, UPDATE_EXECUTION_ORDER_GRACE_PERIOD, this.cellDisposables);
                return;
            }
            const executionOrderLabel = typeof internalMetadata.executionOrder === 'number' ?
                `[${internalMetadata.executionOrder}]` :
                '[ ]';
            this._executionOrderContent.innerText = executionOrderLabel;
            // Call _updatePosition to refresh sticky status
            this._updatePosition();
        }
        else {
            this._executionOrderContent.innerText = '';
        }
    }
    updateInternalLayoutNow(element) {
        this._updatePosition();
    }
    _updatePosition() {
        if (!this.currentCell) {
            return;
        }
        if (this.currentCell.isInputCollapsed) {
            DOM.hide(this._executionOrderLabel);
            return;
        }
        // Only show the execution order label when the cell is running
        const cellIsRunning = !!this._notebookExecutionStateService.getCellExecution(this.currentCell.uri);
        // Store sticky state before potentially removing the class
        const wasSticky = this._executionOrderLabel.classList.contains('sticky');
        if (!cellIsRunning) {
            // Keep showing the execution order label but remove sticky class
            this._executionOrderLabel.classList.remove('sticky');
            // If we were sticky and cell stopped running, restore the proper content
            if (wasSticky) {
                const executionOrder = this.currentCell.internalMetadata.executionOrder;
                const executionOrderLabel = typeof executionOrder === 'number' ?
                    `[${executionOrder}]` :
                    '[ ]';
                this._executionOrderContent.innerText = executionOrderLabel;
            }
        }
        DOM.show(this._executionOrderLabel);
        let top = this.currentCell.layoutInfo.editorHeight - 22 + this.currentCell.layoutInfo.statusBarHeight;
        if (this.currentCell instanceof CodeCellViewModel) {
            const elementTop = this._notebookEditor.getAbsoluteTopOfElement(this.currentCell);
            const editorBottom = elementTop + this.currentCell.layoutInfo.outputContainerOffset;
            const scrollBottom = this._notebookEditor.scrollBottom;
            const lineHeight = 22;
            const statusBarVisible = this.currentCell.layoutInfo.statusBarHeight > 0;
            // Sticky mode: cell is running and editor is not fully visible
            const offset = editorBottom - scrollBottom;
            top -= offset;
            top = clamp(top, lineHeight + 12, // line height + padding for single line
            this.currentCell.layoutInfo.editorHeight - lineHeight + this.currentCell.layoutInfo.statusBarHeight);
            if (scrollBottom <= editorBottom && cellIsRunning) {
                const isAlreadyIcon = this._executionOrderContent.classList.contains('sticky-spinner');
                // Add a class when it's in sticky mode for special styling
                if (!isAlreadyIcon) {
                    this._executionOrderLabel.classList.add('sticky-spinner');
                    // Only recreate the content if we're newly becoming sticky
                    DOM.clearNode(this._executionOrderContent);
                    const icon = ThemeIcon.modify(executingStateIcon, 'spin');
                    DOM.append(this._executionOrderContent, ...renderLabelWithIcons(`$(${icon.id})`));
                }
                // When already sticky, we don't need to recreate the content
            }
            else if (!statusBarVisible && cellIsRunning) {
                // Status bar is hidden but cell is running: show execution order label at the bottom of the editor area
                const wasStickyHere = this._executionOrderLabel.classList.contains('sticky');
                this._executionOrderLabel.classList.remove('sticky');
                top = this.currentCell.layoutInfo.editorHeight - lineHeight; // Place at the bottom of the editor
                // Only update content if we were previously sticky or content is not correct
                // eslint-disable-next-line no-restricted-syntax
                const iconIsPresent = this._executionOrderContent.querySelector('.codicon') !== null;
                if (wasStickyHere || iconIsPresent) {
                    const executionOrder = this.currentCell.internalMetadata.executionOrder;
                    const executionOrderLabel = typeof executionOrder === 'number' ?
                        `[${executionOrder}]` :
                        '[ ]';
                    this._executionOrderContent.innerText = executionOrderLabel;
                }
            }
            else {
                // Only update if the current state is sticky
                const currentlySticky = this._executionOrderLabel.classList.contains('sticky');
                this._executionOrderLabel.classList.remove('sticky');
                // When transitioning from sticky to non-sticky, restore the proper content
                if (currentlySticky) {
                    const executionOrder = this.currentCell.internalMetadata.executionOrder;
                    const executionOrderLabel = typeof executionOrder === 'number' ?
                        `[${executionOrder}]` :
                        '[ ]';
                    this._executionOrderContent.innerText = executionOrderLabel;
                }
            }
        }
        this._executionOrderLabel.style.top = `${top}px`;
    }
};
CellExecutionPart = __decorate([
    __param(2, INotebookExecutionStateService)
], CellExecutionPart);
export { CellExecutionPart };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbEV4ZWN1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvY2VsbEV4ZWN1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLHVDQUF1QyxDQUFDO0FBQzdELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDakUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRXZFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNqRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUV6RSxPQUFPLEVBQUUsOEJBQThCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNsRyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM1RCxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUVqRyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFaEUsTUFBTSxtQ0FBbUMsR0FBRyxHQUFHLENBQUM7QUFFekMsSUFBTSxpQkFBaUIsR0FBdkIsTUFBTSxpQkFBa0IsU0FBUSxlQUFlO0lBSXJELFlBQ2tCLGVBQXdDLEVBQ3hDLG9CQUFpQyxFQUNsQiw4QkFBK0U7UUFFL0csS0FBSyxFQUFFLENBQUM7UUFKUyxvQkFBZSxHQUFmLGVBQWUsQ0FBeUI7UUFDeEMseUJBQW9CLEdBQXBCLG9CQUFvQixD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