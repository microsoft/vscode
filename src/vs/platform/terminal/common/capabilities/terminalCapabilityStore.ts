/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { memoize } from '../../../../base/common/decorators.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICommandDetectionCapability, ITerminalCapabilityImplMap, ITerminalCapabilityStore, TerminalCapability, type AnyTerminalCapabilityChangeEvent, type ICwdDetectionCapability } from './capabilities.js';

export class TerminalCapabilityStore extends Disposable implements ITerminalCapabilityStore {
	private _map: Map<TerminalCapability, ITerminalCapabilityImplMap[TerminalCapability]> = new Map();

	private readonly _onDidAddCapability = this._register(new Emitter<AnyTerminalCapabilityChangeEvent>());
	get onDidAddCapability() { return this._onDidAddCapability.event; }
	private readonly _onDidRemoveCapability = this._register(new Emitter<AnyTerminalCapabilityChangeEvent>());
	get onDidRemoveCapability() { return this._onDidRemoveCapability.event; }

	@memoize
	get onDidChangeCapabilities() {
		return Event.map(Event.any(
			this._onDidAddCapability.event,
			this._onDidRemoveCapability.event
		), () => void 0, this._store);
	}
	@memoize
	get onDidAddCommandDetectionCapability() {
		return Event.map(Event.filter(this.onDidAddCapability, e => e.id === TerminalCapability.CommandDetection, this._store), e => e.capability as ICommandDetectionCapability, this._store);
	}
	@memoize
	get onDidRemoveCommandDetectionCapability() {
		return Event.map(Event.filter(this.onDidRemoveCapability, e => e.id === TerminalCapability.CommandDetection, this._store), () => void 0, this._store);
	}
	@memoize
	get onDidAddCwdDetectionCapability() {
		return Event.map(Event.filter(this.onDidAddCapability, e => e.id === TerminalCapability.CwdDetection, this._store), e => e.capability as ICwdDetectionCapability, this._store);
	}
	@memoize
	get onDidRemoveCwdDetectionCapability() {
		return Event.map(Event.filter(this.onDidRemoveCapability, e => e.id === TerminalCapability.CwdDetection, this._store), () => void 0, this._store);
	}

	get items(): IterableIterator<TerminalCapability> {
		return this._map.keys();
	}

	createOnDidRemoveCapabilityOfTypeEvent<T extends TerminalCapability>(type: T): Event<ITerminalCapabilityImplMap[T]> {
		return Event.map(Event.filter(this.onDidRemoveCapability, e => e.id === type), e => e.capability as ITerminalCapabilityImplMap[T]);
	}
	createOnDidAddCapabilityOfTypeEvent<T extends TerminalCapability>(type: T): Event<ITerminalCapabilityImplMap[T]> {
		return Event.map(Event.filter(this.onDidAddCapability, e => e.id === type), e => e.capability as ITerminalCapabilityImplMap[T]);
	}

	add<T extends TerminalCapability>(capability: T, impl: ITerminalCapabilityImplMap[T]) {
		this._map.set(capability, impl);
		this._onDidAddCapability.fire(createCapabilityEvent(capability, impl));
	}

	get<T extends TerminalCapability>(capability: T): ITerminalCapabilityImplMap[T] | undefined {
		// HACK: This isn't totally safe since the Map key and value are not connected
		return this._map.get(capability) as ITerminalCapabilityImplMap[T] | undefined;
	}

	remove(capability: TerminalCapability) {
		const impl = this._map.get(capability);
		if (!impl) {
			return;
		}
		this._map.delete(capability);
		this._onDidRemoveCapability.fire(createCapabilityEvent(capability, impl));
	}

	has(capability: TerminalCapability) {
		return this._map.has(capability);
	}
}

export class TerminalCapabilityStoreMultiplexer extends Disposable implements ITerminalCapabilityStore {
	readonly _stores: ITerminalCapabilityStore[] = [];

	private readonly _onDidAddCapability = this._register(new Emitter<AnyTerminalCapabilityChangeEvent>());
	get onDidAddCapability() { return this._onDidAddCapability.event; }
	private readonly _onDidRemoveCapability = this._register(new Emitter<AnyTerminalCapabilityChangeEvent>());
	get onDidRemoveCapability() { return this._onDidRemoveCapability.event; }

	@memoize
	get onDidChangeCapabilities() {
		return Event.map(Event.any(
			this._onDidAddCapability.event,
			this._onDidRemoveCapability.event
		), () => void 0, this._store);
	}
	@memoize
	get onDidAddCommandDetectionCapability() {
		return Event.map(Event.filter(this.onDidAddCapability, e => e.id === TerminalCapability.CommandDetection, this._store), e => e.capability as ICommandDetectionCapability, this._store);
	}
	@memoize
	get onDidRemoveCommandDetectionCapability() {
		return Event.map(Event.filter(this.onDidRemoveCapability, e => e.id === TerminalCapability.CommandDetection, this._store), () => void 0, this._store);
	}
	@memoize
	get onDidAddCwdDetectionCapability() {
		return Event.map(Event.filter(this.onDidAddCapability, e => e.id === TerminalCapability.CwdDetection, this._store), e => e.capability as ICwdDetectionCapability, this._store);
	}
	@memoize
	get onDidRemoveCwdDetectionCapability() {
		return Event.map(Event.filter(this.onDidRemoveCapability, e => e.id === TerminalCapability.CwdDetection, this._store), () => void 0, this._store);
	}

	get items(): IterableIterator<TerminalCapability> {
		return this._items();
	}

	createOnDidRemoveCapabilityOfTypeEvent<T extends TerminalCapability>(type: T): Event<ITerminalCapabilityImplMap[T]> {
		return Event.map(Event.filter(this.onDidRemoveCapability, e => e.id === type), e => e.capability as ITerminalCapabilityImplMap[T]);
	}
	createOnDidAddCapabilityOfTypeEvent<T extends TerminalCapability>(type: T): Event<ITerminalCapabilityImplMap[T]> {
		return Event.map(Event.filter(this.onDidAddCapability, e => e.id === type), e => e.capability as ITerminalCapabilityImplMap[T]);
	}

	private *_items(): IterableIterator<TerminalCapability> {
		for (const store of this._stores) {
			for (const c of store.items) {
				yield c;
			}
		}
	}

	has(capability: TerminalCapability): boolean {
		for (const store of this._stores) {
			for (const c of store.items) {
				if (c === capability) {
					return true;
				}
			}
		}
		return false;
	}

	get<T extends TerminalCapability>(capability: T): ITerminalCapabilityImplMap[T] | undefined {
		for (const store of this._stores) {
			const c = store.get(capability);
			if (c) {
				return c;
			}
		}
		return undefined;
	}

	add(store: ITerminalCapabilityStore) {
		this._stores.push(store);
		for (const capability of store.items) {
			this._onDidAddCapability.fire(createCapabilityEvent(capability, store.get(capability)!));
		}
		this._register(store.onDidAddCapability(e => this._onDidAddCapability.fire(e)));
		this._register(store.onDidRemoveCapability(e => this._onDidRemoveCapability.fire(e)));
	}
}

function createCapabilityEvent<T extends TerminalCapability>(capability: T, impl: ITerminalCapabilityImplMap[T]): AnyTerminalCapabilityChangeEvent {
	// HACK: This cast is required to convert a generic type to a discriminated union, this is
	// necessary in order to enable type narrowing on the event consumer side.
	// eslint-disable-next-line local/code-no-dangerous-type-assertions
	return { id: capability, capability: impl } as AnyTerminalCapabilityChangeEvent;
}
