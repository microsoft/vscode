/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { BaseCellRenderTemplate } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { ICellExecutionStateChangedEvent } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

export abstract class CellPart extends Disposable {
	constructor() {
		super();
	}

	/**
	 * Update the DOM for the cell `element`
	 */
	abstract renderCell(element: ICellViewModel, templateData: BaseCellRenderTemplate): void;

	/**
	 * Dispose any disposables generated from `renderCell`
	 */
	unrenderCell(element: ICellViewModel, templateData: BaseCellRenderTemplate): void { }

	/**
	 * Perform DOM read operations to prepare for the list/cell layout update.
	 */
	abstract prepareLayout(): void;

	/**
	 * Update internal DOM (top positions) per cell layout info change
	 * Note that a cell part doesn't need to call `DOM.scheduleNextFrame`,
	 * the list view will ensure that layout call is invoked in the right frame
	 */
	abstract updateInternalLayoutNow(element: ICellViewModel): void;

	/**
	 * Update per cell state change
	 */
	abstract updateState(element: ICellViewModel, e: CellViewModelStateChangeEvent): void;

	/**
	 * Update per execution state change.
	 */
	updateForExecutionState(element: ICellViewModel, e: ICellExecutionStateChangedEvent): void { }
}
