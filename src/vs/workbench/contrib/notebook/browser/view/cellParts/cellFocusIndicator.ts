/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellPart';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { MarkupCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/markupCellViewModel';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class CellFocusIndicator extends CellPart {
	private codeFocusIndicator: FastDomNode<HTMLElement>;
	private outputFocusIndicator: FastDomNode<HTMLElement>;

	private currentElement: ICellViewModel | undefined;

	constructor(
		readonly notebookEditor: INotebookEditorDelegate,
		readonly top: FastDomNode<HTMLElement>,
		readonly left: FastDomNode<HTMLElement>,
		readonly right: FastDomNode<HTMLElement>,
		readonly bottom: FastDomNode<HTMLElement>
	) {
		super();

		this.codeFocusIndicator = new FastDomNode(DOM.append(
			this.left.domNode,
			DOM.$(
				'.codeOutput-focus-indicator-container',
				undefined,
				DOM.$('.codeOutput-focus-indicator.code-focus-indicator'))));

		this.outputFocusIndicator = new FastDomNode(DOM.append(
			this.left.domNode,
			DOM.$(
				'.codeOutput-focus-indicator-container',
				undefined,
				DOM.$('.codeOutput-focus-indicator.output-focus-indicator'))));

		this._register(DOM.addDisposableListener(this.codeFocusIndicator.domNode, DOM.EventType.CLICK, () => {
			if (this.currentElement) {
				this.currentElement.isInputCollapsed = !this.currentElement.isInputCollapsed;
			}
		}));
		this._register(DOM.addDisposableListener(this.outputFocusIndicator.domNode, DOM.EventType.CLICK, () => {
			if (this.currentElement) {
				this.currentElement.isOutputCollapsed = !this.currentElement.isOutputCollapsed;
			}
		}));
	}

	renderCell(element: ICellViewModel): void {
		this.currentElement = element;
	}

	prepareLayout(): void {
		// nothing to read
	}

	updateInternalLayoutNow(element: ICellViewModel): void {
		if (element.cellKind === CellKind.Markup) {
			// markdown cell
			const indicatorPostion = this.notebookEditor.notebookOptions.computeIndicatorPosition(element.layoutInfo.totalHeight, (element as MarkupCellViewModel).layoutInfo.foldHintHeight, this.notebookEditor.textModel?.viewType);
			this.bottom.domNode.style.transform = `translateY(${indicatorPostion.bottomIndicatorTop}px)`;
			this.left.setHeight(indicatorPostion.verticalIndicatorHeight);
			this.right.setHeight(indicatorPostion.verticalIndicatorHeight);
			this.codeFocusIndicator.setHeight(indicatorPostion.verticalIndicatorHeight);
		} else {
			// code cell
			const cell = element as CodeCellViewModel;
			const layoutInfo = this.notebookEditor.notebookOptions.getLayoutConfiguration();
			const bottomToolbarDimensions = this.notebookEditor.notebookOptions.computeBottomToolbarDimensions(this.notebookEditor.textModel?.viewType);
			const indicatorHeight = cell.layoutInfo.codeIndicatorHeight + cell.layoutInfo.outputIndicatorHeight;
			this.left.setHeight(indicatorHeight);
			this.right.setHeight(indicatorHeight);
			this.codeFocusIndicator.setHeight(cell.layoutInfo.codeIndicatorHeight);
			this.outputFocusIndicator.setHeight(Math.max(cell.layoutInfo.outputIndicatorHeight - cell.viewContext.notebookOptions.getLayoutConfiguration().focusIndicatorGap, 0));
			this.bottom.domNode.style.transform = `translateY(${cell.layoutInfo.totalHeight - bottomToolbarDimensions.bottomToolbarGap - layoutInfo.cellBottomMargin}px)`;
		}
	}

	updateState(element: ICellViewModel, e: CellViewModelStateChangeEvent): void {
		// nothing to update
	}
}
