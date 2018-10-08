/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { INextStorageService } from 'vs/platform/storage2/common/nextStorageService';
import { SQLiteStorage } from 'vs/base/node/storage';
import { ILogService } from 'vs/platform/log/common/log';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { RunOnceScheduler } from 'vs/base/common/async';

enum StorageState {
	None,
	Initialized,
	Closed
}

export class NextStorageServiceImpl extends Disposable implements INextStorageService {
	_serviceBrand: any;

	private static readonly FLUSH_DELAY = 10;

	private _onDidChangeStorage: Emitter<Set<string>> = this._register(new Emitter<Set<string>>());
	get onDidChangeStorage(): Event<Set<string>> { return this._onDidChangeStorage.event; }

	private state = StorageState.None;

	private storage: SQLiteStorage;
	private cache: Map<string, string> = new Map<string, string>();

	private pendingScheduler: RunOnceScheduler;
	private pendingDeletes: Set<string> = new Set<string>();
	private pendingUpdates: Map<string, string> = new Map();
	private pendingPromises: { resolve: Function, reject: Function }[] = [];

	constructor(
		path: string,
		@ILogService private logService: ILogService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super();

		this.storage = new SQLiteStorage({
			path,
			logging: {
				verbose: this.environmentService.verbose,
				infoLogger: info => this.logService.info(info),
				errorLogger: error => this.logService.error(error)
			}
		});

		this.pendingScheduler = new RunOnceScheduler(() => this.flushPending(), NextStorageServiceImpl.FLUSH_DELAY);
	}

	init(): Promise<void> {
		if (this.state !== StorageState.None) {
			return Promise.resolve(); // either closed or already initialized
		}

		this.state = StorageState.Initialized;

		return this.storage.getItems().then(items => {
			this.cache = items;
		});
	}

	get(key: string, fallbackValue?: any): string {
		const value = this.cache.get(key);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return value;
	}

	getBoolean(key: string, fallbackValue?: boolean): boolean {
		const value = this.get(key);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return value === 'true';
	}

	getInteger(key: string, fallbackValue?: number): number {
		const value = this.get(key);

		if (isUndefinedOrNull(value)) {
			return fallbackValue;
		}

		return parseInt(value, 10);
	}

	set(key: string, value: any): Promise<void> {

		// We remove the key for undefined/null values
		if (isUndefinedOrNull(value)) {
			return this.delete(key);
		}

		// Otherwise, convert to String and store
		const valueStr = String(value);

		// Update in cache and pending
		this.cache.set(key, valueStr);
		this.pendingUpdates.set(key, valueStr);
		this.pendingDeletes.delete(key);

		return this.update();
	}

	delete(key: string): Promise<void> {

		// Remove from cache and add to pending
		this.cache.delete(key);
		if (!this.pendingDeletes.has(key)) {
			this.pendingDeletes.add(key);
		}
		this.pendingUpdates.delete(key);

		return this.update();
	}

	private update(): Promise<void> {

		// Return early if we are already closed
		if (this.state === StorageState.Closed) {
			return Promise.resolve();
		}

		// Schedule
		if (!this.pendingScheduler.isScheduled()) {
			this.pendingScheduler.schedule();
		}

		return new Promise((resolve, reject) => this.pendingPromises.push({ resolve, reject }));
	}

	close(): Promise<void> {

		// Update state
		this.state = StorageState.Closed;

		// Dispose scheduler (no more scheduling possible)
		this.pendingScheduler.dispose();

		// Flush & close
		return this.flushPending().then(() => {
			return this.storage.close();
		});
	}

	private flushPending(): Promise<void> {

		// Get pending data
		const pendingPromises = this.pendingPromises;
		const pendingDeletes = this.pendingDeletes;
		const pendingUpdates = this.pendingUpdates;

		// Reset pending data for next run
		this.pendingPromises = [];
		this.pendingDeletes = new Set<string>();
		this.pendingUpdates = new Map<string, string>();

		return this.storage.deleteItems(pendingDeletes).then(() => this.storage.setItems(pendingUpdates)).then(() => {

			// Resolve pending
			pendingPromises.forEach(promise => promise.resolve());

			// Events (unless closed)
			if (this.state !== StorageState.Closed) {
				const keys = new Set<string>();
				pendingDeletes.forEach(key => keys.add(key));
				pendingUpdates.forEach((value, key) => keys.add(key));
				this._onDidChangeStorage.fire(keys);
			}
		}, error => {

			// Forward error to pending
			pendingPromises.forEach(promise => promise.reject(error));
		});
	}
}