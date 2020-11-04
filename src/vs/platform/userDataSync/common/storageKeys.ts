/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter } from 'vs/base/common/event';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IExtensionIdentifierWithVersion } from 'vs/platform/extensionManagement/common/extensionManagement';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export interface IStorageKey {

	readonly key: string;
	readonly version: number;

}

export interface IExtensionIdWithVersion {
	id: string;
	version: string;
}

export namespace ExtensionIdWithVersion {

	const EXTENSION_ID_VERSION_REGEX = /^([^.]+\..+)@(\d+\.\d+\.\d+(-.*)?)$/;

	export function toKey(extension: IExtensionIdWithVersion): string {
		return `${extension.id}@${extension.version}`;
	}

	export function fromKey(key: string): IExtensionIdWithVersion | undefined {
		const matches = EXTENSION_ID_VERSION_REGEX.exec(key);
		if (matches && matches[1]) {
			return { id: matches[1], version: matches[2] };
		}
		return undefined;
	}
}

export const IStorageKeysSyncRegistryService = createDecorator<IStorageKeysSyncRegistryService>('IStorageKeysSyncRegistryService');

export interface IStorageKeysSyncRegistryService {

	_serviceBrand: any;

	/**
	 * All registered storage keys
	 */
	readonly storageKeys: ReadonlyArray<IStorageKey>;

	/**
	 * Event that is triggered when storage keys are changed
	 */
	readonly onDidChangeStorageKeys: Event<ReadonlyArray<IStorageKey>>;

	/**
	 * Register a storage key that has to be synchronized during sync.
	 */
	registerStorageKey(key: IStorageKey): void;

	/**
	 * All registered extensions storage keys
	 */
	readonly extensionsStorageKeys: ReadonlyArray<[IExtensionIdentifierWithVersion, ReadonlyArray<string>]>;

	/**
	 * Event that is triggered when extension storage keys are changed
	 */
	onDidChangeExtensionStorageKeys: Event<[IExtensionIdWithVersion, ReadonlyArray<string>]>;

	/**
	 * Register storage keys that has to be synchronized for the given extension.
	 */
	registerExtensionStorageKeys(extension: IExtensionIdWithVersion, keys: string[]): void;

	/**
	 * Returns storage keys of the given extension that has to be synchronized.
	 */
	getExtensioStorageKeys(extension: IExtensionIdWithVersion): ReadonlyArray<string> | undefined;
}

export abstract class AbstractStorageKeysSyncRegistryService extends Disposable implements IStorageKeysSyncRegistryService {

	declare readonly _serviceBrand: undefined;

	protected readonly _storageKeys = new Map<string, IStorageKey>();
	get storageKeys(): ReadonlyArray<IStorageKey> { return [...this._storageKeys.values()]; }

	protected readonly _onDidChangeStorageKeys: Emitter<ReadonlyArray<IStorageKey>> = this._register(new Emitter<ReadonlyArray<IStorageKey>>());
	readonly onDidChangeStorageKeys = this._onDidChangeStorageKeys.event;

	protected readonly _extensionsStorageKeys = new Map<string, string[]>();
	get extensionsStorageKeys() {
		const result: [IExtensionIdWithVersion, ReadonlyArray<string>][] = [];
		this._extensionsStorageKeys.forEach((keys, extension) => result.push([ExtensionIdWithVersion.fromKey(extension)!, keys]));
		return result;
	}
	protected readonly _onDidChangeExtensionStorageKeys = this._register(new Emitter<[IExtensionIdWithVersion, ReadonlyArray<string>]>());
	readonly onDidChangeExtensionStorageKeys = this._onDidChangeExtensionStorageKeys.event;

	constructor() {
		super();
		this._register(toDisposable(() => this._storageKeys.clear()));
	}

	getExtensioStorageKeys(extension: IExtensionIdWithVersion): ReadonlyArray<string> | undefined {
		return this._extensionsStorageKeys.get(ExtensionIdWithVersion.toKey(extension));
	}

	protected updateExtensionStorageKeys(extension: IExtensionIdWithVersion, keys: string[]): void {
		this._extensionsStorageKeys.set(ExtensionIdWithVersion.toKey(extension), keys);
		this._onDidChangeExtensionStorageKeys.fire([extension, keys]);
	}

	abstract registerStorageKey(key: IStorageKey): void;
	abstract registerExtensionStorageKeys(extension: IExtensionIdWithVersion, keys: string[]): void;
}

export class StorageKeysSyncRegistryService extends AbstractStorageKeysSyncRegistryService {

	_serviceBrand: any;

	registerStorageKey(storageKey: IStorageKey): void {
		if (!this._storageKeys.has(storageKey.key)) {
			this._storageKeys.set(storageKey.key, storageKey);
			this._onDidChangeStorageKeys.fire(this.storageKeys);
		}
	}

	registerExtensionStorageKeys(extension: IExtensionIdWithVersion, keys: string[]): void {
		this.updateExtensionStorageKeys(extension, keys);
	}

}
