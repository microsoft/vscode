/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as dom from './dom.js';
import { DisposableStore, toDisposable } from '../common/lifecycle.js';
export class GlobalPointerMoveMonitor {
    constructor() {
        this._hooks = new DisposableStore();
        this._pointerMoveCallback = null;
        this._onStopCallback = null;
    }
    dispose() {
        this.stopMonitoring(false);
        this._hooks.dispose();
    }
    stopMonitoring(invokeStopCallback, browserEvent) {
        if (!this.isMonitoring()) {
            // Not monitoring
            return;
        }
        // Unhook
        this._hooks.clear();
        this._pointerMoveCallback = null;
        const onStopCallback = this._onStopCallback;
        this._onStopCallback = null;
        if (invokeStopCallback && onStopCallback) {
            onStopCallback(browserEvent);
        }
    }
    isMonitoring() {
        return !!this._pointerMoveCallback;
    }
    startMonitoring(initialElement, pointerId, initialButtons, pointerMoveCallback, onStopCallback) {
        if (this.isMonitoring()) {
            this.stopMonitoring(false);
        }
        this._pointerMoveCallback = pointerMoveCallback;
        this._onStopCallback = onStopCallback;
        let eventSource = initialElement;
        try {
            initialElement.setPointerCapture(pointerId);
            this._hooks.add(toDisposable(() => {
                try {
                    initialElement.releasePointerCapture(pointerId);
                }
                catch (err) {
                    // See https://github.com/microsoft/vscode/issues/161731
                    //
                    // `releasePointerCapture` sometimes fails when being invoked with the exception:
                    //     DOMException: Failed to execute 'releasePointerCapture' on 'Element':
                    //     No active pointer with the given id is found.
                    //
                    // There's no need to do anything in case of failure
                }
            }));
        }
        catch (err) {
            // See https://github.com/microsoft/vscode/issues/144584
            // See https://github.com/microsoft/vscode/issues/146947
            // `setPointerCapture` sometimes fails when being invoked
            // from a `mousedown` listener on macOS and Windows
            // and it always fails on Linux with the exception:
            //     DOMException: Failed to execute 'setPointerCapture' on 'Element':
            //     No active pointer with the given id is found.
            // In case of failure, we bind the listeners on the window
            eventSource = dom.getWindow(initialElement);
        }
        this._hooks.add(dom.addDisposableListener(eventSource, dom.EventType.POINTER_MOVE, (e) => {
            if (e.buttons !== initialButtons) {
                // Buttons state has changed in the meantime
                this.stopMonitoring(true);
                return;
            }
            e.preventDefault();
            this._pointerMoveCallback(e);
        }));
        this._hooks.add(dom.addDisposableListener(eventSource, dom.EventType.POINTER_UP, (e) => this.stopMonitoring(true)));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2xvYmFsUG9pbnRlck1vdmVNb25pdG9yLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9icm93c2VyL2dsb2JhbFBvaW50ZXJNb3ZlTW9uaXRvci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLFVBQVUsQ0FBQztBQUNoQyxPQUFPLEVBQUUsZUFBZSxFQUFlLFlBQVksRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBVXBGLE1BQU0sT0FBTyx3QkFBd0I7SUFBckM7UUFFa0IsV0FBTSxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDeEMseUJBQW9CLEdBQWdDLElBQUksQ0FBQztRQUN6RCxvQkFBZSxHQUEyQixJQUFJLENBQUM7SUEyRnhELENBQUM7SUF6Rk8sT0FBTztRQUNiLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDM0IsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUN2QixDQUFDO0lBRU0sY0FBYyxDQUFDLGtCQUEyQixFQUFFLFlBQTJDO1FBQzdGLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQztZQUMxQixpQkFBaUI7WUFDakIsT0FBTztRQUNSLENBQUM7UUFFRCxTQUFTO1FBQ1QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNwQixJQUFJLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDO1FBQ2pDLE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUM7UUFDNUMsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7UUFFNUIsSUFBSSxrQkFBa0IsSUFBSSxjQUFjLEVBQUUsQ0FBQztZQUMxQyxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDOUIsQ0FBQztJQUNGLENBQUM7SUFFTSxZQUFZO1FBQ2xCLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQztJQUNwQyxDQUFDO0lBRU0sZUFBZSxDQUNyQixjQUF1QixFQUN2QixTQUFpQixFQUNqQixjQUFzQixFQUN0QixtQkFBeUMsRUFDekMsY0FBK0I7UUFFL0IsSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzVCLENBQUM7UUFDRCxJQUFJLENBQUMsb0JBQW9CLEdBQUcsbUJBQW1CLENBQUM7UUFDaEQsSUFBSSxDQUFDLGVBQWUsR0FBRyxjQUFjLENBQUM7UUFFdEMsSUFBSSxXQUFXLEdBQXFCLGNBQWMsQ0FBQztRQUVuRCxJQUFJLENBQUM7WUFDSixjQUFjLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDNUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEdBQUcsRUFBRTtnQkFDakMsSUFBSSxDQUFDO29CQUNKLGNBQWMsQ0FBQyxxQkFBcUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDakQsQ0FBQztnQkFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO29CQUNkLHdEQUF3RDtvQkFDeEQsRUFBRTtvQkFDRixpRkFBaUY7b0JBQ2pGLDRFQUE0RTtvQkFDNUUsb0RBQW9EO29CQUNwRCxFQUFFO29CQUNGLG9EQUFvRDtnQkFDckQsQ0FBQztZQUNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDTCxDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNkLHdEQUF3RDtZQUN4RCx3REFBd0Q7WUFDeEQseURBQXlEO1lBQ3pELG1EQUFtRDtZQUNuRCxtREFBbUQ7WUFDbkQsd0VBQXdFO1lBQ3hFLG9EQUFvRDtZQUNwRCwwREFBMEQ7WUFDMUQsV0FBVyxHQUFHLEdBQUcsQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUVELElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FDeEMsV0FBVyxFQUNYLEdBQUcsQ0FBQyxTQUFTLENBQUMsWUFBWSxFQUMxQixDQUFDLENBQUMsRUFBRSxFQUFFO1lBQ0wsSUFBSSxDQUFDLENBQUMsT0FBTyxLQUFLLGNBQWMsRUFBRSxDQUFDO2dCQUNsQyw0Q0FBNEM7Z0JBQzVDLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzFCLE9BQU87WUFDUixDQUFDO1lBRUQsQ0FBQyxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ25CLElBQUksQ0FBQyxvQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMvQixDQUFDLENBQ0QsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLHFCQUFxQixDQUN4QyxXQUFXLEVBQ1gsR0FBRyxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQ3hCLENBQUMsQ0FBZSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUM5QyxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0QifQ==