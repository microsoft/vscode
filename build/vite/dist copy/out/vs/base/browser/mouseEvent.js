/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as browser from './browser.js';
import { IframeUtils } from './iframe.js';
import * as platform from '../common/platform.js';
export class StandardMouseEvent {
    constructor(targetWindow, e) {
        this.timestamp = Date.now();
        this.browserEvent = e;
        this.leftButton = e.button === 0;
        this.middleButton = e.button === 1;
        this.rightButton = e.button === 2;
        this.buttons = e.buttons;
        this.defaultPrevented = e.defaultPrevented;
        this.target = e.target;
        this.detail = e.detail || 1;
        if (e.type === 'dblclick') {
            this.detail = 2;
        }
        this.ctrlKey = e.ctrlKey;
        this.shiftKey = e.shiftKey;
        this.altKey = e.altKey;
        this.metaKey = e.metaKey;
        if (typeof e.pageX === 'number') {
            this.posx = e.pageX;
            this.posy = e.pageY;
        }
        else {
            // Probably hit by MSGestureEvent
            this.posx = e.clientX + this.target.ownerDocument.body.scrollLeft + this.target.ownerDocument.documentElement.scrollLeft;
            this.posy = e.clientY + this.target.ownerDocument.body.scrollTop + this.target.ownerDocument.documentElement.scrollTop;
        }
        // Find the position of the iframe this code is executing in relative to the iframe where the event was captured.
        const iframeOffsets = IframeUtils.getPositionOfChildWindowRelativeToAncestorWindow(targetWindow, e.view);
        this.posx -= iframeOffsets.left;
        this.posy -= iframeOffsets.top;
    }
    preventDefault() {
        this.browserEvent.preventDefault();
    }
    stopPropagation() {
        this.browserEvent.stopPropagation();
    }
}
export class DragMouseEvent extends StandardMouseEvent {
    constructor(targetWindow, e) {
        super(targetWindow, e);
        // eslint-disable-next-line local/code-no-any-casts
        this.dataTransfer = e.dataTransfer;
    }
}
export class StandardWheelEvent {
    constructor(e, deltaX = 0, deltaY = 0) {
        this.browserEvent = e || null;
        // eslint-disable-next-line local/code-no-any-casts
        this.target = e ? (e.target || e.targetNode || e.srcElement) : null;
        this.deltaY = deltaY;
        this.deltaX = deltaX;
        let shouldFactorDPR = false;
        if (browser.isChrome) {
            // Chrome version >= 123 contains the fix to factor devicePixelRatio into the wheel event.
            // See https://chromium.googlesource.com/chromium/src.git/+/be51b448441ff0c9d1f17e0f25c4bf1ab3f11f61
            const chromeVersionMatch = navigator.userAgent.match(/Chrome\/(\d+)/);
            const chromeMajorVersion = chromeVersionMatch ? parseInt(chromeVersionMatch[1]) : 123;
            shouldFactorDPR = chromeMajorVersion <= 122;
        }
        if (e) {
            // Old (deprecated) wheel events
            // eslint-disable-next-line local/code-no-any-casts
            const e1 = e;
            // eslint-disable-next-line local/code-no-any-casts
            const e2 = e;
            const devicePixelRatio = e.view?.devicePixelRatio || 1;
            // vertical delta scroll
            if (typeof e1.wheelDeltaY !== 'undefined') {
                if (shouldFactorDPR) {
                    // Refs https://github.com/microsoft/vscode/issues/146403#issuecomment-1854538928
                    this.deltaY = e1.wheelDeltaY / (120 * devicePixelRatio);
                }
                else {
                    this.deltaY = e1.wheelDeltaY / 120;
                }
            }
            else if (typeof e2.VERTICAL_AXIS !== 'undefined' && e2.axis === e2.VERTICAL_AXIS) {
                this.deltaY = -e2.detail / 3;
            }
            else if (e.type === 'wheel') {
                // Modern wheel event
                // https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent
                const ev = e;
                if (ev.deltaMode === ev.DOM_DELTA_LINE) {
                    // the deltas are expressed in lines
                    if (browser.isFirefox && !platform.isMacintosh) {
                        this.deltaY = -e.deltaY / 3;
                    }
                    else {
                        this.deltaY = -e.deltaY;
                    }
                }
                else {
                    this.deltaY = -e.deltaY / 40;
                }
            }
            // horizontal delta scroll
            if (typeof e1.wheelDeltaX !== 'undefined') {
                if (browser.isSafari && platform.isWindows) {
                    this.deltaX = -(e1.wheelDeltaX / 120);
                }
                else if (shouldFactorDPR) {
                    // Refs https://github.com/microsoft/vscode/issues/146403#issuecomment-1854538928
                    this.deltaX = e1.wheelDeltaX / (120 * devicePixelRatio);
                }
                else {
                    this.deltaX = e1.wheelDeltaX / 120;
                }
            }
            else if (typeof e2.HORIZONTAL_AXIS !== 'undefined' && e2.axis === e2.HORIZONTAL_AXIS) {
                this.deltaX = -e.detail / 3;
            }
            else if (e.type === 'wheel') {
                // Modern wheel event
                // https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent
                const ev = e;
                if (ev.deltaMode === ev.DOM_DELTA_LINE) {
                    // the deltas are expressed in lines
                    if (browser.isFirefox && !platform.isMacintosh) {
                        this.deltaX = -e.deltaX / 3;
                    }
                    else {
                        this.deltaX = -e.deltaX;
                    }
                }
                else {
                    this.deltaX = -e.deltaX / 40;
                }
            }
            // Assume a vertical scroll if nothing else worked
            if (this.deltaY === 0 && this.deltaX === 0 && e.wheelDelta) {
                if (shouldFactorDPR) {
                    // Refs https://github.com/microsoft/vscode/issues/146403#issuecomment-1854538928
                    this.deltaY = e.wheelDelta / (120 * devicePixelRatio);
                }
                else {
                    this.deltaY = e.wheelDelta / 120;
                }
            }
        }
    }
    preventDefault() {
        this.browserEvent?.preventDefault();
    }
    stopPropagation() {
        this.browserEvent?.stopPropagation();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW91c2VFdmVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxPQUFPLE1BQU0sY0FBYyxDQUFDO0FBQ3hDLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxhQUFhLENBQUM7QUFDMUMsT0FBTyxLQUFLLFFBQVEsTUFBTSx1QkFBdUIsQ0FBQztBQXVCbEQsTUFBTSxPQUFPLGtCQUFrQjtJQW1COUIsWUFBWSxZQUFvQixFQUFFLENBQWE7UUFDOUMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDNUIsSUFBSSxDQUFDLFlBQVksR0FBRyxDQUFDLENBQUM7UUFDdEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxDQUFDLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQztRQUNqQyxJQUFJLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDO1FBQ25DLElBQUksQ0FBQyxXQUFXLEdBQUcsQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUM7UUFDbEMsSUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUMsZ0JBQWdCLENBQUM7UUFFM0MsSUFBSSxDQUFDLE1BQU0sR0FBZ0IsQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUVwQyxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDO1FBQzVCLElBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxVQUFVLEVBQUUsQ0FBQztZQUMzQixJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNqQixDQUFDO1FBQ0QsSUFBSSxDQUFD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