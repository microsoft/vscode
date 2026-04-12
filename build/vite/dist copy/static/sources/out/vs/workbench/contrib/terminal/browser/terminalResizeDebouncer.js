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
import { getWindow, runWhenWindowIdle } from '../../../../base/browser/dom.js';
import { debounce } from '../../../../base/common/decorators.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
var Constants;
(function (Constants) {
    /**
     * The _normal_ buffer length threshold at which point resizing starts being debounced.
     */
    Constants[Constants["StartDebouncingThreshold"] = 200] = "StartDebouncingThreshold";
})(Constants || (Constants = {}));
export class TerminalResizeDebouncer extends Disposable {
    constructor(_isVisible, _getXterm, _resizeBothCallback, _resizeXCallback, _resizeYCallback) {
        super();
        this._isVisible = _isVisible;
        this._getXterm = _getXterm;
        this._resizeBothCallback = _resizeBothCallback;
        this._resizeXCallback = _resizeXCallback;
        this._resizeYCallback = _resizeYCallback;
        this._latestX = 0;
        this._latestY = 0;
        this._resizeXJob = this._register(new MutableDisposable());
        this._resizeYJob = this._register(new MutableDisposable());
    }
    async resize(cols, rows, immediate) {
        this._latestX = cols;
        this._latestY = rows;
        // Resize immediately if requested explicitly or if the buffer is small
        if (immediate || this._getXterm().raw.buffer.normal.length < 200 /* Constants.StartDebouncingThreshold */) {
            this._resizeXJob.clear();
            this._resizeYJob.clear();
            this._resizeBothCallback(cols, rows);
            return;
        }
        // Resize in an idle callback if the terminal is not visible
        const win = getWindow(this._getXterm().raw.element);
        if (win && !this._isVisible()) {
            if (!this._resizeXJob.value) {
                this._resizeXJob.value = runWhenWindowIdle(win, async () => {
                    this._resizeXCallback(this._latestX);
                    this._resizeXJob.clear();
                });
            }
            if (!this._resizeYJob.value) {
                this._resizeYJob.value = runWhenWindowIdle(win, async () => {
                    this._resizeYCallback(this._latestY);
                    this._resizeYJob.clear();
                });
            }
            return;
        }
        // Update dimensions independently as vertical resize is cheap and horizontal resize is
        // expensive due to reflow.
        this._resizeYCallback(rows);
        this._latestX = cols;
        this._debounceResizeX(cols);
    }
    flush() {
        if (this._resizeXJob.value || this._resizeYJob.value) {
            this._resizeXJob.clear();
            this._resizeYJob.clear();
            this._resizeBothCallback(this._latestX, this._latestY);
        }
    }
    _debounceResizeX(cols) {
        this._resizeXCallback(cols);
    }
}
__decorate([
    debounce(100)
], TerminalResizeDebouncer.prototype, "_debounceResizeX", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxSZXNpemVEZWJvdW5jZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsUmVzaXplRGVib3VuY2VyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakUsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBR3JGLElBQVcsU0FLVjtBQUxELFdBQVcsU0FBUztJQUNuQjs7T0FFRztJQUNILG1GQUE4QixDQUFBO0FBQy9CLENBQUMsRUFMVSxTQUFTLEtBQVQsU0FBUyxRQUtuQjtBQUVELE1BQU0sT0FBTyx1QkFBd0IsU0FBUSxVQUFVO0lBT3RELFlBQ2tCLFVBQXlCLEVBQ3pCLFNBQTBDLEVBQzFDLG1CQUF5RCxFQUN6RCxnQkFBd0MsRUFDeEMsZ0JBQXdDO1FBRXpELEtBQUssRUFBRSxDQUFDO1FBTlMsZUFBVSxHQUFWLFVBQVUsQ0FBZTtRQUN6QixjQUFTLEdBQVQsU0FBUyxDQUFpQztRQUMxQyx3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXNDO1FBQ3pELHFCQUFnQixHQUFoQixnQkFBZ0IsQ0FBd0I7UUFDeEMscUJBQWdCLEdBQWhCLGdCQUFnQixDQUF3QjtRQVhsRCxhQUFRLEdBQVcsQ0FBQyxDQUFDO1FBQ3JCLGFBQVEsR0FBVyxDQUFDLENBQUM7UUFFWixnQkFBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxpQkFBaUIsRUFBRSxDQUFDLENBQUM7UUFDdEQsZ0JBQVcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElB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