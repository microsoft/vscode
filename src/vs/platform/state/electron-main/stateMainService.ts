/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from 'vs/base/common/path';
import { readFileSync, promises } from 'fs';
import { writeFile } from 'vs/base/node/pfs';
import { isUndefined, isUndefinedOrNull } from 'vs/base/common/types';
import { IStateMainService as IStateMainService } from 'vs/platform/state/electron-main/state';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { ThrottledDelayer } from 'vs/base/common/async';

type StorageDatabase = { [key: string]: unknown; };

export class FileStorage {

	private _database: StorageDatabase | undefined = undefined;
	private get database(): StorageDatabase {
		if (!this._database) {
			this._database = this.loadSync();
		}

		return this._database;
	}

	private lastFlushedSerializedDatabase: string | undefined = undefined;
	private readonly flushDelayer = new ThrottledDelayer<void>(100 /* buffer saves over a short time */);

	constructor(
		private readonly dbPath: string,
		private readonly logService: ILogService
	) {
	}

	async init(): Promise<void> {
		if (this._database) {
			return; // return if database was already loaded
		}

		const database = await this.loadAsync();

		if (this._database) {
			return; // return if database was already loaded
		}

		this._database = database;
	}

	private loadSync(): StorageDatabase {
		try {
			this.lastFlushedSerializedDatabase = readFileSync(this.dbPath).toString();

			return JSON.parse(this.lastFlushedSerializedDatabase);
		} catch (error) {
			if (error.code !== 'ENOENT') {
				this.logService.error(error);
			}

			return {};
		}
	}

	private async loadAsync(): Promise<StorageDatabase> {
		try {
			this.lastFlushedSerializedDatabase = (await promises.readFile(this.dbPath)).toString();

			return JSON.parse(this.lastFlushedSerializedDatabase);
		} catch (error) {
			if (error.code !== 'ENOENT') {
				this.logService.error(error);
			}

			return {};
		}
	}

	getItem<T>(key: string, defaultValue: T): T;
	getItem<T>(key: string, defaultValue?: T): T | undefined;
	getItem<T>(key: string, defaultValue?: T): T | undefined {
		const res = this.database[key];
		if (isUndefinedOrNull(res)) {
			return defaultValue;
		}

		return res as T;
	}

	setItem(key: string, data?: object | string | number | boolean | undefined | null): void {

		// Remove an item when it is undefined or null
		if (isUndefinedOrNull(data)) {
			return this.removeItem(key);
		}

		// Shortcut for primitives that did not change
		if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
			if (this.database[key] === data) {
				return;
			}
		}

		this.database[key] = data;
		this.save();
	}

	setItems(items: readonly { key: string, data?: object | string | number | boolean | undefined | null }[]): void {
		let save = false;

		for (const { key, data } of items) {

			// Remove items when they are undefined or null
			if (isUndefinedOrNull(data)) {
				this.database[key] = undefined;
				save = true;
			}

			// Otherwise set items if changed
			else {
				if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
					if (this.database[key] === data) {
						continue; // Shortcut for primitives that did not change
					}
				}

				this.database[key] = data;
				save = true;
			}
		}

		if (save) {
			this.save();
		}
	}

	removeItem(key: string): void {

		// Only update if the key is actually present (not undefined)
		if (!isUndefined(this.database[key])) {
			this.database[key] = undefined;
			this.save();
		}
	}

	private save(delay?: number): Promise<void> {
		return this.flushDelayer.trigger(() => this.doSave(), delay);
	}

	private async doSave(): Promise<void> {
		const serializedDatabase = JSON.stringify(this.database, null, 4);
		if (serializedDatabase === this.lastFlushedSerializedDatabase) {
			return; // return early if the database has not changed
		}

		try {
			await writeFile(this.dbPath, serializedDatabase);
			this.lastFlushedSerializedDatabase = serializedDatabase;
		} catch (error) {
			this.logService.error(error);
		}
	}

	flush(): Promise<void> {
		return this.save(0 /* as soon as possible */);
	}
}

export class StateMainService implements IStateMainService {

	declare readonly _serviceBrand: undefined;

	private static readonly STATE_FILE = 'storage.json';

	private fileStorage: FileStorage;

	constructor(
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@ILogService logService: ILogService
	) {
		this.fileStorage = new FileStorage(join(environmentMainService.userDataPath, StateMainService.STATE_FILE), logService);
	}

	init(): Promise<void> {
		return this.fileStorage.init();
	}

	getItem<T>(key: string, defaultValue: T): T;
	getItem<T>(key: string, defaultValue?: T): T | undefined;
	getItem<T>(key: string, defaultValue?: T): T | undefined {
		return this.fileStorage.getItem(key, defaultValue);
	}

	setItem(key: string, data?: object | string | number | boolean | undefined | null): void {
		this.fileStorage.setItem(key, data);
	}

	setItems(items: readonly { key: string, data?: object | string | number | boolean | undefined | null }[]): void {
		this.fileStorage.setItems(items);
	}

	removeItem(key: string): void {
		this.fileStorage.removeItem(key);
	}

	flush(): Promise<void> {
		return this.fileStorage.flush();
	}
}
