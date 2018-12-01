/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IStorage, Storage, IStorageLoggingOptions, NullStorage } from 'vs/base/node/storage';
import { join } from 'path';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { mark } from 'vs/base/common/performance';

export const IStorageMainService = createDecorator<IStorageMainService>('storageMainService');

export interface IStorageMainService {

	_serviceBrand: any;

	/**
	 * Emitted whenever data is updated or deleted.
	 */
	readonly onDidChangeStorage: Event<IStorageChangeEvent>;

	/**
	 * Emitted when the storage is about to persist. This is the right time
	 * to persist data to ensure it is stored before the application shuts
	 * down.
	 */
	readonly onWillSaveState: Event<void>;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined.
	 */
	get(key: string, fallbackValue: string): string;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a boolean.
	 */
	getBoolean(key: string, fallbackValue: boolean): boolean;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided defaultValue if the element is null or undefined. The element
	 * will be converted to a number using parseInt with a base of 10.
	 */
	getInteger(key: string, fallbackValue: number): number;

	/**
	 * Store a string value under the given key to storage. The value will
	 * be converted to a string.
	 */
	store(key: string, value: any): void;

	/**
	 * Delete an element stored under the provided key from storage.
	 */
	remove(key: string): void;
}

export interface IStorageChangeEvent {
	key: string;
}

export class StorageMainService extends Disposable implements IStorageMainService {

	_serviceBrand: any;

	private static STORAGE_NAME = 'temp.vscdb';

	private _onDidChangeStorage: Emitter<IStorageChangeEvent> = this._register(new Emitter<IStorageChangeEvent>());
	get onDidChangeStorage(): Event<IStorageChangeEvent> { return this._onDidChangeStorage.event; }

	private _onWillSaveState: Emitter<void> = this._register(new Emitter<void>());
	get onWillSaveState(): Event<void> { return this._onWillSaveState.event; }

	private storage: IStorage;

	constructor(
		@ILogService private logService: ILogService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super();

		const useInMemoryStorage = !!environmentService.extensionTestsPath; // no storage during extension tests!

		this.storage = new NullStorage() || new Storage({
			path: useInMemoryStorage ? Storage.IN_MEMORY_PATH : join(environmentService.globalStorageHome, StorageMainService.STORAGE_NAME),
			logging: this.createLogginOptions()
		});

		this.registerListeners();
	}

	private createLogginOptions(): IStorageLoggingOptions {
		const loggedStorageErrors = new Set<string>();

		return {
			logTrace: (this.logService.getLevel() === LogLevel.Trace) ? msg => this.logService.trace(msg) : void 0,
			logError: error => {
				this.logService.error(error);

				const errorStr = `${error}`;
				if (!loggedStorageErrors.has(errorStr)) {
					loggedStorageErrors.add(errorStr);

					/* __GDPR__
						"sqliteMainStorageError" : {
							"storageError": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
						}
					*/
					this.telemetryService.publicLog('sqliteMainStorageError', {
						'storageError': errorStr
					});
				}
			}
		} as IStorageLoggingOptions;
	}

	private registerListeners(): void {
		this._register(this.storage.onDidChangeStorage(key => this._onDidChangeStorage.fire({ key })));
	}

	initialize(): Thenable<void> {
		mark('main:willInitGlobalStorage');
		return this.storage.init().then(() => {
			mark('main:didInitGlobalStorage');
		}, error => {
			mark('main:didInitGlobalStorage');

			return Promise.reject(error);
		});
	}

	get(key: string, fallbackValue: string): string {
		return this.storage.get(key, fallbackValue);
	}

	getBoolean(key: string, fallbackValue: boolean): boolean {
		return this.storage.getBoolean(key, fallbackValue);
	}

	getInteger(key: string, fallbackValue: number): number {
		return this.storage.getInteger(key, fallbackValue);
	}

	store(key: string, value: any): Thenable<void> {
		return this.storage.set(key, value);
	}

	remove(key: string): Thenable<void> {
		return this.storage.delete(key);
	}

	close(): Thenable<void> {
		this.logService.trace('StorageMainService#close() - begin');

		// Signal as event so that clients can still store data
		this._onWillSaveState.fire();

		// Do it
		return this.storage.close().then(() => this.logService.trace('StorageMainService#close() - finished'));
	}
}