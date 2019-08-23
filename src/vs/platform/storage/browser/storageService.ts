/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { IWorkspaceStorageChangeEvent, IStorageService, StorageScope, IWillSaveStateEvent, WillSaveStateReason, logStorage } from 'vs/platform/storage/common/storage';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceInitializationPayload } from 'vs/platform/workspaces/common/workspaces';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IFileService, FileChangeType } from 'vs/platform/files/common/files';
import { IStorage, Storage, IStorageDatabase, IStorageItemsChangeEvent, IUpdateRequest } from 'vs/base/parts/storage/common/storage';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { runWhenIdle, RunOnceScheduler } from 'vs/base/common/async';
import { serializableToMap, mapToSerializable } from 'vs/base/common/map';
import { VSBuffer } from 'vs/base/common/buffer';

export class BrowserStorageService extends Disposable implements IStorageService {

	_serviceBrand!: ServiceIdentifier<any>;

	private readonly _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	readonly onDidChangeStorage: Event<IWorkspaceStorageChangeEvent> = this._onDidChangeStorage.event;

	private readonly _onWillSaveState: Emitter<IWillSaveStateEvent> = this._register(new Emitter<IWillSaveStateEvent>());
	readonly onWillSaveState: Event<IWillSaveStateEvent> = this._onWillSaveState.event;

	private globalStorage: IStorage;
	private workspaceStorage: IStorage;

	private globalStorageDatabase: FileStorageDatabase;
	private workspaceStorageDatabase: FileStorageDatabase;

	private globalStorageFile: URI;
	private workspaceStorageFile: URI;

	private initializePromise: Promise<void>;
	private periodicSaveScheduler = this._register(new RunOnceScheduler(() => this.collectState(), 5000));

	get hasPendingUpdate(): boolean {
		return this.globalStorageDatabase.hasPendingUpdate || this.workspaceStorageDatabase.hasPendingUpdate;
	}

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IFileService private readonly fileService: IFileService
	) {
		super();

		// In the browser we do not have support for long running unload sequences. As such,
		// we cannot ask for saving state in that moment, because that would result in a
		// long running operation.
		// Instead, periodically ask customers to save save. The library will be clever enough
		// to only save state that has actually changed.
		this.periodicSaveScheduler.schedule();
	}

	private collectState(): void {
		runWhenIdle(() => {

			// this event will potentially cause new state to be stored
			// since new state will only be created while the document
			// has focus, one optimization is to not run this when the
			// document has no focus, assuming that state has not changed
			//
			// another optimization is to not collect more state if we
			// have a pending update already running which indicates
			// that the connection is either slow or disconnected and
			// thus unhealthy.
			if (document.hasFocus() && !this.hasPendingUpdate) {
				this._onWillSaveState.fire({ reason: WillSaveStateReason.NONE });
			}

			// repeat
			this.periodicSaveScheduler.schedule();
		});
	}

	initialize(payload: IWorkspaceInitializationPayload): Promise<void> {
		if (!this.initializePromise) {
			this.initializePromise = this.doInitialize(payload);
		}

		return this.initializePromise;
	}

	private async doInitialize(payload: IWorkspaceInitializationPayload): Promise<void> {

		// Ensure state folder exists
		const stateRoot = joinPath(this.environmentService.userRoamingDataHome, 'state');
		await this.fileService.createFolder(stateRoot);

		// Workspace Storage
		this.workspaceStorageFile = joinPath(stateRoot, `${payload.id}.json`);
		this.workspaceStorageDatabase = this._register(new FileStorageDatabase(this.workspaceStorageFile, false /* do not watch for external changes */, this.fileService));
		this.workspaceStorage = this._register(new Storage(this.workspaceStorageDatabase));
		this._register(this.workspaceStorage.onDidChangeStorage(key => this._onDidChangeStorage.fire({ key, scope: StorageScope.WORKSPACE })));

		// Global Storage
		this.globalStorageFile = joinPath(stateRoot, 'global.json');
		this.globalStorageDatabase = this._register(new FileStorageDatabase(this.globalStorageFile, true /* watch for external changes */, this.fileService));
		this.globalStorage = this._register(new Storage(this.globalStorageDatabase));
		this._register(this.globalStorage.onDidChangeStorage(key => this._onDidChangeStorage.fire({ key, scope: StorageScope.GLOBAL })));

		// Init both
		await Promise.all([
			this.workspaceStorage.init(),
			this.globalStorage.init()
		]);
	}

	get(key: string, scope: StorageScope, fallbackValue: string): string;
	get(key: string, scope: StorageScope): string | undefined;
	get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined {
		return this.getStorage(scope).get(key, fallbackValue);
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
	getBoolean(key: string, scope: StorageScope): boolean | undefined;
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined {
		return this.getStorage(scope).getBoolean(key, fallbackValue);
	}

	getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
	getNumber(key: string, scope: StorageScope): number | undefined;
	getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined {
		return this.getStorage(scope).getNumber(key, fallbackValue);
	}

	store(key: string, value: string | boolean | number | undefined | null, scope: StorageScope): void {
		this.getStorage(scope).set(key, value);
	}

	remove(key: string, scope: StorageScope): void {
		this.getStorage(scope).delete(key);
	}

	private getStorage(scope: StorageScope): IStorage {
		return scope === StorageScope.GLOBAL ? this.globalStorage : this.workspaceStorage;
	}

	async logStorage(): Promise<void> {
		const result = await Promise.all([
			this.globalStorage.items,
			this.workspaceStorage.items
		]);

		return logStorage(result[0], result[1], this.globalStorageFile.toString(), this.workspaceStorageFile.toString());
	}

	close(): void {
		// We explicitly do not close our DBs because writing data onBeforeUnload()
		// can result in unexpected results. Namely, it seems that - even though this
		// operation is async - sometimes it is being triggered on unload and
		// succeeds. Often though, the DBs turn out to be empty because the write
		// never had a chance to complete.
		//
		// Instead we trigger dispose() to ensure that no timeouts or callbacks
		// get triggered in this phase.
		this.dispose();
	}
}

export class FileStorageDatabase extends Disposable implements IStorageDatabase {

	private readonly _onDidChangeItemsExternal: Emitter<IStorageItemsChangeEvent> = this._register(new Emitter<IStorageItemsChangeEvent>());
	readonly onDidChangeItemsExternal: Event<IStorageItemsChangeEvent> = this._onDidChangeItemsExternal.event;

	private cache: Map<string, string> | undefined;

	private pendingUpdate: Promise<void> = Promise.resolve();

	private _hasPendingUpdate = false;
	get hasPendingUpdate(): boolean {
		return this._hasPendingUpdate;
	}

	private isWatching = false;

	constructor(
		private readonly file: URI,
		private readonly watchForExternalChanges: boolean,
		@IFileService private readonly fileService: IFileService
	) {
		super();
	}

	private async ensureWatching(): Promise<void> {
		if (this.isWatching || !this.watchForExternalChanges) {
			return;
		}

		const exists = await this.fileService.exists(this.file);
		if (this.isWatching || !exists) {
			return; // file must exist to be watched
		}

		this.isWatching = true;

		this._register(this.fileService.watch(this.file));
		this._register(this.fileService.onFileChanges(e => {
			if (document.hasFocus()) {
				return; // optimization: ignore changes from ourselves by checking for focus
			}

			if (!e.contains(this.file, FileChangeType.UPDATED)) {
				return; // not our file
			}

			this.onDidStorageChangeExternal();
		}));
	}

	private async onDidStorageChangeExternal(): Promise<void> {
		const items = await this.doGetItemsFromFile();

		this.cache = items;

		this._onDidChangeItemsExternal.fire({ items });
	}

	async getItems(): Promise<Map<string, string>> {
		if (!this.cache) {
			try {
				this.cache = await this.doGetItemsFromFile();
			} catch (error) {
				this.cache = new Map();
			}
		}

		return this.cache;
	}

	private async doGetItemsFromFile(): Promise<Map<string, string>> {
		await this.pendingUpdate;

		const itemsRaw = await this.fileService.readFile(this.file);

		this.ensureWatching(); // now that the file must exist, ensure we watch it for changes

		return serializableToMap(JSON.parse(itemsRaw.value.toString()));
	}

	async updateItems(request: IUpdateRequest): Promise<void> {
		const items = await this.getItems();

		if (request.insert) {
			request.insert.forEach((value, key) => items.set(key, value));
		}

		if (request.delete) {
			request.delete.forEach(key => items.delete(key));
		}

		await this.pendingUpdate;

		this.pendingUpdate = (async () => {
			try {
				this._hasPendingUpdate = true;

				await this.fileService.writeFile(this.file, VSBuffer.fromString(JSON.stringify(mapToSerializable(items))));

				this.ensureWatching(); // now that the file must exist, ensure we watch it for changes
			} finally {
				this._hasPendingUpdate = false;
			}
		})();

		return this.pendingUpdate;
	}

	close(): Promise<void> {
		return this.pendingUpdate;
	}
}
