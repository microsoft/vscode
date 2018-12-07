/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ILogService, LogLevel } from 'vs/platform/log/common/log';
import { IWorkspaceStorageChangeEvent, IStorageService, StorageScope, IWillSaveStateEvent, WillSaveStateReason } from 'vs/platform/storage/common/storage';
import { Storage, ISQLiteStorageDatabaseLoggingOptions, IStorage, StorageHint, IStorageDatabase, SQLiteStorageDatabase } from 'vs/base/node/storage';
import { IStorageLegacyService, StorageLegacyScope } from 'vs/platform/storage/common/storageLegacyService';
import { startsWith, endsWith } from 'vs/base/common/strings';
import { Action } from 'vs/base/common/actions';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { localize } from 'vs/nls';
import { mark, getDuration } from 'vs/base/common/performance';
import { join } from 'path';
import { copy, exists, mkdirp, readdir, writeFile } from 'vs/base/node/pfs';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceInitializationPayload, isWorkspaceIdentifier, isSingleFolderWorkspaceInitializationPayload } from 'vs/platform/workspaces/common/workspaces';
import { onUnexpectedError } from 'vs/base/common/errors';
import { StorageObject, parseMultiRootStorage, parseFolderStorage, parseNoWorkspaceStorage, parseEmptyStorage } from 'vs/platform/storage/common/storageLegacyMigration';

export class StorageService extends Disposable implements IStorageService {
	_serviceBrand: any;

	private static WORKSPACE_STORAGE_NAME = 'state.vscdb';
	private static WORKSPACE_META_NAME = 'workspace.json';

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

	private _onWillSaveState: Emitter<IWillSaveStateEvent> = this._register(new Emitter<IWillSaveStateEvent>());
	get onWillSaveState(): Event<IWillSaveStateEvent> { return this._onWillSaveState.event; }

	private _hasErrors = false;
	get hasErrors(): boolean { return this._hasErrors; }

	private bufferedWorkspaceStorageErrors?: (string | Error)[] = [];
	private _onWorkspaceStorageError: Emitter<string | Error> = this._register(new Emitter<string | Error>());
	get onWorkspaceStorageError(): Event<string | Error> {
		if (Array.isArray(this.bufferedWorkspaceStorageErrors)) {
			// todo@ben cleanup after a while
			if (this.bufferedWorkspaceStorageErrors.length > 0) {
				const bufferedStorageErrors = this.bufferedWorkspaceStorageErrors;
				setTimeout(() => {
					this._onWorkspaceStorageError.fire(`[startup errors] ${bufferedStorageErrors.join('\n')}`);
				}, 0);
			}

			this.bufferedWorkspaceStorageErrors = void 0;
		}

		return this._onWorkspaceStorageError.event;
	}

	private globalStorage: IStorage;

	private workspaceStoragePath: string;
	private workspaceStorage: IStorage;
	private workspaceStorageListener: IDisposable;

	constructor(
		globalStorageDatabase: IStorageDatabase,
		@ILogService private logService: ILogService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		super();

		// Global Storage
		this.globalStorage = new Storage(globalStorageDatabase);
		if (process.env['VSCODE_TEST_STORAGE_MIGRATION']) {
			this._register(this.globalStorage.onDidChangeStorage(key => this.handleDidChangeStorage(key, StorageScope.GLOBAL)));
		}
	}

	private handleDidChangeStorage(key: string, scope: StorageScope): void {
		this._onDidChangeStorage.fire({ key, scope });
	}

	initialize(payload: IWorkspaceInitializationPayload): Thenable<void> {
		return Promise.all([
			this.initializeGlobalStorage(),
			this.initializeWorkspaceStorage(payload)
		]).then(() => void 0);
	}

	private initializeGlobalStorage(): Thenable<void> {
		mark('willInitGlobalStorage');

		return this.globalStorage.init().then(() => {
			mark('didInitGlobalStorage');
		}, error => {
			mark('didInitGlobalStorage');

			return Promise.reject(error);
		});
	}

	private initializeWorkspaceStorage(payload: IWorkspaceInitializationPayload): Thenable<void> {

		// Prepare workspace storage folder for DB
		return this.prepareWorkspaceStorageFolder(payload).then(result => {
			const useInMemoryStorage = !!this.environmentService.extensionTestsPath; // no storage during extension tests!

			let workspaceStoragePath: string;
			let workspaceStorageExists: Thenable<boolean>;
			if (useInMemoryStorage) {
				workspaceStoragePath = SQLiteStorageDatabase.IN_MEMORY_PATH;
				workspaceStorageExists = Promise.resolve(true);
			} else {
				workspaceStoragePath = join(result.path, StorageService.WORKSPACE_STORAGE_NAME);

				mark('willCheckWorkspaceStorageExists');
				workspaceStorageExists = exists(workspaceStoragePath).then(exists => {
					mark('didCheckWorkspaceStorageExists');

					return exists;
				});
			}

			return workspaceStorageExists.then(exists => {

				// Create workspace storage and initalize
				mark('willInitWorkspaceStorage');
				return this.createWorkspaceStorage(workspaceStoragePath, result.wasCreated ? StorageHint.STORAGE_DOES_NOT_EXIST : void 0).init().then(() => {
					mark('didInitWorkspaceStorage');
				}, error => {
					mark('didInitWorkspaceStorage');

					return Promise.reject(error);
				}).then(() => {

					// Migrate storage if this is the first start and we are not using in-memory
					let migrationPromise: Thenable<void>;
					if (!useInMemoryStorage && !exists) {
						migrationPromise = this.migrateWorkspaceStorage(payload);
					} else {
						migrationPromise = Promise.resolve();
					}

					return migrationPromise;
				});
			});
		});
	}

	// TODO@Ben remove migration after a while
	private migrateWorkspaceStorage(payload: IWorkspaceInitializationPayload): Thenable<void> {
		mark('willMigrateWorkspaceStorageKeys');
		return readdir(this.environmentService.extensionsPath).then(extensions => {

			// Otherwise, we migrate data from window.localStorage over
			try {
				let workspaceItems: StorageObject;
				if (isWorkspaceIdentifier(payload)) {
					workspaceItems = parseMultiRootStorage(window.localStorage, `root:${payload.id}`);
				} else if (isSingleFolderWorkspaceInitializationPayload(payload)) {
					workspaceItems = parseFolderStorage(window.localStorage, payload.folder.toString());
				} else {
					if (payload.id === 'ext-dev') {
						workspaceItems = parseNoWorkspaceStorage(window.localStorage);
					} else {
						workspaceItems = parseEmptyStorage(window.localStorage, `${payload.id}`);
					}
				}

				const workspaceItemsKeys = workspaceItems ? Object.keys(workspaceItems) : [];
				if (workspaceItemsKeys.length > 0) {
					const supportedKeys = new Map<string, string>();
					[
						'workbench.search.history',
						'history.entries',
						'ignoreNetVersionError',
						'ignoreEnospcError',
						'extensionUrlHandler.urlToHandle',
						'terminal.integrated.isWorkspaceShellAllowed',
						'workbench.tasks.ignoreTask010Shown',
						'workbench.tasks.recentlyUsedTasks',
						'workspaces.dontPromptToOpen',
						'output.activechannel',
						'outline/state',
						'extensionsAssistant/workspaceRecommendationsIgnore',
						'extensionsAssistant/dynamicWorkspaceRecommendations',
						'debug.repl.history',
						'editor.matchCase',
						'editor.wholeWord',
						'editor.isRegex',
						'lifecyle.lastShutdownReason',
						'debug.selectedroot',
						'debug.selectedconfigname',
						'debug.breakpoint',
						'debug.breakpointactivated',
						'debug.functionbreakpoint',
						'debug.exceptionbreakpoint',
						'debug.watchexpressions',
						'workbench.sidebar.activeviewletid',
						'workbench.panelpart.activepanelid',
						'workbench.zenmode.active',
						'workbench.centerededitorlayout.active',
						'workbench.sidebar.hidden',
						'workbench.panel.hidden',
						'workbench.panel.location',
						'extensionsIdentifiers/disabled',
						'extensionsIdentifiers/enabled',
						'scm.views',
						'suggest/memories/first',
						'suggest/memories/recentlyUsed',
						'suggest/memories/recentlyUsedByPrefix',
						'workbench.view.explorer.numberOfVisibleViews',
						'workbench.view.extensions.numberOfVisibleViews',
						'workbench.view.debug.numberOfVisibleViews',
						'workbench.explorer.views.state',
						'workbench.view.extensions.state',
						'workbench.view.debug.state',
						'memento/workbench.editor.walkThroughPart',
						'memento/workbench.editor.settings2',
						'memento/workbench.editor.htmlPreviewPart',
						'memento/workbench.editor.defaultPreferences',
						'memento/workbench.editors.files.textFileEditor',
						'memento/workbench.editors.logViewer',
						'memento/workbench.editors.textResourceEditor',
						'memento/workbench.panel.output'
					].forEach(key => supportedKeys.set(key.toLowerCase(), key));

					// Support extension storage as well (always the ID of the extension)
					extensions.forEach(extension => {
						let extensionId: string;
						if (extension.indexOf('-') >= 0) {
							extensionId = extension.substring(0, extension.lastIndexOf('-')); // convert "author.extension-0.2.5" => "author.extension"
						} else {
							extensionId = extension;
						}

						if (extensionId) {
							supportedKeys.set(extensionId.toLowerCase(), extensionId);
						}
					});

					workspaceItemsKeys.forEach(key => {
						const value = workspaceItems[key];

						// first check for a well known supported key and store with realcase value
						const supportedKey = supportedKeys.get(key);
						if (supportedKey) {
							this.store(supportedKey, value, StorageScope.WORKSPACE);
						}

						// fix lowercased ".numberOfVisibleViews"
						else if (endsWith(key, '.numberOfVisibleViews'.toLowerCase())) {
							const normalizedKey = key.substring(0, key.length - '.numberOfVisibleViews'.length) + '.numberOfVisibleViews';
							this.store(normalizedKey, value, StorageScope.WORKSPACE);
						}

						// support dynamic keys
						else if (key.indexOf('memento/') === 0 || endsWith(key, '.state')) {
							this.store(key, value, StorageScope.WORKSPACE);
						}
					});
				}
			} catch (error) {
				onUnexpectedError(error);
				this.logService.error(error);
			}

			mark('didMigrateWorkspaceStorageKeys');
		});
	}

	private createWorkspaceStorage(workspaceStoragePath: string, hint?: StorageHint): IStorage {

		// Logger for workspace storage
		const workspaceLoggingOptions: ISQLiteStorageDatabaseLoggingOptions = {
			logTrace: (this.logService.getLevel() === LogLevel.Trace) ? msg => this.logService.trace(msg) : void 0,
			logError: error => {
				this.logService.error(error);

				this._hasErrors = true;

				if (Array.isArray(this.bufferedWorkspaceStorageErrors)) {
					this.bufferedWorkspaceStorageErrors.push(error);
				} else {
					this._onWorkspaceStorageError.fire(error);
				}
			}
		};

		// Dispose old (if any)
		this.workspaceStorage = dispose(this.workspaceStorage);
		this.workspaceStorageListener = dispose(this.workspaceStorageListener);

		// Create new
		this.workspaceStoragePath = workspaceStoragePath;
		this.workspaceStorage = new Storage(new SQLiteStorageDatabase(workspaceStoragePath, { logging: workspaceLoggingOptions }), { hint });
		this.workspaceStorageListener = this.workspaceStorage.onDidChangeStorage(key => this.handleDidChangeStorage(key, StorageScope.WORKSPACE));

		return this.workspaceStorage;
	}

	private getWorkspaceStorageFolderPath(payload: IWorkspaceInitializationPayload): string {
		return join(this.environmentService.workspaceStorageHome, payload.id); // workspace home + workspace id;
	}

	private prepareWorkspaceStorageFolder(payload: IWorkspaceInitializationPayload): Thenable<{ path: string, wasCreated: boolean }> {
		const workspaceStorageFolderPath = this.getWorkspaceStorageFolderPath(payload);

		return exists(workspaceStorageFolderPath).then(exists => {
			if (exists) {
				return { path: workspaceStorageFolderPath, wasCreated: false };
			}

			return mkdirp(workspaceStorageFolderPath).then(() => {

				// Write metadata into folder
				this.ensureWorkspaceStorageFolderMeta(payload);

				return { path: workspaceStorageFolderPath, wasCreated: true };
			});
		});
	}

	private ensureWorkspaceStorageFolderMeta(payload: IWorkspaceInitializationPayload): void {
		let meta: object | undefined = void 0;
		if (isSingleFolderWorkspaceInitializationPayload(payload)) {
			meta = { folder: payload.folder.toString() };
		} else if (isWorkspaceIdentifier(payload)) {
			meta = { configuration: payload.configPath };
		}

		if (meta) {
			const workspaceStorageMetaPath = join(this.getWorkspaceStorageFolderPath(payload), StorageService.WORKSPACE_META_NAME);
			exists(workspaceStorageMetaPath).then(exists => {
				if (exists) {
					return void 0; // already existing
				}

				return writeFile(workspaceStorageMetaPath, JSON.stringify(meta, void 0, 2));
			}).then(null, error => onUnexpectedError(error));
		}
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

	getInteger(key: string, scope: StorageScope, fallbackValue: number): number;
	getInteger(key: string, scope: StorageScope): number | undefined;
	getInteger(key: string, scope: StorageScope, fallbackValue?: number): number | undefined {
		return this.getStorage(scope).getInteger(key, fallbackValue);
	}

	store(key: string, value: any, scope: StorageScope): void {
		this.getStorage(scope).set(key, value);
	}

	remove(key: string, scope: StorageScope): void {
		this.getStorage(scope).delete(key);
	}

	close(): Promise<void> {

		// Signal to storage that we are about to close
		this.globalStorage.beforeClose();
		this.workspaceStorage.beforeClose();

		// Signal as event so that clients can still store data
		this._onWillSaveState.fire({ reason: WillSaveStateReason.SHUTDOWN });

		// Do it
		mark('willCloseGlobalStorage');
		mark('willCloseWorkspaceStorage');
		return Promise.all([
			this.globalStorage.close().then(() => mark('didCloseGlobalStorage')),
			this.workspaceStorage.close().then(() => mark('didCloseWorkspaceStorage'))
		]).then(() => {
			this.logService.trace(`[storage] closing took ${getDuration('willCloseGlobalStorage', 'didCloseGlobalStorage')}ms global / ${getDuration('willCloseWorkspaceStorage', 'didCloseWorkspaceStorage')}ms workspace`);
		});
	}

	private getStorage(scope: StorageScope): IStorage {
		return scope === StorageScope.GLOBAL ? this.globalStorage : this.workspaceStorage;
	}

	getSize(scope: StorageScope): number {
		return scope === StorageScope.GLOBAL ? this.globalStorage.size : this.workspaceStorage.size;
	}

	checkIntegrity(scope: StorageScope, full: boolean): Thenable<string> {
		return scope === StorageScope.GLOBAL ? this.globalStorage.checkIntegrity(full) : this.workspaceStorage.checkIntegrity(full);
	}

	logStorage(): Promise<void> {
		return Promise.all([
			this.globalStorage.items,
			this.workspaceStorage.items,
			this.globalStorage.checkIntegrity(true /* full */),
			this.workspaceStorage.checkIntegrity(true /* full */)
		]).then(result => {
			const safeParse = (value: string) => {
				try {
					return JSON.parse(value);
				} catch (error) {
					return value;
				}
			};

			const globalItems = new Map<string, string>();
			const globalItemsParsed = new Map<string, string>();
			result[0].forEach((value, key) => {
				globalItems.set(key, value);
				globalItemsParsed.set(key, safeParse(value));
			});

			const workspaceItems = new Map<string, string>();
			const workspaceItemsParsed = new Map<string, string>();
			result[1].forEach((value, key) => {
				workspaceItems.set(key, value);
				workspaceItemsParsed.set(key, safeParse(value));
			});

			console.group(`Storage: Global (integrity: ${result[2]}, load: ${getDuration('main:willInitGlobalStorage', 'main:didInitGlobalStorage')}, path: ${this.environmentService.globalStorageHome})`);
			let globalValues: { key: string, value: string }[] = [];
			globalItems.forEach((value, key) => {
				globalValues.push({ key, value });
			});
			console.table(globalValues);
			console.groupEnd();

			console.log(globalItemsParsed);

			console.group(`Storage: Workspace (integrity: ${result[3]}, load: ${getDuration('willInitWorkspaceStorage', 'didInitWorkspaceStorage')}, path: ${this.workspaceStoragePath})`);
			let workspaceValues: { key: string, value: string }[] = [];
			workspaceItems.forEach((value, key) => {
				workspaceValues.push({ key, value });
			});
			console.table(workspaceValues);
			console.groupEnd();

			console.log(workspaceItemsParsed);
		});
	}

	migrate(toWorkspace: IWorkspaceInitializationPayload): Thenable<void> {
		if (this.workspaceStoragePath === SQLiteStorageDatabase.IN_MEMORY_PATH) {
			return Promise.resolve(); // no migration needed if running in memory
		}

		// Close workspace DB to be able to copy
		return this.workspaceStorage.close().then(() => {

			// Prepare new workspace storage folder
			return this.prepareWorkspaceStorageFolder(toWorkspace).then(result => {
				const newWorkspaceStoragePath = join(result.path, StorageService.WORKSPACE_STORAGE_NAME);

				// Copy current storage over to new workspace storage
				return copy(this.workspaceStoragePath, newWorkspaceStoragePath).then(() => {

					// Recreate and init workspace storage
					return this.createWorkspaceStorage(newWorkspaceStoragePath).init();
				});
			});
		});
	}
}

export class LogStorageAction extends Action {

	static readonly ID = 'workbench.action.logStorage';
	static LABEL = localize({ key: 'logStorage', comment: ['A developer only action to log the contents of the storage for the current window.'] }, "Log Storage Database Contents");

	constructor(
		id: string,
		label: string,
		@IStorageService private storageService: DelegatingStorageService,
		@IWindowService private windowService: IWindowService
	) {
		super(id, label);
	}

	run(): Thenable<void> {
		this.storageService.storage.logStorage();

		return this.windowService.openDevTools();
	}
}

export class DelegatingStorageService extends Disposable implements IStorageService {
	_serviceBrand: any;

	private _onDidChangeStorage: Emitter<IWorkspaceStorageChangeEvent> = this._register(new Emitter<IWorkspaceStorageChangeEvent>());
	get onDidChangeStorage(): Event<IWorkspaceStorageChangeEvent> { return this._onDidChangeStorage.event; }

	private _onWillSaveState: Emitter<IWillSaveStateEvent> = this._register(new Emitter<IWillSaveStateEvent>());
	get onWillSaveState(): Event<IWillSaveStateEvent> { return this._onWillSaveState.event; }

	private closed: boolean;
	private useLegacyWorkspaceStorage: boolean;

	constructor(
		private storageService: IStorageService,
		private storageLegacyService: IStorageLegacyService,
		private logService: ILogService,
		configurationService: IConfigurationService
	) {
		super();

		this.useLegacyWorkspaceStorage = configurationService.inspect<boolean>('workbench.enableLegacyStorage').value === true;

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.storageService.onDidChangeStorage(e => this._onDidChangeStorage.fire(e)));
		this._register(this.storageService.onWillSaveState(e => this._onWillSaveState.fire(e)));

		const globalKeyMarker = 'storage://global/';

		window.addEventListener('storage', e => {
			if (e.key && startsWith(e.key, globalKeyMarker)) {
				const key = e.key.substr(globalKeyMarker.length);

				this._onDidChangeStorage.fire({ key, scope: StorageScope.GLOBAL });
			}
		});
	}

	get storage(): StorageService {
		return this.storageService as StorageService;
	}

	get(key: string, scope: StorageScope, fallbackValue: string): string;
	get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined {
		if (!this.useLegacyWorkspaceStorage) {
			if (scope === StorageScope.WORKSPACE || process.env['VSCODE_TEST_STORAGE_MIGRATION']) {
				return this.storageService.get(key, scope, fallbackValue);
			}
		}

		return this.storageLegacyService.get(key, this.convertScope(scope), fallbackValue);
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined {
		if (!this.useLegacyWorkspaceStorage) {
			if (scope === StorageScope.WORKSPACE || process.env['VSCODE_TEST_STORAGE_MIGRATION']) {
				return this.storageService.getBoolean(key, scope, fallbackValue);
			}
		}

		return this.storageLegacyService.getBoolean(key, this.convertScope(scope), fallbackValue);
	}

	getInteger(key: string, scope: StorageScope, fallbackValue: number): number;
	getInteger(key: string, scope: StorageScope, fallbackValue?: number): number | undefined {
		if (!this.useLegacyWorkspaceStorage) {
			if (scope === StorageScope.WORKSPACE || process.env['VSCODE_TEST_STORAGE_MIGRATION']) {
				return this.storageService.getInteger(key, scope, fallbackValue);
			}
		}

		return this.storageLegacyService.getInteger(key, this.convertScope(scope), fallbackValue);
	}

	store(key: string, value: any, scope: StorageScope): void {
		if (this.closed) {
			this.logService.warn(`Unsupported write (store) access after close (key: ${key})`);

			return; // prevent writing after close to detect late write access
		}

		this.storageLegacyService.store(key, value, this.convertScope(scope));

		this.storageService.store(key, value, scope);
	}

	remove(key: string, scope: StorageScope): void {
		if (this.closed) {
			this.logService.warn(`Unsupported write (remove) access after close (key: ${key})`);

			return; // prevent writing after close to detect late write access
		}

		this.storageLegacyService.remove(key, this.convertScope(scope));

		this.storageService.remove(key, scope);
	}

	close(): Promise<void> {
		const promise = this.storage.close();

		this.closed = true;

		return promise;
	}

	private convertScope(scope: StorageScope): StorageLegacyScope {
		return scope === StorageScope.GLOBAL ? StorageLegacyScope.GLOBAL : StorageLegacyScope.WORKSPACE;
	}
}