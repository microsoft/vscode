/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { constObservable } from '../../../base/common/observable.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Emitter } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const IUserInteractionService = createDecorator('userInteractionService');
/**
 * Mock implementation of IUserInteractionService that can be used for testing
 * or simulating specific interaction states.
 */
export class MockUserInteractionService {
    constructor(_simulateFocus = true, _simulateHover = false, _modifiers = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }) {
        this._simulateFocus = _simulateFocus;
        this._simulateHover = _simulateHover;
        this._modifiers = _modifiers;
    }
    readModifierKeyStatus(_element, _reader) {
        return this._modifiers;
    }
    createFocusTracker(_element, _store) {
        return constObservable(this._simulateFocus);
    }
    createHoverTracker(_element, _store) {
        return constObservable(this._simulateHover);
    }
    createDomFocusTracker(_element) {
        const tracker = new class extends Disposable {
            constructor() {
                super(...arguments);
                this._onDidFocus = this._register(new Emitter());
                this.onDidFocus = this._onDidFocus.event;
                this._onDidBlur = this._register(new Emitter());
                this.onDidBlur = this._onDidBlur.event;
            }
            refreshState() { }
            fireFocus() { this._onDidFocus.fire(); }
        };
        if (this._simulateFocus) {
            queueMicrotask(() => tracker.fireFocus());
        }
        return tracker;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckludGVyYWN0aW9uU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3VzZXJJbnRlcmFjdGlvbi9icm93c2VyL3VzZXJJbnRlcmFjdGlvblNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBd0IsTUFBTSxvQ0FBb0MsQ0FBQztBQUMzRixPQUFPLEVBQUUsVUFBVSxFQUFtQixNQUFNLG1DQUFtQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFHOUUsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsZUFBZSxDQUEwQix3QkFBd0IsQ0FBQyxDQUFDO0FBcUMxRzs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sMEJBQTBCO0lBR3RDLFlBQ2tCLGlCQUEwQixJQUFJLEVBQzlCLGlCQUEwQixLQUFLLEVBQy9CLGFBQWlDLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRTtRQUZuRyxtQkFBYyxHQUFkLGNBQWMsQ0FBZ0I7UUFDOUIsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBQy9CLGVBQVUsR0FBVixVQUFVLENBQXlGO0lBQ2pILENBQUM7SUFFTCxxQkFBcUIsQ0FBQyxRQUE4QixFQUFFLE9BQTRCO1FBQ2pGLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQztJQUN4QixDQUFDO0lBRUQsa0JBQWtCLENBQUMsUUFBOEIsRUFBRSxNQUF1QjtRQUN6RSxPQUFPLGVBQWUsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVELGtCQUFrQixDQUFDLFFBQWlCLEVBQUUsTUFBdUI7UUFDNUQsT0FBTyxlQUFlLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQzdDLENBQUM7SUFFRCxxQkFBcUIsQ0FBQyxRQUFxQjtRQUMxQyxNQUFNLE9BQU8sR0FBRyxJQUFJLEtBQU0sU0FBUSxVQUFVO1lBQXhCOztnQkFDRixnQkFBVyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO2dCQUMxRCxlQUFVLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUM7Z0JBQzVCLGVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxFQUFRLENBQUMsQ0FBQztnQkFDekQsY0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDO1lBRzVDLENBQUM7WUFGQSxZQUFZLEtBQVcsQ0FBQztZQUN4QixTQUFTLEtBQVcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7U0FDOUMsQ0FBQztRQUNGLElBQUksSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3pCLGNBQWMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUMzQyxDQUFDO1FBQ0QsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQztDQUNEIn0=