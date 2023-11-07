/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable, DisposableStore, MutableDisposable } from 'vs/base/common/lifecycle';
import { ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellViewModelStateChangeEvent } from 'vs/workbench/contrib/notebook/browser/notebookViewEvents';
import { ICellExecutionStateChangedEvent } from 'vs/workbench/contrib/notebook/common/notebookExecutionStateService';

/**
 * A content part is a non-floating element that is rendered inside a cell.
 * The rendering of the content part is synchronous to avoid flickering.
 */
export abstract class CellContentPart extends Disposable {
	protected currentCell: ICellViewModel | undefined;
	protected cellDisposables = new DisposableStore();

	constructor() {
		super();
	}

	/**
	 * Prepare model for cell part rendering
	 * No DOM operations recommended within this operation
	 */
	prepareRenderCell(element: ICellViewModel): void { }

	/**
	 * Update the DOM for the cell `element`
	 */
	renderCell(element: ICellViewModel): void {
		this.currentCell = element;
		this.didRenderCell(element);
	}

	didRenderCell(element: ICellViewModel): void { }

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

/**
 * An overlay part renders on top of other components.
 * The rendering of the overlay part might be postponed to the next animation frame to avoid forced reflow.
 */
export abstract class CellOverlayPart extends Disposable {
	protected currentCell: ICellViewModel | undefined;
	protected readonly cellDisposables = this._register(new DisposableStore());

	constructor() {
		super();
	}

	/**
	 * Prepare model for cell part rendering
	 * No DOM operations recommended within this operation
	 */
	prepareRenderCell(element: ICellViewModel): void { }

	/**
	 * Update the DOM for the cell `element`
	 */
	renderCell(element: ICellViewModel): void {
		this.currentCell = element;
		this.didRenderCell(element);
	}

	didRenderCell(element: ICellViewModel): void { }

	/**
	 * Dispose any disposables generated from `didRenderCell`
	 */
	unrenderCell(element: ICellViewModel): void {
		this.currentCell = undefined;
		this.cellDisposables.clear();
	}

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

export class CellPartsCollection extends Disposable {
	private _scheduledOverlayRendering = this._register(new MutableDisposable());
	private _scheduledOverlayUpdateState = this._register(new MutableDisposable());
	private _scheduledOverlayUpdateExecutionState = this._register(new MutableDisposable());

	constructor(
		private readonly targetWindow: Window,
		private readonly contentParts: readonly CellContentPart[],
		private readonly overlayParts: readonly CellOverlayPart[]
	) {
		super();
	}

	concatContentPart(other: readonly CellContentPart[], targetWindow: Window): CellPartsCollection {
		return new CellPartsCollection(targetWindow, this.contentParts.concat(other), this.overlayParts);
	}

	concatOverlayPart(other: readonly CellOverlayPart[], targetWindow: Window): CellPartsCollection {
		return new CellPartsCollection(targetWindow, this.contentParts, this.overlayParts.concat(other));
	}

	scheduleRenderCell(element: ICellViewModel): void {
		// prepare model
		for (const part of this.contentParts) {
			part.prepareRenderCell(element);
		}

		for (const part of this.overlayParts) {
			part.prepareRenderCell(element);
		}

		// render content parts
		for (const part of this.contentParts) {
			part.renderCell(element);
		}

		this._scheduledOverlayRendering.value = DOM.modify(this.targetWindow, () => {
			for (const part of this.overlayParts) {
				part.renderCell(element);
			}
		});
	}

	unrenderCell(element: ICellViewModel): void {
		for (const part of this.contentParts) {
			part.unrenderCell(element);
		}

		this._scheduledOverlayRendering.value = undefined;
		this._scheduledOverlayUpdateState.value = undefined;
		this._scheduledOverlayUpdateExecutionState.value = undefined;

		for (const part of this.overlayParts) {
			part.unrenderCell(element);
		}
	}

	updateInternalLayoutNow(viewCell: ICellViewModel) {
		for (const part of this.contentParts) {
			part.updateInternalLayoutNow(viewCell);
		}

		for (const part of this.overlayParts) {
			part.updateInternalLayoutNow(viewCell);
		}
	}

	prepareLayout() {
		for (const part of this.contentParts) {
			part.prepareLayout();
		}
	}

	updateState(viewCell: ICellViewModel, e: CellViewModelStateChangeEvent) {
		for (const part of this.contentParts) {
			part.updateState(viewCell, e);
		}

		this._scheduledOverlayUpdateState.value = DOM.modify(this.targetWindow, () => {
			for (const part of this.overlayParts) {
				part.updateState(viewCell, e);
			}
		});
	}

	updateForExecutionState(viewCell: ICellViewModel, e: ICellExecutionStateChangedEvent) {
		for (const part of this.contentParts) {
			part.updateForExecutionState(viewCell, e);
		}

		this._scheduledOverlayUpdateExecutionState.value = DOM.modify(this.targetWindow, () => {
			for (const part of this.overlayParts) {
				part.updateForExecutionState(viewCell, e);
			}
		});
	}
}
