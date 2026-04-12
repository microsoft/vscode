/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../../../base/browser/dom.js';
import { FastDomNode } from '../../../../../../base/browser/fastDomNode.js';
import { CellContentPart } from '../cellPart.js';
import { CellKind } from '../../../common/notebookCommon.js';
export class CellFocusIndicator extends CellContentPart {
    constructor(notebookEditor, titleToolbar, top, left, right, bottom) {
        super();
        this.notebookEditor = notebookEditor;
        this.titleToolbar = titleToolbar;
        this.top = top;
        this.left = left;
        this.right = right;
        this.bottom = bottom;
        this.codeFocusIndicator = new FastDomNode(DOM.append(this.left.domNode, DOM.$('.codeOutput-focus-indicator-container', undefined, DOM.$('.codeOutput-focus-indicator.code-focus-indicator'))));
        this.outputFocusIndicator = new FastDomNode(DOM.append(this.left.domNode, DOM.$('.codeOutput-focus-indicator-container', undefined, DOM.$('.codeOutput-focus-indicator.output-focus-indicator'))));
        this._register(DOM.addDisposableListener(this.codeFocusIndicator.domNode, DOM.EventType.CLICK, () => {
            if (this.currentCell) {
                this.currentCell.isInputCollapsed = !this.currentCell.isInputCollapsed;
            }
        }));
        this._register(DOM.addDisposableListener(this.outputFocusIndicator.domNode, DOM.EventType.CLICK, () => {
            if (this.currentCell) {
                this.currentCell.isOutputCollapsed = !this.currentCell.isOutputCollapsed;
            }
        }));
        this._register(DOM.addDisposableListener(this.left.domNode, DOM.EventType.DBLCLICK, e => {
            if (!this.currentCell || !this.notebookEditor.hasModel()) {
                return;
            }
            if (e.target !== this.left.domNode) {
                // Don't allow dblclick on the codeFocusIndicator/outputFocusIndicator
                return;
            }
            const clickedOnInput = e.offsetY < this.currentCell.layoutInfo.outputContainerOffset;
            if (clickedOnInput) {
                this.currentCell.isInputCollapsed = !this.currentCell.isInputCollapsed;
            }
            else {
                this.currentCell.isOutputCollapsed = !this.currentCell.isOutputCollapsed;
            }
        }));
        this._register(this.titleToolbar.onDidUpdateActions(() => {
            this.updateFocusIndicatorsForTitleMenu();
        }));
    }
    updateInternalLayoutNow(element) {
        if (element.cellKind === CellKind.Markup) {
            const indicatorPostion = this.notebookEditor.notebookOptions.computeIndicatorPosition(element.layoutInfo.totalHeight, element.layoutInfo.foldHintHeight, this.notebookEditor.textModel?.viewType);
            this.bottom.domNode.style.transform = `translateY(${indicatorPostion.bottomIndicatorTop + 6}px)`;
            this.left.setHeight(indicatorPostion.verticalIndicatorHeight);
            this.right.setHeight(indicatorPostion.verticalIndicatorHeight);
            this.codeFocusIndicator.setHeight(indicatorPostion.verticalIndicatorHeight - this.getIndicatorTopMargin() * 2 - element.layoutInfo.chatHeight);
        }
        else {
            const cell = element;
            const layoutInfo = this.notebookEditor.notebookOptions.getLayoutConfiguration();
            const bottomToolbarDimensions = this.notebookEditor.notebookOptions.computeBottomToolbarDimensions(this.notebookEditor.textModel?.viewType);
            const indicatorHeight = cell.layoutInfo.codeIndicatorHeight + cell.layoutInfo.outputIndicatorHeight + cell.layoutInfo.commentHeight;
            this.left.setHeight(indicatorHeight);
            this.right.setHeight(indicatorHeight);
            this.codeFocusIndicator.setHeight(cell.layoutInfo.codeIndicatorHeight);
            this.outputFocusIndicator.setHeight(Math.max(cell.layoutInfo.outputIndicatorHeight - cell.viewContext.notebookOptions.getLayoutConfiguration().focusIndicatorGap, 0));
            this.bottom.domNode.style.transform = `translateY(${cell.layoutInfo.totalHeight - bottomToolbarDimensions.bottomToolbarGap - layoutInfo.cellBottomMargin}px)`;
        }
        this.updateFocusIndicatorsForTitleMenu();
    }
    updateFocusIndicatorsForTitleMenu() {
        const y = (this.currentCell?.layoutInfo.chatHeight ?? 0) + this.getIndicatorTopMargin();
        this.left.domNode.style.transform = `translateY(${y}px)`;
        this.right.domNode.style.transform = `translateY(${y}px)`;
    }
    getIndicatorTopMargin() {
        const layoutInfo = this.notebookEditor.notebookOptions.getLayoutConfiguration();
        if (this.titleToolbar.hasActions) {
            return layoutInfo.editorToolbarHeight + layoutInfo.cellTopMargin;
        }
        else {
            return layoutInfo.cellTopMargin;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbEZvY3VzSW5kaWNhdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci92aWV3L2NlbGxQYXJ0cy9jZWxsRm9jdXNJbmRpY2F0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1Q0FBdUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFNUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBSWpELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUU3RCxNQUFNLE9BQU8sa0JBQW1CLFNBQVEsZUFBZTtJQUl0RCxZQUNVLGNBQXVDLEVBQ3ZDLFlBQWtDLEVBQ2xDLEdBQTZCLEVBQzdCLElBQThCLEVBQzlCLEtBQStCLEVBQy9CLE1BQWdDO1FBRXpDLEtBQUssRUFBRSxDQUFDO1FBUEMsbUJBQWMsR0FBZCxjQUFjLENBQXlCO1FBQ3ZDLGlCQUFZLEdBQVosWUFBWSxDQUFzQjtRQUNsQyxRQUFHLEdBQUgsR0FBRyxDQUEwQjtRQUM3QixTQUFJLEdBQUosSUFBSSxDQUEwQjtRQUM5QixVQUFLLEdBQUwsS0FBSyxDQUEwQjtRQUMvQixXQUFNLEdBQU4sTUFBTSxDQUEwQjtRQUl6QyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxXQUFXLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FDbkQsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQ2pCLEdBQUcsQ0FBQyxDQUFDLENBQ0osdUNBQXVDLEVBQ3ZDLFNBQVMsRUFDVCxHQUFHLENBQUMsQ0FBQyxDQUFDLGtEQUFrRCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFL0QsSUFBSSxDQUFDLG9CQUFvQixH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