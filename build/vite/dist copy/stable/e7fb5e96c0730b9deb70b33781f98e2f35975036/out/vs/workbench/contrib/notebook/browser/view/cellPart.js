/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
/**
 * A content part is a non-floating element that is rendered inside a cell.
 * The rendering of the content part is synchronous to avoid flickering.
 */
export class CellContentPart extends Disposable {
    constructor() {
        super();
        this.cellDisposables = this._register(new DisposableStore());
    }
    /**
     * Prepare model for cell part rendering
     * No DOM operations recommended within this operation
     */
    prepareRenderCell(element) { }
    /**
     * Update the DOM for the cell `element`
     */
    renderCell(element) {
        this.currentCell = element;
        safeInvokeNoArg(() => this.didRenderCell(element));
    }
    didRenderCell(element) { }
    /**
     * Dispose any disposables generated from `didRenderCell`
     */
    unrenderCell(element) {
        this.currentCell = undefined;
        this.cellDisposables.clear();
    }
    /**
     * Perform DOM read operations to prepare for the list/cell layout update.
     */
    prepareLayout() { }
    /**
     * Update internal DOM (top positions) per cell layout info change
     * Note that a cell part doesn't need to call `DOM.scheduleNextFrame`,
     * the list view will ensure that layout call is invoked in the right frame
     */
    updateInternalLayoutNow(element) { }
    /**
     * Update per cell state change
     */
    updateState(element, e) { }
    /**
     * Update per execution state change.
     */
    updateForExecutionState(element, e) { }
}
/**
 * An overlay part renders on top of other components.
 * The rendering of the overlay part might be postponed to the next animation frame to avoid forced reflow.
 */
export class CellOverlayPart extends Disposable {
    constructor() {
        super();
        this.cellDisposables = this._register(new DisposableStore());
    }
    /**
     * Prepare model for cell part rendering
     * No DOM operations recommended within this operation
     */
    prepareRenderCell(element) { }
    /**
     * Update the DOM for the cell `element`
     */
    renderCell(element) {
        this.currentCell = element;
        this.didRenderCell(element);
    }
    didRenderCell(element) { }
    /**
     * Dispose any disposables generated from `didRenderCell`
     */
    unrenderCell(element) {
        this.currentCell = undefined;
        this.cellDisposables.clear();
    }
    /**
     * Update internal DOM (top positions) per cell layout info change
     * Note that a cell part doesn't need to call `DOM.scheduleNextFrame`,
     * the list view will ensure that layout call is invoked in the right frame
     */
    updateInternalLayoutNow(element) { }
    /**
     * Update per cell state change
     */
    updateState(element, e) { }
    /**
     * Update per execution state change.
     */
    updateForExecutionState(element, e) { }
}
function safeInvokeNoArg(func) {
    try {
        return func();
    }
    catch (e) {
        onUnexpectedError(e);
        return null;
    }
}
export class CellPartsCollection extends Disposable {
    constructor(targetWindow, contentParts, overlayParts) {
        super();
        this.targetWindow = targetWindow;
        this.contentParts = contentParts;
        this.overlayParts = overlayParts;
        this._scheduledOverlayRendering = this._register(new MutableDisposable());
        this._scheduledOverlayUpdateState = this._register(new MutableDisposable());
        this._scheduledOverlayUpdateExecutionState = this._register(new MutableDisposable());
    }
    concatContentPart(other, targetWindow) {
        return new CellPartsCollection(targetWindow, this.contentParts.concat(other), this.overlayParts);
    }
    concatOverlayPart(other, targetWindow) {
        return new CellPartsCollection(targetWindow, this.contentParts, this.overlayParts.concat(other));
    }
    scheduleRenderCell(element) {
        // prepare model
        for (const part of this.contentParts) {
            safeInvokeNoArg(() => part.prepareRenderCell(element));
        }
        for (const part of this.overlayParts) {
            safeInvokeNoArg(() => part.prepareRenderCell(element));
        }
        // render content parts
        for (const part of this.contentParts) {
            safeInvokeNoArg(() => part.renderCell(element));
        }
        this._scheduledOverlayRendering.value = DOM.modify(this.targetWindow, () => {
            for (const part of this.overlayParts) {
                safeInvokeNoArg(() => part.renderCell(element));
            }
        });
    }
    unrenderCell(element) {
        for (const part of this.contentParts) {
            safeInvokeNoArg(() => part.unrenderCell(element));
        }
        this._scheduledOverlayRendering.value = undefined;
        this._scheduledOverlayUpdateState.value = undefined;
        this._scheduledOverlayUpdateExecutionState.value = undefined;
        for (const part of this.overlayParts) {
            safeInvokeNoArg(() => part.unrenderCell(element));
        }
    }
    updateInternalLayoutNow(viewCell) {
        for (const part of this.contentParts) {
            safeInvokeNoArg(() => part.updateInternalLayoutNow(viewCell));
        }
        for (const part of this.overlayParts) {
            safeInvokeNoArg(() => part.updateInternalLayoutNow(viewCell));
        }
    }
    prepareLayout() {
        for (const part of this.contentParts) {
            safeInvokeNoArg(() => part.prepareLayout());
        }
    }
    updateState(viewCell, e) {
        for (const part of this.contentParts) {
            safeInvokeNoArg(() => part.updateState(viewCell, e));
        }
        this._scheduledOverlayUpdateState.value = DOM.modify(this.targetWindow, () => {
            for (const part of this.overlayParts) {
                safeInvokeNoArg(() => part.updateState(viewCell, e));
            }
        });
    }
    updateForExecutionState(viewCell, e) {
        for (const part of this.contentParts) {
            safeInvokeNoArg(() => part.updateForExecutionState(viewCell, e));
        }
        this._scheduledOverlayUpdateExecutionState.value = DOM.modify(this.targetWindow, () => {
            for (const part of this.overlayParts) {
                safeInvokeNoArg(() => part.updateForExecutionState(viewCell, e));
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbFBhcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3ZpZXcvY2VsbFBhcnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQ0FBb0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6RSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBS3pHOzs7R0FHRztBQUNILE1BQU0sT0FBZ0IsZUFBZ0IsU0FBUSxVQUFVO0lBSXZEO1FBQ0MsS0FBSyxFQUFFLENBQUM7UUFIVSxvQkFBZSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxlQUFlLEVBQUUsQ0FBQyxDQUFDO0lBSTNFLENBQUM7SUFFRDs7O09BR0c7SUFDSCxpQkFBaUIsQ0FBQyxPQUF1QixJQUFVLENBQUM7SUFFcEQ7O09BRUc7SUFDSCxVQUFVLENBQUMsT0FBdUI7UUFDakMsSUFBSSxDQUFDLFdBQVcsR0FBRyxPQUFPLENBQUM7UUFDM0IsZUFBZSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRUQsYUFBYSxDQUFDLE9BQXVCLElBQVUsQ0FBQztJQUVoRDs7T0FFRztJQUNILFlBQVksQ0FBQyxPQUF1QjtRQUNuQyxJQUFJLENBQUMsV0FBVyxHQUFHLFNBQVMsQ0FBQztRQUM3QixJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzlCLENBQUM7SUFFRDs7T0FFRztJQUNILGFBQWEsS0FBVyxDQUFDO0lBRXpCOzs7O09BSUc7SUFDSCx1QkFBdUIsQ0FBQyxPQUF1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