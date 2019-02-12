/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { writeFileAndFlushSync } from 'vs/base/node/extfs';
import { isUndefined, isUndefinedOrNull } from 'vs/base/common/types';
import { IStateService } from 'vs/platform/state/common/state';
import { ILogService } from 'vs/platform/log/common/log';
import { readFile } from 'vs/base/node/pfs';

export class FileStorage {

	private _database: object | null = null;
	private lastFlushedSerializedDatabase: string | null = null;

	constructor(private dbPath: string, private onError: (error: Error) => void) { }

	private get database(): object {
		if (!this._database) {
			this._database = this.loadSync();
		}

		return this._database;
	}

	init(): Promise<void> {
		return readFile(this.dbPath).then(contents => {
			try {
				this.lastFlushedSerializedDatabase = contents.toString();
				this._database = JSON.parse(this.lastFlushedSerializedDatabase);
			} catch (error) {
				this._database = {};
			}
		}, error => {
			if (error.code !== 'ENOENT') {
				this.onError(error);
			}

			this._database = {};
		});
	}

	private loadSync(): object {
		try {
			this.lastFlushedSerializedDatabase = fs.readFileSync(this.dbPath).toString();

			return JSON.parse(this.lastFlushedSerializedDatabase);
		} catch (error) {
			if (error.code !== 'ENOENT') {
				this.onError(error);
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

		return res;
	}

	setItem(key: string, data: any): void {

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
		this.saveSync();
	}

	removeItem(key: string): void {

		// Only update if the key is actually present (not undefined)
		if (!isUndefined(this.database[key])) {
			this.database[key] = undefined;
			this.saveSync();
		}
	}

	private saveSync(): void {
		const serializedDatabase = JSON.stringify(this.database, null, 4);
		if (serializedDatabase === this.lastFlushedSerializedDatabase) {
			return; // return early if the database has not changed
		}

		try {
			writeFileAndFlushSync(this.dbPath, serializedDatabase); // permission issue can happen here
			this.lastFlushedSerializedDatabase = serializedDatabase;
		} catch (error) {
			this.onError(error);
		}
	}
}

export class StateService implements IStateService {

	_serviceBrand: any;

	private static STATE_FILE = 'storage.json';

	private fileStorage: FileStorage;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService logService: ILogService
	) {
		this.fileStorage = new FileStorage(path.join(environmentService.userDataPath, StateService.STATE_FILE), error => logService.error(error));
	}

	init(): Promise<void> {
		return this.fileStorage.init();
	}

	getItem<T>(key: string, defaultValue: T): T;
	getItem<T>(key: string, defaultValue: T | undefined): T | undefined;
	getItem<T>(key: string, defaultValue?: T): T | undefined {
		return this.fileStorage.getItem(key, defaultValue);
	}

	setItem(key: string, data: any): void {
		this.fileStorage.setItem(key, data);
	}

	removeItem(key: string): void {
		this.fileStorage.removeItem(key);
	}
}
