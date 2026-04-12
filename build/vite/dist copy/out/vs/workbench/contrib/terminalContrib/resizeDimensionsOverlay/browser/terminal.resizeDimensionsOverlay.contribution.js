/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { registerTerminalContribution } from '../../../terminal/browser/terminalExtensions.js';
import { timeout } from '../../../../../base/common/async.js';
import { TerminalResizeDimensionsOverlay } from './terminalResizeDimensionsOverlay.js';
class TerminalResizeDimensionsOverlayContribution extends Disposable {
    static { this.ID = 'terminal.resizeDimensionsOverlay'; }
    constructor(_ctx) {
        super();
        this._ctx = _ctx;
        this._overlay = this._register(new MutableDisposable());
    }
    xtermOpen(xterm) {
        // Initialize resize dimensions overlay
        this._ctx.processManager.ptyProcessReady.then(() => {
            // Wait a second to avoid resize events during startup like when opening a terminal or
            // when a terminal reconnects. Ideally we'd have an actual event to listen to here.
            timeout(1000).then(() => {
                if (!this._store.isDisposed) {
                    this._overlay.value = new TerminalResizeDimensionsOverlay(this._ctx.instance.domElement, xterm);
                }
            });
        });
    }
}
registerTerminalContribution(TerminalResizeDimensionsOverlayContribution.ID, TerminalResizeDimensionsOverlayContribution);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwucmVzaXplRGltZW5zaW9uc092ZXJsYXkuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3Jlc2l6ZURpbWVuc2lvbnNPdmVybGF5L2Jyb3dzZXIvdGVybWluYWwucmVzaXplRGltZW5zaW9uc092ZXJsYXkuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxVQUFVLEVBQUUsaUJBQWlCLEVBQW9CLE1BQU0seUNBQXlDLENBQUM7QUFFMUcsT0FBTyxFQUFFLDRCQUE0QixFQUFxQyxNQUFNLGlEQUFpRCxDQUFDO0FBQ2xJLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsK0JBQStCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUV2RixNQUFNLDJDQUE0QyxTQUFRLFVBQVU7YUFDbkQsT0FBRSxHQUFHLGtDQUFrQyxBQUFyQyxDQUFzQztJQUl4RCxZQUNrQixJQUFrQztRQUVuRCxLQUFLLEVBQUUsQ0FBQztRQUZTLFNBQUksR0FBSixJQUFJLENBQThCO1FBSG5DLGFBQVEsR0FBbUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixFQUFFLENBQUMsQ0FBQztJQU1wRyxDQUFDO0lBRUQsU0FBUyxDQUFDLEtBQWlEO1FBQzFELHVDQUF1QztRQUN2QyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUNsRCxzRkFBc0Y7WUFDdEYsbUZBQW1GO1lBQ25GLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUN2QixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDN0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEdBQUcsSUFBSSwrQkFBK0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ2pHLENBQUM7WUFDRixDQUFDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0osQ0FBQzs7QUFFRiw0QkFBNEIsQ0FBQywyQ0FBMkMsQ0FBQyxFQUFFLEVBQUUsMkNBQTJDLENBQUMsQ0FBQyJ9