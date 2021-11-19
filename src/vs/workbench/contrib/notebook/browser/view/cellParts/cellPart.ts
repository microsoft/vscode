/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { CellViewModelStateChangeEvent, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';

export abstract class CellPart extends Disposable {
	constructor() {
		super();
	}

	/**
	 * Perform DOM read operations to prepare for the list/cell layout update.
	 */
	abstract prepareLayout(): void;

	/**
	 * Update DOM per cell layout info change
	 */
	abstract updateLayoutNow(element: ICellViewModel): void;

	/**
	 * Update per cell state change
	 */
	abstract updateState(element: ICellViewModel, e: CellViewModelStateChangeEvent): void;
}
