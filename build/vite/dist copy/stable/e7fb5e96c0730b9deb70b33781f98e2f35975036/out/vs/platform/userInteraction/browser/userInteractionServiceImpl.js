/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getWindow, ModifierKeyEmitter, trackFocus } from '../../../base/browser/dom.js';
import { observableFromEvent, observableValue } from '../../../base/common/observable.js';
import { registerSingleton } from '../../instantiation/common/extensions.js';
import { IUserInteractionService } from './userInteractionService.js';
export class UserInteractionService {
    constructor() {
        this._modifierObservables = new WeakMap();
    }
    readModifierKeyStatus(element, reader) {
        const win = element instanceof Window ? element : getWindow(element);
        let obs = this._modifierObservables.get(win);
        if (!obs) {
            const emitter = ModifierKeyEmitter.getInstance();
            obs = observableFromEvent(this, emitter.event, () => ({
                ctrlKey: emitter.keyStatus.ctrlKey,
                shiftKey: emitter.keyStatus.shiftKey,
                altKey: emitter.keyStatus.altKey,
                metaKey: emitter.keyStatus.metaKey,
            }));
            this._modifierObservables.set(win, obs);
        }
        return obs.read(reader);
    }
    createFocusTracker(element, store) {
        const tracker = store.add(trackFocus(element));
        const hasFocusWithin = (el) => {
            if (el instanceof Window) {
                return el.document.hasFocus();
            }
            const shadowRoot = el.getRootNode() instanceof ShadowRoot ? el.getRootNode() : null;
            const activeElement = shadowRoot ? shadowRoot.activeElement : el.ownerDocument.activeElement;
            return el.contains(activeElement);
        };
        const value = observableValue('isFocused', hasFocusWithin(element));
        store.add(tracker.onDidFocus(() => value.set(true, undefined)));
        store.add(tracker.onDidBlur(() => value.set(false, undefined)));
        return value;
    }
    createHoverTracker(element, store) {
        const value = observableValue('isHovered', false);
        const onEnter = () => value.set(true, undefined);
        const onLeave = () => value.set(false, undefined);
        element.addEventListener('mouseenter', onEnter);
        element.addEventListener('mouseleave', onLeave);
        store.add({
            dispose: () => {
                element.removeEventListener('mouseenter', onEnter);
                element.removeEventListener('mouseleave', onLeave);
            }
        });
        return value;
    }
    createDomFocusTracker(element) {
        return trackFocus(element);
    }
}
registerSingleton(IUserInteractionService, UserInteractionService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckludGVyYWN0aW9uU2VydmljZUltcGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS91c2VySW50ZXJhY3Rpb24vYnJvd3Nlci91c2VySW50ZXJhY3Rpb25TZXJ2aWNlSW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsU0FBUyxFQUFpQixrQkFBa0IsRUFBRSxVQUFVLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUV4RyxPQUFPLEVBQXdCLG1CQUFtQixFQUFFLGVBQWUsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ2hILE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNoRyxPQUFPLEVBQXNCLHVCQUF1QixFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFMUYsTUFBTSxPQUFPLHNCQUFzQjtJQUFuQztRQUdrQix5QkFBb0IsR0FBRyxJQUFJLE9BQU8sRUFBMkMsQ0FBQztJQXlEaEcsQ0FBQztJQXZEQSxxQkFBcUIsQ0FBQyxPQUE2QixFQUFFLE1BQTJCO1FBQy9FLE1BQU0sR0FBRyxHQUFHLE9BQU8sWUFBWSxNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3JFLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ1YsTUFBTSxPQUFPLEdBQUcsa0JBQWtCLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDakQsR0FBRyxHQUFHLG1CQUFtQixDQUN4QixJQUFJLEVBQ0osT0FBTyxDQUFDLEtBQUssRUFDYixHQUFHLEVBQUUsQ0FBQyxDQUFDO2dCQUNOLE9BQU8sRUFBRSxPQUFPLENBQUMs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