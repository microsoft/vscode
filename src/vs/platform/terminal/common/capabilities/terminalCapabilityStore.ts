/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITerminalCapabilityImplMap, ITerminalCapabilityStore, TerminalCapability, TerminalCapabilityChangeEvent } from 'vs/platform/terminal/common/capabilities/capabilities';

export class TerminalCapabilityStore extends Disposable implements ITerminalCapabilityStore {
	private _map: Map<TerminalCapability, { type: TerminalCapability }> = new Map();

	private readonly _onDidRemoveCapabilityType = this._register(new Emitter<TerminalCapability>());
	readonly onDidRemoveCapabilityType = this._onDidRemoveCapabilityType.event;
	private readonly _onDidAddCapabilityType = this._register(new Emitter<TerminalCapability>());
	readonly onDidAddCapabilityType = this._onDidAddCapabilityType.event;

	private readonly _onDidRemoveCapability = this._register(new Emitter<TerminalCapabilityChangeEvent<any>>());
	readonly onDidRemoveCapability = this._onDidRemoveCapability.event;
	private readonly _onDidAddCapability = this._register(new Emitter<TerminalCapabilityChangeEvent<any>>());
	readonly onDidAddCapability = this._onDidAddCapability.event;

	get items(): IterableIterator<TerminalCapability> {
		return this._map.keys();
	}

	add<T extends TerminalCapability>(capability: T, impl: ITerminalCapabilityImplMap[T]) {
		this._map.set(capability, impl);
		this._onDidAddCapabilityType.fire(capability);
		this._onDidAddCapability.fire({ id: capability, capability: impl });
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
		this._onDidRemoveCapabilityType.fire(capability);
		this._onDidAddCapability.fire({ id: capability, capability: impl });
	}

	has(capability: TerminalCapability) {
		return this._map.has(capability);
	}
}

export class TerminalCapabilityStoreMultiplexer extends Disposable implements ITerminalCapabilityStore {
	readonly _stores: ITerminalCapabilityStore[] = [];

	private readonly _onDidRemoveCapabilityType = this._register(new Emitter<TerminalCapability>());
	readonly onDidRemoveCapabilityType = this._onDidRemoveCapabilityType.event;
	private readonly _onDidAddCapabilityType = this._register(new Emitter<TerminalCapability>());
	readonly onDidAddCapabilityType = this._onDidAddCapabilityType.event;

	private readonly _onDidRemoveCapability = this._register(new Emitter<TerminalCapabilityChangeEvent<any>>());
	readonly onDidRemoveCapability = this._onDidRemoveCapability.event;
	private readonly _onDidAddCapability = this._register(new Emitter<TerminalCapabilityChangeEvent<any>>());
	readonly onDidAddCapability = this._onDidAddCapability.event;

	get items(): IterableIterator<TerminalCapability> {
		return this._items();
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
			this._onDidAddCapabilityType.fire(capability);
			this._onDidAddCapability.fire({ id: capability, capability: store.get(capability)! });
		}
		store.onDidAddCapabilityType(e => this._onDidAddCapabilityType.fire(e));
		store.onDidAddCapability(e => this._onDidAddCapability.fire(e));
		store.onDidRemoveCapabilityType(e => this._onDidRemoveCapabilityType.fire(e));
		store.onDidRemoveCapability(e => this._onDidRemoveCapability.fire(e));
	}
}
