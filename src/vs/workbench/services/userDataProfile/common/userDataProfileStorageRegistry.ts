/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { Registry } from 'vs/platform/registry/common/platform';

export namespace Extensions {
	export const ProfileStorageRegistry = 'workbench.registry.profile.storage';
}

export interface IProfileStorageKey {
	readonly key: string;
	readonly description?: string;
}

/**
 * A registry for storage keys used for profiles
 */
export interface IProfileStorageRegistry {
	/**
	 * An event that is triggered when storage keys are registered.
	 */
	readonly onDidRegister: Event<readonly IProfileStorageKey[]>;

	/**
	 * All registered storage keys
	 */
	readonly all: IProfileStorageKey[];

	/**
	 * Register profile storage keys
	 *
	 * @param keys keys to register
	 */
	registerKeys(keys: IProfileStorageKey[]): void;
}

class ProfileStorageRegistryImpl extends Disposable implements IProfileStorageRegistry {

	private readonly _onDidRegister = this._register(new Emitter<readonly IProfileStorageKey[]>());
	readonly onDidRegister = this._onDidRegister.event;

	private readonly storageKeys = new Map<string, IProfileStorageKey>();

	get all(): IProfileStorageKey[] {
		return [...this.storageKeys.values()].flat();
	}

	registerKeys(keys: IProfileStorageKey[]): void {
		for (const key of keys) {
			this.storageKeys.set(key.key, key);
		}
		this._onDidRegister.fire(keys);
	}

}

Registry.add(Extensions.ProfileStorageRegistry, new ProfileStorageRegistryImpl());

