/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { Event, EventMultiplexer } from 'vs/base/common/event';
import { DisposableMap, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ITerminalCapabilityImplMap, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';

export function createDynamicListEventMultiplexer<TItem, TEventType>(
	items: TItem[],
	onAddItem: Event<TItem>,
	onRemoveItem: Event<TItem>,
	getEvent: (item: TItem) => Event<TEventType>
): { dispose(): void; event: Event<TEventType> } {
	const store = new DisposableStore();
	const multiplexer = store.add(new EventMultiplexer<TEventType>());
	const itemListeners = store.add(new DisposableMap<TItem, IDisposable>());

	function addInstance(instance: TItem) {
		itemListeners.set(instance, multiplexer.add(getEvent(instance)));
	}

	// Existing items
	for (const instance of items) {
		addInstance(instance);
	}

	// Added items
	store.add(onAddItem(instance => {
		addInstance(instance);
	}));

	// Removed items
	store.add(onRemoveItem(instance => {
		itemListeners.deleteAndDispose(instance);
	}));

	return {
		dispose: () => store.dispose(),
		event: multiplexer.event
	};
}

export function createInstanceCapabilityEventMultiplexer<T extends TerminalCapability, K>(
	currentInstances: ITerminalInstance[],
	onAddInstance: Event<ITerminalInstance>,
	onRemoveInstance: Event<ITerminalInstance>,
	capabilityId: T,
	getEvent: (capability: ITerminalCapabilityImplMap[T]) => Event<K>
): { dispose(): void; event: Event<{ instance: ITerminalInstance; data: K }> } {
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
	const addCapabilityMultiplexer = createDynamicListEventMultiplexer(
		currentInstances,
		onAddInstance,
		onRemoveInstance,
		instance => Event.map(instance.capabilities.onDidAddCapability, changeEvent => ({ instance, changeEvent }))
	);
	addCapabilityMultiplexer.event(e => {
		if (e.changeEvent.id === capabilityId) {
			addCapability(e.instance, e.changeEvent.capability);
		}
	});

	// Removed capabilities
	const removeCapabilityMultiplexer = createDynamicListEventMultiplexer(
		currentInstances,
		onAddInstance,
		onRemoveInstance,
		instance => instance.capabilities.onDidRemoveCapability
	);
	removeCapabilityMultiplexer.event(e => {
		if (e.id === capabilityId) {
			capabilityListeners.deleteAndDispose(e.capability);
		}
	});

	return {
		dispose: () => store.dispose(),
		event: multiplexer.event
	};
}
