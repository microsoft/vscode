/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { onUnexpectedError } from '../../../base/common/errors.js';
import { ExtensionIdentifier } from '../../extensions/common/extensions.js';
export class ImplicitActivationEventsImpl {
    constructor() {
        this._generators = new Map();
        this._cache = new WeakMap();
    }
    register(extensionPointName, generator) {
        this._generators.set(extensionPointName, generator);
    }
    /**
     * This can run correctly only on the renderer process because that is the only place
     * where all extension points and all implicit activation events generators are known.
     */
    readActivationEvents(extensionDescription) {
        if (!this._cache.has(extensionDescription)) {
            this._cache.set(extensionDescription, this._readActivationEvents(extensionDescription));
        }
        return this._cache.get(extensionDescription);
    }
    /**
     * This can run correctly only on the renderer process because that is the only place
     * where all extension points and all implicit activation events generators are known.
     */
    createActivationEventsMap(extensionDescriptions) {
        const result = Object.create(null);
        for (const extensionDescription of extensionDescriptions) {
            const activationEvents = this.readActivationEvents(extensionDescription);
            if (activationEvents.length > 0) {
                result[ExtensionIdentifier.toKey(extensionDescription.identifier)] = activationEvents;
            }
        }
        return result;
    }
    _readActivationEvents(desc) {
        if (typeof desc.main === 'undefined' && typeof desc.browser === 'undefined') {
            return [];
        }
        const activationEvents = (Array.isArray(desc.activationEvents) ? desc.activationEvents.slice(0) : []);
        for (let i = 0; i < activationEvents.length; i++) {
            // TODO@joao: there's no easy way to contribute this
            if (activationEvents[i] === 'onUri') {
                activationEvents[i] = `onUri:${ExtensionIdentifier.toKey(desc.identifier)}`;
            }
        }
        if (!desc.contributes) {
            // no implicit activation events
            return activationEvents;
        }
        for (const extPointName in desc.contributes) {
            const generator = this._generators.get(extPointName);
            if (!generator) {
                // There's no generator for this extension point
                continue;
            }
            const contrib = desc.contributes[extPointName];
            const contribArr = Array.isArray(contrib) ? contrib : [contrib];
            try {
                activationEvents.push(...generator(contribArr));
            }
            catch (err) {
                onUnexpectedError(err);
            }
        }
        return activationEvents;
    }
}
export const ImplicitActivationEvents = new ImplicitActivationEventsImpl();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1wbGljaXRBY3RpdmF0aW9uRXZlbnRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vaW1wbGljaXRBY3RpdmF0aW9uRXZlbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ25FLE9BQU8sRUFBRSxtQkFBbUIsRUFBeUIsTUFBTSx1Q0FBdUMsQ0FBQztBQU1uRyxNQUFNLE9BQU8sNEJBQTRCO0lBQXpDO1FBRWtCLGdCQUFXLEdBQUcsSUFBSSxHQUFHLEVBQStDLENBQUM7UUFDckUsV0FBTSxHQUFHLElBQUksT0FBTyxFQUFtQyxDQUFDO0lBb0UxRSxDQUFDO0lBbEVPLFFBQVEsQ0FBSSxrQkFBMEIsRUFBRSxTQUF3QztRQUN0RixJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRSxTQUFnRCxDQUFDLENBQUM7SUFDNUYsQ0FBQztJQUVEOzs7T0FHRztJQUNJLG9CQUFvQixDQUFDLG9CQUEyQztRQUN0RSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUMsRUFBRSxDQUFDO1lBQzVDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLG9CQUFvQixFQUFFLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7UUFDekYsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLENBQUUsQ0FBQztJQUMvQyxDQUFDO0lBRUQ7OztPQUdHO0lBQ0kseUJBQXlCLENBQUMscUJBQThDO1FBQzlFLE1BQU0sTUFBTSxHQUF3QyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3hFLEtBQUssTUFBTSxvQkFBb0IsSUFBSSxxQkFBcUIsRUFBRSxDQUFDO1lBQzFELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLG9CQUFvQixDQUFDLENBQUM7WUFDekUsSUFBSSxnQkFBZ0IsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ2pDLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsb0JBQW9CLENBQUMsVUFBVSxDQUFDLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQztZQUN2RixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVPLHFCQUFxQixDQUFDLElBQTJCO1FBQ3hELElBQUksT0FBTyxJQUFJLENBQUMsSUFBSSxLQUFLLFdBQVcsSUFBSSxPQUFPLElBQUksQ0FBQyxPQUFPLEtBQUssV0FBVyxFQUFFLENBQUM7WUFDN0UsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBRUQsTUFBTSxnQkFBZ0IsR0FBYSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRWhILEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUNsRCxvREFBb0Q7WUFDcEQsSUFBSSxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsS0FBSyxPQUFPLEVBQUUsQ0FBQztnQkFDckMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEdBQUcsU0FBUyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDN0UsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3ZCLGdDQUFnQztZQUNoQyxPQUFPLGdCQUFnQixDQUFDO1FBQ3pCLENBQUM7UUFFRCxLQUFLLE1BQU0sWUFBWSxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUM3QyxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUNyRCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ2hCLGdEQUFnRDtnQkFDaEQsU0FBUztZQUNWLENBQUM7WUFDRCxNQUFNLE9BQU8sR0FBSSxJQUFJLENBQUMsV0FBMEMsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUMvRSxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDaEUsSUFBSSxDQUFDO2dCQUNKLGdCQUFnQixDQUFDLElBQUksQ0FBQyxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ2pELENBQUM7WUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO2dCQUNkLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3hCLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxnQkFBZ0IsQ0FBQztJQUN6QixDQUFDO0NBQ0Q7QUFFRCxNQUFNLENBQUMsTUFBTSx3QkFBd0IsR0FBaUMsSUFBSSw0QkFBNEIsRUFBRSxDQUFDIn0=