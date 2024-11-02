/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance } from './terminal.js';
import { DynamicListEventMultiplexer, Event, EventMultiplexer, IDynamicListEventMultiplexer } from '../../../../base/common/event.js';
import { DisposableMap, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { ITerminalCapabilityImplMap, TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';

export function createInstanceCapabilityEventMultiplexer<T extends TerminalCapability, K>(
	currentInstances: ITerminalInstance[],
	onAddInstance: Event<ITerminalInstance>,
	onRemoveInstance: Event<ITerminalInstance>,
	capabilityId: T,
	getEvent: (capability: ITerminalCapabilityImplMap[T]) => Event<K>
): IDynamicListEventMultiplexer<{ instance: ITerminalInstance; data: K }> {
	const store = new DisposableStore();
	const multiplexer = store.add(new EventMultiplexer<{ instance: ITerminalInstance; data: K }>());
	const capabilityListeners = store.add(new DisposableMap<number, DisposableMap<ITerminalCapabilityImplMap[T], IDisposable>>());

	function addCapability(instance: ITerminalInstance, capability: ITerminalCapabilityImplMap[T]) {
		const listener = multiplexer.add(Event.map(getEvent(capability), data => ({ instance, data })));
		let instanceCapabilityListeners = capabilityListeners.get(instance.instanceId);
		if (!instanceCapabilityListeners) {
			instanceCapabilityListeners = new DisposableMap<ITerminalCapabilityImplMap[T], IDisposable>();
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
	const addCapabilityMultiplexer = store.add(new DynamicListEventMultiplexer(
		currentInstances,
		onAddInstance,
		onRemoveInstance,
		instance => Event.map(instance.capabilities.onDidAddCapability, changeEvent => ({ instance, changeEvent }))
	));
	store.add(addCapabilityMultiplexer.event(e => {
		if (e.changeEvent.id === capabilityId) {
			addCapability(e.instance, e.changeEvent.capability);
		}
	}));

	// Removed capabilities
	const removeCapabilityMultiplexer = store.add(new DynamicListEventMultiplexer(
		currentInstances,
		onAddInstance,
		onRemoveInstance,
		instance => Event.map(instance.capabilities.onDidRemoveCapability, changeEvent => ({ instance, changeEvent }))
	));
	store.add(removeCapabilityMultiplexer.event(e => {
		if (e.changeEvent.id === capabilityId) {
			capabilityListeners.get(e.instance.instanceId)?.deleteAndDispose(e.changeEvent.id);
		}
	}));

	return {
		dispose: () => store.dispose(),
		event: multiplexer.event
	};
}
