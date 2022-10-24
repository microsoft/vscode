/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { ICellExecutionStateChangedEvent } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

export abstract class CellPart extends Disposable {
	protected currentCell: ICellViewModel | undefined;
	protected cellDisposables = new DisposableStore();

	constructor() {
		super();
	}

	/**
	 * Update the DOM for the cell `element`
	 */
	renderCell(element: ICellViewModel): void {
		this.currentCell = element;
		this.didRenderCell(element);
	}

	protected didRenderCell(element: ICellViewModel): void { }

	/**
	 * Dispose any disposables generated from `didRenderCell`
	 */
	unrenderCell(element: ICellViewModel): void {
		this.currentCell = undefined;
		this.cellDisposables.clear();
	}

	/**
	 * Perform DOM read operations to prepare for the list/cell layout update.
	 */
	prepareLayout(): void { }

	/**
	 * Update internal DOM (top positions) per cell layout info change
	 * Note that a cell part doesn't need to call `DOM.scheduleNextFrame`,
	 * the list view will ensure that layout call is invoked in the right frame
	 */
	updateInternalLayoutNow(element: ICellViewModel): void { }

	/**
	 * Update per cell state change
	 */
	updateState(element: ICellViewModel, e: CellViewModelStateChangeEvent): void { }

	/**
	 * Update per execution state change.
	 */
	updateForExecutionState(element: ICellViewModel, e: ICellExecutionStateChangedEvent): void { }
}

export class CellPartsCollection {

	constructor(
		private readonly parts: readonly CellPart[],
	) { }

	concat(other: readonly CellPart[]): CellPartsCollection {
		return new CellPartsCollection(this.parts.concat(other));
	}

	renderCell(element: ICellViewModel): void {
		for (const part of this.parts) {
			part.renderCell(element);
		}
	}

	unrenderCell(element: ICellViewModel): void {
		for (const part of this.parts) {
			part.unrenderCell(element);
		}
	}

	updateInternalLayoutNow(viewCell: ICellViewModel) {
		for (const part of this.parts) {
			part.updateInternalLayoutNow(viewCell);
		}
	}

	prepareLayout() {
		for (const part of this.parts) {
			part.prepareLayout();
		}
	}

	updateState(viewCell: ICellViewModel, e: CellViewModelStateChangeEvent) {
		for (const part of this.parts) {
			part.updateState(viewCell, e);
		}
	}

	updateForExecutionState(viewCell: ICellViewModel, e: ICellExecutionStateChangedEvent) {
		for (const part of this.parts) {
			part.updateForExecutionState(viewCell, e);
		}
	}
}
