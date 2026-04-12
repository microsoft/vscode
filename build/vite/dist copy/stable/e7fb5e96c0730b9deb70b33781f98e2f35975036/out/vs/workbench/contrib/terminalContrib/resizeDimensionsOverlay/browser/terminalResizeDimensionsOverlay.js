/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import './media/terminalResizeDimensionsOverlay.css';
import { $ } from '../../../../../base/browser/dom.js';
import { disposableTimeout } from '../../../../../base/common/async.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
var Constants;
(function (Constants) {
    Constants[Constants["ResizeOverlayHideDelay"] = 500] = "ResizeOverlayHideDelay";
    Constants["VisibleClass"] = "visible";
})(Constants || (Constants = {}));
export class TerminalResizeDimensionsOverlay extends Disposable {
    constructor(_container, xterm) {
        super();
        this._container = _container;
        this._resizeOverlayHideTimeout = this._register(new MutableDisposable());
        this._register(xterm.raw.onResize(dims => this._handleDimensionsChanged(dims)));
        this._register(toDisposable(() => {
            this._resizeOverlay?.remove();
            this._resizeOverlay = undefined;
        }));
    }
    _handleDimensionsChanged(dims) {
        const container = this._container;
        if (!container || !container.isConnected) {
            return;
        }
        const overlay = this._ensureResizeOverlay(container);
        overlay.textContent = `${dims.cols} x ${dims.rows}`;
        overlay.classList.add("visible" /* Constants.VisibleClass */);
        this._resizeOverlayHideTimeout.value = disposableTimeout(() => {
            this._resizeOverlay?.classList.remove("visible" /* Constants.VisibleClass */);
        }, 500 /* Constants.ResizeOverlayHideDelay */);
    }
    _ensureResizeOverlay(container) {
        if (!this._resizeOverlay) {
            this._resizeOverlay = $('.terminal-resize-overlay');
            this._resizeOverlay.setAttribute('role', 'status');
            this._resizeOverlay.setAttribute('aria-live', 'polite');
            container.appendChild(this._resizeOverlay);
        }
        else if (!container.contains(this._resizeOverlay)) {
            container.appendChild(this._resizeOverlay);
        }
        return this._resizeOverlay;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxSZXNpemVEaW1lbnNpb25zT3ZlcmxheS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9yZXNpemVEaW1lbnNpb25zT3ZlcmxheS9icm93c2VyL3Rlcm1pbmFsUmVzaXplRGltZW5zaW9uc092ZXJsYXkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyw2Q0FBNkMsQ0FBQztBQUNyRCxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDdkQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQW9CLE1BQU0seUNBQXlDLENBQUM7QUFJeEgsSUFBVyxTQUdWO0FBSEQsV0FBVyxTQUFTO0lBQ25CLCtFQUE0QixDQUFBO0lBQzVCLHFDQUF3QixDQUFBO0FBQ3pCLENBQUMsRUFIVSxTQUFTLEtBQVQsU0FBUyxRQUduQjtBQUVELE1BQU0sT0FBTywrQkFBZ0MsU0FBUSxVQUFVO0lBSzlELFlBQ2tCLFVBQXVCLEVBQ3hDLEtBQXFCO1FBRXJCLEtBQUssRUFBRSxDQUFDO1FBSFMsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUh4Qiw4QkFBeUIsR0FBbUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixFQUFFLENBQUMsQ0FBQztRQVFwSCxJQUFJLENBQUMsU0FBUyxDQUFFLEtBQXVCLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsR0FBRyxFQUFFO1lBQ2hDLElBQUksQ0FBQyxjQUFjLEVBQUUsTUFBTSxFQUFFLENBQUM7WUFDOUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxTQUFTLENBQUM7UUFDakMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFTyx3QkFBd0IsQ0FBQyxJQUFvQztRQUNwRSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDO1FBQ2xDLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDMUMsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDckQsT0FBTyxDQUFDLFdBQVcsR0FBRyxHQUFHLElBQUksQ0FBQyxJQUFJLE1BQU0sSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3BELE9BQU8sQ0FBQyxTQUFTLENBQUMsR0FBRyx3Q0FBd0IsQ0FBQztRQUU5QyxJQUFJLENBQUMseUJBQXlCLENBQUMsS0FBSyxHQUFHLGlCQUFpQixDQUFDLEdBQUcsRUFBRTtZQUM3RCxJQUFJLENBQUMsY0FBYyxFQUFFLFNBQVMsQ0FBQyxNQUFNLHdDQUF3QixDQUFDO1FBQy9ELENBQUMsNkNBQW1DLENBQUM7SUFDdEMsQ0FBQztJQUVPLG9CQUFvQixDQUFDLFNBQXNCO1FBQ2xELElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDMUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxDQUFDLENBQUMsMEJBQTBCLENBQUMsQ0FBQztZQUNwRCxJQUFJLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFDbkQsSUFBSSxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsV0FBVyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ3hELFNBQVMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQzVDLENBQUM7YUFBTSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUNyRCxTQUFTLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQztRQUM1QyxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsY0FBYyxDQUFDO0lBQzVCLENBQUM7Q0FDRCJ9