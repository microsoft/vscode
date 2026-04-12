/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DynamicListEventMultiplexer, Event, EventMultiplexer } from '../../../../base/common/event.js';
import { DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
export function createInstanceCapabilityEventMultiplexer(currentInstances, onAddInstance, onRemoveInstance, capabilityId, getEvent) {
    const store = new DisposableStore();
    const multiplexer = store.add(new EventMultiplexer());
    const capabilityListeners = store.add(new DisposableMap());
    function addCapability(instance, capability) {
        const listener = multiplexer.add(Event.map(getEvent(capability), data => ({ instance, data })));
        let instanceCapabilityListeners = capabilityListeners.get(instance.instanceId);
        if (!instanceCapabilityListeners) {
            instanceCapabilityListeners = new DisposableMap();
            capabilityListeners.set(instance.instanceId, instanceCapabilityListeners);
        }
        instanceCapabilityListeners.set(capability, listener);
    }
    // Existing instances
    for (const instance of currentInstances) {
        const capability = instance.capabilities.get(capabilityId);
        if (capability) {
            addCapability(instance, capability);
        }
    }
    // Removed instances
    store.add(onRemoveInstance(instance => {
        capabilityListeners.deleteAndDispose(instance.instanceId);
    }));
    // Added capabilities
    const addCapabilityMultiplexer = store.add(new DynamicListEventMultiplexer(currentInstances, onAddInstance, onRemoveInstance, instance => Event.map(instance.capabilities.createOnDidAddCapabilityOfTypeEvent(capabilityId), changeEvent => ({ instance, changeEvent }))));
    store.add(addCapabilityMultiplexer.event(e => {
        addCapability(e.instance, e.changeEvent);
    }));
    // Removed capabilities
    const removeCapabilityMultiplexer = store.add(new DynamicListEventMultiplexer(currentInstances, onAddInstance, onRemoveInstance, instance => Event.map(instance.capabilities.createOnDidRemoveCapabilityOfTypeEvent(capabilityId), changeEvent => ({ instance, changeEvent }))));
    store.add(removeCapabilityMultiplexer.event(e => {
        capabilityListeners.get(e.instance.instanceId)?.deleteAndDispose(e.changeEvent);
    }));
    return {
        dispose: () => store.dispose(),
        event: multiplexer.event
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxFdmVudHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsRXZlbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxLQUFLLEVBQUUsZ0JBQWdCLEVBQWdDLE1BQU0sa0NBQWtDLENBQUM7QUFDdEksT0FBTyxFQUFFLGFBQWEsRUFBRSxlQUFlLEVBQWUsTUFBTSxzQ0FBc0MsQ0FBQztBQUduRyxNQUFNLFVBQVUsd0NBQXdDLENBQ3ZELGdCQUFxQyxFQUNyQyxhQUF1QyxFQUN2QyxnQkFBMEMsRUFDMUMsWUFBZSxFQUNmLFFBQWlFO0lBRWpFLE1BQU0sS0FBSyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFDcEMsTUFBTSxXQUFXLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLGdCQUFnQixFQUE0QyxDQUFDLENBQUM7SUFDaEcsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksYUFBYSxFQUFxRSxDQUFDLENBQUM7SUFFOUgsU0FBUyxhQUFhLENBQUMsUUFBMkIsRUFBRSxVQUF5QztRQUM1RixNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoRyxJQUFJLDJCQUEyQixHQUFHLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDL0UsSUFBSSxDQUFDLDJCQUEyQixFQUFFLENBQUM7WUFDbEMsMkJBQTJCLEdBQUcs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