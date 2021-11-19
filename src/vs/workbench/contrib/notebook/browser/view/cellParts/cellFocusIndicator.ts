/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import * as DOM from 'vs/base/browser/dom';
import { FastDomNode } from 'vs/base/browser/fastDomNode';
import { ICellViewModel, INotebookEditorDelegate } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellPart } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellPart';
import { CodeCellViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/codeCellViewModel';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class CellFocusIndicator extends CellPart {
	constructor(
		readonly notebookEditor: INotebookEditorDelegate,
		readonly top: FastDomNode<HTMLElement>,
		readonly left: FastDomNode<HTMLElement>,
		readonly right: FastDomNode<HTMLElement>,
		readonly bottom: FastDomNode<HTMLElement>
	) {
		super();
	}

	prepareRender(): void {
		// nothing to read
	}

	updateLayout(element: ICellViewModel): void {
		if (element.cellKind === CellKind.Markup) {
			// markdown cell
			const indicatorPostion = this.notebookEditor.notebookOptions.computeIndicatorPosition(element.layoutInfo.totalHeight, this.notebookEditor.textModel?.viewType);
			this.bottom.domNode.style.transform = `translateY(${indicatorPostion.bottomIndicatorTop}px)`;
			this.left.setHeight(indicatorPostion.verticalIndicatorHeight);
			this.right.setHeight(indicatorPostion.verticalIndicatorHeight);
		} else {
			// code cell
			const cell = element as CodeCellViewModel;
			const layoutInfo = this.notebookEditor.notebookOptions.getLayoutConfiguration();
			const bottomToolbarDimensions = this.notebookEditor.notebookOptions.computeBottomToolbarDimensions(this.notebookEditor.textModel?.viewType);
			this.left.setHeight(cell.layoutInfo.indicatorHeight);
			this.right.setHeight(cell.layoutInfo.indicatorHeight);
			this.bottom.domNode.style.transform = `translateY(${cell.layoutInfo.totalHeight - bottomToolbarDimensions.bottomToolbarGap - layoutInfo.cellBottomMargin}px)`;
		}
	}
}
