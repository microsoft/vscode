/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { getWindow, scheduleAtNextAnimationFrame } from '../../../base/browser/dom.js';
export class ElementSizeObserver extends Disposable {
    constructor(referenceDomElement, dimension) {
        super();
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this._referenceDomElement = referenceDomElement;
        this._width = -1;
        this._height = -1;
        this._resizeObserver = null;
        this.measureReferenceDomElement(false, dimension);
    }
    dispose() {
        this.stopObserving();
        super.dispose();
    }
    getWidth() {
        return this._width;
    }
    getHeight() {
        return this._height;
    }
    startObserving() {
        if (!this._resizeObserver && this._referenceDomElement) {
            // We want to react to the resize observer only once per animation frame
            // The first time the resize observer fires, we will react to it immediately.
            // Otherwise we will postpone to the next animation frame.
            // We'll use `observeContentRect` to store the content rect we received.
            let observedDimension = null;
            const observeNow = () => {
                if (observedDimension) {
                    this.observe({ width: observedDimension.width, height: observedDimension.height });
                }
                else {
                    this.observe();
                }
            };
            let shouldObserve = false;
            let alreadyObservedThisAnimationFrame = false;
            const update = () => {
                if (shouldObserve && !alreadyObservedThisAnimationFrame) {
                    try {
                        shouldObserve = false;
                        alreadyObservedThisAnimationFrame = true;
                        observeNow();
                    }
                    finally {
                        scheduleAtNextAnimationFrame(getWindow(this._referenceDomElement), () => {
                            alreadyObservedThisAnimationFrame = false;
                            update();
                        });
                    }
                }
            };
            this._resizeObserver = new ResizeObserver((entries) => {
                if (entries && entries[0] && entries[0].contentRect) {
                    observedDimension = { width: entries[0].contentRect.width, height: entries[0].contentRect.height };
                }
                else {
                    observedDimension = null;
                }
                shouldObserve = true;
                update();
            });
            this._resizeObserver.observe(this._referenceDomElement);
        }
    }
    stopObserving() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
    }
    observe(dimension) {
        this.measureReferenceDomElement(true, dimension);
    }
    measureReferenceDomElement(emitEvent, dimension) {
        let observedWidth = 0;
        let observedHeight = 0;
        if (dimension) {
            observedWidth = dimension.width;
            observedHeight = dimension.height;
        }
        else if (this._referenceDomElement) {
            observedWidth = this._referenceDomElement.clientWidth;
            observedHeight = this._referenceDomElement.clientHeight;
        }
        observedWidth = Math.max(5, observedWidth);
        observedHeight = Math.max(5, observedHeight);
        if (this._width !== observedWidth || this._height !== observedHeight) {
            this._width = observedWidth;
            this._height = observedHeight;
            if (emitEvent) {
                this._onDidChange.fire();
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxlbWVudFNpemVPYnNlcnZlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9icm93c2VyL2NvbmZpZy9lbGVtZW50U2l6ZU9ic2VydmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUUvRCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFNBQVMsRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRXZGLE1BQU0sT0FBTyxtQkFBb0IsU0FBUSxVQUFVO0lBVWxELFlBQVksbUJBQXVDLEVBQUUsU0FBaUM7UUFDckYsS0FBSyxFQUFFLENBQUM7UUFURCxpQkFBWSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQzNDLGdCQUFXLEdBQWdCLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDO1FBU2xFLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxtQkFBbUIsQ0FBQztRQUNoRCxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ2pCLElBQUksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbEIsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFDNUIsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztJQUNuRCxDQUFDO0lBRWUsT0FBTztRQUN0QixJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDckIsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7SUFFTSxRQUFRO1FBQ2QsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDO0lBQ3BCLENBQUM7SUFFTSxTQUFTO1FB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