/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as fs from 'original-fs';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IStorageService = createDecorator<IStorageService>('storageService');

export interface IStorageService {
	_serviceBrand: any;
	getItem<T>(key: string, defaultValue?: T): T;
	setItem(key: string, data: any): void;
	removeItem(key: string): void;
}

export class StorageService implements IStorageService {

	_serviceBrand: any;

	private dbPath: string;
	private database: any = null;

	constructor( @IEnvironmentService private environmentService: IEnvironmentService) {
		this.dbPath = path.join(environmentService.userDataPath, 'storage.json');
	}

	public getItem<T>(key: string, defaultValue?: T): T {
		if (!this.database) {
			this.database = this.load();
		}

		const res = this.database[key];
		if (typeof res === 'undefined') {
			return defaultValue;
		}

		return this.database[key];
	}

	public setItem(key: string, data: any): void {
		if (!this.database) {
			this.database = this.load();
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

	public removeItem(key: string): void {
		if (!this.database) {
			this.database = this.load();
		}

		if (this.database[key]) {
			delete this.database[key];
			this.save();
		}
	}

	private load(): any {
		try {
			return JSON.parse(fs.readFileSync(this.dbPath).toString()); // invalid JSON or permission issue can happen here
		} catch (error) {
			if (this.environmentService.verbose) {
				console.error(error);
			}

			return {};
		}
	}

	private save(): void {
		try {
			fs.writeFileSync(this.dbPath, JSON.stringify(this.database, null, 4)); // permission issue can happen here
		} catch (error) {
			if (this.environmentService.verbose) {
				console.error(error);
			}
		}
	}
}
