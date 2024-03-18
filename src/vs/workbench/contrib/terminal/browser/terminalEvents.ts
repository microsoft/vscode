/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { DynamicListEventMultiplexer, Event, EventMultiplexer, IDynamicListEventMultiplexer } from 'vs/base/common/event';
import { DisposableMap, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ITerminalCapabilityImplMap, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';

export function createInstanceCapabilityEventMultiplexer<T extends TerminalCapability, K>(
	currentInstances: ITerminalInstance[],
	onAddInstance: Event<ITerminalInstance>,
	onRemoveInstance: Event<ITerminalInstance>,
	capabilityId: T,
	getEvent: (capability: ITerminalCapabilityImplMap[T]) => Event<K>
): IDynamicListEventMultiplexer<{ instance: ITerminalInstance; data: K }> {
	const store = new DisposableStore();
	const multiplexer = store.add(new EventMultiplexer<{ instance: ITerminalInstance; data: K }>());
	const capabilityListeners = store.add(new DisposableMap<ITerminalCapabilityImplMap[T], IDisposable>());

	function addCapability(instance: ITerminalInstance, capability: ITerminalCapabilityImplMap[T]) {
		const listener = multiplexer.add(Event.map(getEvent(capability), data => ({ instance, data })));
		capabilityListeners.set(capability, listener);
	}

	// Existing capabilities
	for (const instance of currentInstances) {
		const capability = instance.capabilities.get(capabilityId);
		if (capability) {
			addCapability(instance, capability);
		}
	}

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
		instance => instance.capabilities.onDidRemoveCapability
	));
	store.add(removeCapabilityMultiplexer.event(e => {
		if (e.id === capabilityId) {
			capabilityListeners.deleteAndDispose(e.capability);
		}
	}));

	return {
		dispose: () => store.dispose(),
		event: multiplexer.event
	};
}
