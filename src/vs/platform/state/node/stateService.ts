/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThrottledDelayer } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { Disposable } from 'vs/base/common/lifecycle';
import { isUndefined, isUndefinedOrNull } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateReadService, IStateService } from 'vs/platform/state/node/state';

type StorageDatabase = { [key: string]: unknown };

export const enum SaveStrategy {
	IMMEDIATE,
	DELAYED
}

export class FileStorage extends Disposable {

	private storage: StorageDatabase = Object.create(null);
	private lastSavedStorageContents = '';

	private readonly flushDelayer = this._register(new ThrottledDelayer<void>(this.saveStrategy === SaveStrategy.IMMEDIATE ? 0 : 100 /* buffer saves over a short time */));

	private initializing: Promise<void> | undefined = undefined;
	private closing: Promise<void> | undefined = undefined;

	constructor(
		private readonly storagePath: URI,
		private readonly saveStrategy: SaveStrategy,
		private readonly logService: ILogService,
		private readonly fileService: IFileService,
	) {
		super();
	}

	init(): Promise<void> {
		if (!this.initializing) {
			this.initializing = this.doInit();
		}

		return this.initializing;
	}

	private async doInit(): Promise<void> {
		try {
			this.lastSavedStorageContents = (await this.fileService.readFile(this.storagePath)).value.toString();
			this.storage = JSON.parse(this.lastSavedStorageContents);
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(error);
			}
		}
	}

	getItem<T>(key: string, defaultValue: T): T;
	getItem<T>(key: string, defaultValue?: T): T | undefined;
	getItem<T>(key: string, defaultValue?: T): T | undefined {
		const res = this.storage[key];
		if (isUndefinedOrNull(res)) {
			return defaultValue;
		}

		return res as T;
	}

	setItem(key: string, data?: object | string | number | boolean | undefined | null): void {
		this.setItems([{ key, data }]);
	}

	setItems(items: readonly { key: string; data?: object | string | number | boolean | undefined | null }[]): void {
		let save = false;

		for (const { key, data } of items) {

			// Shortcut for data that did not change
			if (this.storage[key] === data) {
				continue;
			}

			// Remove items when they are undefined or null
			if (isUndefinedOrNull(data)) {
				if (!isUndefined(this.storage[key])) {
					this.storage[key] = undefined;
					save = true;
				}
			}

			// Otherwise add an item
			else {
				this.storage[key] = data;
				save = true;
			}
		}

		if (save) {
			this.save();
		}
	}

	removeItem(key: string): void {

		// Only update if the key is actually present (not undefined)
		if (!isUndefined(this.storage[key])) {
			this.storage[key] = undefined;
			this.save();
		}
	}

	private async save(): Promise<void> {
		if (this.closing) {
			return; // already about to close
		}

		return this.flushDelayer.trigger(() => this.doSave());
	}

	private async doSave(): Promise<void> {
		if (!this.initializing) {
			return; // if we never initialized, we should not save our state
		}

		// Make sure to wait for init to finish first
		await this.initializing;

		// Return early if the database has not changed
		const serializedDatabase = JSON.stringify(this.storage, null, 4);
		if (serializedDatabase === this.lastSavedStorageContents) {
			return;
		}

		// Write to disk
		try {
			await this.fileService.writeFile(this.storagePath, VSBuffer.fromString(serializedDatabase), { atomic: { postfix: '.vsctmp' } });
			this.lastSavedStorageContents = serializedDatabase;
		} catch (error) {
			this.logService.error(error);
		}
	}

	async close(): Promise<void> {
		if (!this.closing) {
			this.closing = this.flushDelayer.trigger(() => this.doSave(), 0 /* as soon as possible */);
		}

		return this.closing;
	}
}

export class StateReadonlyService extends Disposable implements IStateReadService {

	declare readonly _serviceBrand: undefined;

	protected readonly fileStorage: FileStorage;

	constructor(
		saveStrategy: SaveStrategy,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService logService: ILogService,
		@IFileService fileService: IFileService
	) {
		super();

		this.fileStorage = this._register(new FileStorage(environmentService.stateResource, saveStrategy, logService, fileService));
	}

	async init(): Promise<void> {
		await this.fileStorage.init();
	}

	getItem<T>(key: string, defaultValue: T): T;
	getItem<T>(key: string, defaultValue?: T): T | undefined;
	getItem<T>(key: string, defaultValue?: T): T | undefined {
		return this.fileStorage.getItem(key, defaultValue);
	}
}

export class StateService extends StateReadonlyService implements IStateService {

	declare readonly _serviceBrand: undefined;

	setItem(key: string, data?: object | string | number | boolean | undefined | null): void {
		this.fileStorage.setItem(key, data);
	}

	setItems(items: readonly { key: string; data?: object | string | number | boolean | undefined | null }[]): void {
		this.fileStorage.setItems(items);
	}

	removeItem(key: string): void {
		this.fileStorage.removeItem(key);
	}

	close(): Promise<void> {
		return this.fileStorage.close();
	}
}
