/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as mobx from 'mobx';

export const PREFIX = 'simulationWorkbench_';

export class SimulationStorage {

	private prefix: string;

	constructor() {
		this.prefix = PREFIX;
	}

	public get<V>(key: string): V | undefined {
		const item = localStorage.getItem(this.prefix + key);
		if (item) {
			return JSON.parse(item) as V;
		}
		return undefined;
	}

	public set<V>(key: string, value: V): void {
		localStorage.setItem(this.prefix + key, JSON.stringify(value));
	}

	public clear(): void {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && key.startsWith(this.prefix)) {
				localStorage.removeItem(key);
			}
		}
	}

	public bind<T>(key: string, defaultValue: T): SimulationStorageValue<T> {
		return new SimulationStorageValue<T>(this, key, defaultValue);
	}
}

export class SimulationStorageValue<T> {
	private storage: SimulationStorage;
	private key: string;

	@mobx.observable
	public value: T;

	constructor(storage: SimulationStorage, key: string, defaultValue: T) {
		this.storage = storage;
		this.key = key;
		this.value = this.storage.get<T>(this.key) ?? defaultValue;

		mobx.makeObservable(this);
		mobx.autorun(() => {
			this.storage.set(this.key, this.value);
		});
	}
}
