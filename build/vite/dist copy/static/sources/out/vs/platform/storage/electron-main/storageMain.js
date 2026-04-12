/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import { top } from '../../../base/common/arrays.js';
import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { join } from '../../../base/common/path.js';
import { StopWatch } from '../../../base/common/stopwatch.js';
import { URI } from '../../../base/common/uri.js';
import { Promises } from '../../../base/node/pfs.js';
import { InMemoryStorageDatabase, Storage, StorageHint, StorageState } from '../../../base/parts/storage/common/storage.js';
import { SQLiteStorageDatabase } from '../../../base/parts/storage/node/storage.js';
import { LogLevel } from '../../log/common/log.js';
import { IS_NEW_KEY } from '../common/storage.js';
import { currentSessionDateStorageKey, firstSessionDateStorageKey, lastSessionDateStorageKey } from '../../telemetry/common/telemetry.js';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { Schemas } from '../../../base/common/network.js';
class BaseStorageMain extends Disposable {
    static { this.LOG_SLOW_CLOSE_THRESHOLD = 2000; }
    get storage() { return this._storage; }
    constructor(logService, fileService) {
        super();
        this.logService = logService;
        this.fileService = fileService;
        this._onDidChangeStorage = this._register(new Emitter());
        this.onDidChangeStorage = this._onDidChangeStorage.event;
        this._onDidCloseStorage = this._register(new Emitter());
        this.onDidCloseStorage = this._onDidCloseStorage.event;
        this._storage = this._register(new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY })); // storage is in-memory until initialized
        this.initializePromise = undefined;
        this.whenInitPromise = new DeferredPromise();
        this.whenInit = this.whenInitPromise.p;
        this.state = StorageState.None;
    }
    isInMemory() {
        return this._storage.isInMemory();
    }
    init() {
        if (!this.initializePromise) {
            this.initializePromise = (async () => {
                if (this.state !== StorageState.None) {
                    return; // either closed or already initialized
                }
                try {
                    // Create storage via subclasses
                    const storage = this._register(await this.doCreate());
                    // Replace our in-memory storage with the real
                    // once as soon as possible without awaiting
                    // the init call.
                    this._storage.dispose();
                    this._storage = storage;
                    // Re-emit storage changes via event
                    this._register(storage.onDidChangeStorage(e => this._onDidChangeStorage.fire(e)));
                    // Await storage init
                    await this.doInit(storage);
                    // Ensure we track whether storage is new or not
                    const isNewStorage = storage.getBoolean(IS_NEW_KEY);
                    if (isNewStorage === undefined) {
                        storage.set(IS_NEW_KEY, true);
                    }
                    else if (isNewStorage) {
                        storage.set(IS_NEW_KEY, false);
                    }
                }
                catch (error) {
                    this.logService.error(`[storage main] initialize(): Unable to init storage due to ${error}`);
                }
                finally {
                    // Update state
                    this.state = StorageState.Initialized;
                    // Mark init promise as completed
                    this.whenInitPromise.complete();
                }
            })();
        }
        return this.initializePromise;
    }
    createLoggingOptions() {
        return {
            logTrace: (this.logService.getLevel() === LogLevel.Trace) ? msg => this.logService.trace(msg) : undefined,
            logError: error => this.logService.error(error)
        };
    }
    doInit(storage) {
        return storage.init();
    }
    get items() { return this._storage.items; }
    get(key, fallbackValue) {
        return this._storage.get(key, fallbackValue);
    }
    set(key, value) {
        return this._storage.set(key, value);
    }
    delete(key) {
        return this._storage.delete(key);
    }
    optimize() {
        return this._storage.optimize();
    }
    async close() {
        // Measure how long it takes to close storage
        const watch = new StopWatch(false);
        await this.doClose();
        watch.stop();
        // If close() is taking a long time, there is
        // a chance that the underlying DB is large
        // either on disk or in general. In that case
        // log some additional info to further diagnose
        if (watch.elapsed() > BaseStorageMain.LOG_SLOW_CLOSE_THRESHOLD) {
            await this.logSlowClose(watch);
        }
        // Signal as event
        this._onDidCloseStorage.fire();
    }
    async logSlowClose(watch) {
        if (!this.path) {
            return;
        }
        try {
            const largestEntries = top(Array.from(this._storage.items.entries())
                .map(([key, value]) => ({ key, length: value.length })), (entryA, entryB) => entryB.length - entryA.length, 5)
                .map(entry => `${entry.key}:${entry.length}`).join(', ');
            const dbSize = (await this.fileService.stat(URI.file(this.path))).size;
            this.logService.warn(`[storage main] detected slow close() operation: Time: ${watch.elapsed()}ms, DB size: ${dbSize}b, Large Keys: ${largestEntries}`);
        }
        catch (error) {
            this.logService.error('[storage main] figuring out stats for slow DB on close() resulted in an error', error);
        }
    }
    async doClose() {
        // Ensure we are not accidentally leaving
        // a pending initialized storage behind in
        // case `close()` was called before `init()`
        // finishes.
        if (this.initializePromise) {
            await this.initializePromise;
        }
        // Update state
        this.state = StorageState.Closed;
        // Propagate to storage lib
        await this._storage.close();
    }
}
class BaseProfileAwareStorageMain extends BaseStorageMain {
    static { this.STORAGE_NAME = 'state.vscdb'; }
    get path() {
        if (!this.options.useInMemoryStorage) {
            return join(this.profile.globalStorageHome.with({ scheme: Schemas.file }).fsPath, BaseProfileAwareStorageMain.STORAGE_NAME);
        }
        return undefined;
    }
    constructor(profile, options, logService, fileService) {
        super(logService, fileService);
        this.profile = profile;
        this.options = options;
    }
    async doCreate() {
        return new Storage(new SQLiteStorageDatabase(this.path ?? SQLiteStorageDatabase.IN_MEMORY_PATH, {
            logging: this.createLoggingOptions()
        }), !this.path ? { hint: StorageHint.STORAGE_IN_MEMORY } : undefined);
    }
}
export class ProfileStorageMain extends BaseProfileAwareStorageMain {
}
export class ApplicationStorageMain extends BaseProfileAwareStorageMain {
    constructor(options, userDataProfileService, logService, fileService) {
        super(userDataProfileService.defaultProfile, options, logService, fileService);
    }
    async doInit(storage) {
        await super.doInit(storage);
        // Apply telemetry values as part of the application storage initialization
        this.updateTelemetryState(storage);
    }
    updateTelemetryState(storage) {
        // First session date (once)
        const firstSessionDate = storage.get(firstSessionDateStorageKey, undefined);
        if (firstSessionDate === undefined) {
            storage.set(firstSessionDateStorageKey, new Date().toUTCString());
        }
        // Last / current session (always)
        // previous session date was the "current" one at that time
        // current session date is "now"
        const lastSessionDate = storage.get(currentSessionDateStorageKey, undefined);
        const currentSessionDate = new Date().toUTCString();
        storage.set(lastSessionDateStorageKey, typeof lastSessionDate === 'undefined' ? null : lastSessionDate);
        storage.set(currentSessionDateStorageKey, currentSessionDate);
    }
}
export class WorkspaceStorageMain extends BaseStorageMain {
    static { this.WORKSPACE_STORAGE_NAME = 'state.vscdb'; }
    static { this.WORKSPACE_META_NAME = 'workspace.json'; }
    get path() {
        if (!this.options.useInMemoryStorage) {
            return join(this.environmentService.workspaceStorageHome.with({ scheme: Schemas.file }).fsPath, this.workspace.id, WorkspaceStorageMain.WORKSPACE_STORAGE_NAME);
        }
        return undefined;
    }
    constructor(workspace, options, logService, environmentService, fileService) {
        super(logService, fileService);
        this.workspace = workspace;
        this.options = options;
        this.environmentService = environmentService;
    }
    async doCreate() {
        const { storageFilePath, wasCreated } = await this.prepareWorkspaceStorageFolder();
        return new Storage(new SQLiteStorageDatabase(storageFilePath, {
            logging: this.createLoggingOptions()
        }), { hint: this.options.useInMemoryStorage ? StorageHint.STORAGE_IN_MEMORY : wasCreated ? StorageHint.STORAGE_DOES_NOT_EXIST : undefined });
    }
    async prepareWorkspaceStorageFolder() {
        // Return early if using inMemory storage
        if (this.options.useInMemoryStorage) {
            return { storageFilePath: SQLiteStorageDatabase.IN_MEMORY_PATH, wasCreated: true };
        }
        // Otherwise, ensure the storage folder exists on disk
        const workspaceStorageFolderPath = join(this.environmentService.workspaceStorageHome.with({ scheme: Schemas.file }).fsPath, this.workspace.id);
        const workspaceStorageDatabasePath = join(workspaceStorageFolderPath, WorkspaceStorageMain.WORKSPACE_STORAGE_NAME);
        const storageExists = await Promises.exists(workspaceStorageFolderPath);
        if (storageExists) {
            return { storageFilePath: workspaceStorageDatabasePath, wasCreated: false };
        }
        // Ensure storage folder exists
        await fs.promises.mkdir(workspaceStorageFolderPath, { recursive: true });
        // Write metadata into folder (but do not await)
        this.ensureWorkspaceStorageFolderMeta(workspaceStorageFolderPath);
        return { storageFilePath: workspaceStorageDatabasePath, wasCreated: true };
    }
    async ensureWorkspaceStorageFolderMeta(workspaceStorageFolderPath) {
        let meta = undefined;
        if (isSingleFolderWorkspaceIdentifier(this.workspace)) {
            meta = { folder: this.workspace.uri.toString() };
        }
        else if (isWorkspaceIdentifier(this.workspace)) {
            meta = { workspace: this.workspace.configPath.toString() };
        }
        if (meta) {
            try {
                const workspaceStorageMetaPath = join(workspaceStorageFolderPath, WorkspaceStorageMain.WORKSPACE_META_NAME);
                const storageExists = await Promises.exists(workspaceStorageMetaPath);
                if (!storageExists) {
                    await Promises.writeFile(workspaceStorageMetaPath, JSON.stringify(meta, undefined, 2));
                }
            }
            catch (error) {
                this.logService.error(`[storage main] ensureWorkspaceStorageFolderMeta(): Unable to create workspace storage metadata due to ${error}`);
            }
        }
    }
}
export class InMemoryStorageMain extends BaseStorageMain {
    get path() {
        return undefined; // in-memory has no path
    }
    async doCreate() {
        return new Storage(new InMemoryStorageDatabase(), { hint: StorageHint.STORAGE_IN_MEMORY });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmFnZU1haW4uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9zdG9yYWdlL2VsZWN0cm9uLW1haW4vc3RvcmFnZU1haW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDekIsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLG1DQUFtQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwyQkFBMkIsQ0FBQztBQUNyRCxPQUFPLEVBQUUsdUJBQXVCLEVBQVksT0FBTyxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN0SSxPQUFPLEVBQXdDLHFCQUFxQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFHMUgsT0FBTyxFQUFlLFFBQVEsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ2hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUVsRCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsMEJBQTBCLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUMxSSxPQUFPLEVBQUUsaUNBQWlDLEVBQUUscUJBQXFCLEVBQTJCLE1BQU0scUNBQXFDLENBQUM7QUFDeEksT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBNEYxRCxNQUFlLGVBQWdCLFNBQVEsVUFBVTthQUV4Qiw2QkFBd0IsR0FBRyxJQUFJLEFBQVAsQ0FBUTtJQVN4RCxJQUFJLE9BQU8sS0FBZSxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBV2pELFlBQ29CLFVBQXVCLEVBQ3pCLFdBQXlCO1FBRTFDLEtBQUssRUFBRSxDQUFDO1FBSFcsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQUN6QixnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQXBCeEIsd0JBQW1CLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBdUIsQ0FBQyxDQUFDO1FBQ25GLHVCQUFrQixHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUM7UUFFNUMsdUJBQWtCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDakUsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQztRQUVuRCxhQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxJQUFJLHVCQUF1QixFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsV0FBVyxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMseUNBQXlDO1FBS3pKLHNCQUFpQixHQUE4QixTQUFTLENBQUM7UUFFaEQsb0JBQWUsR0FBRyxJQUFJLGVBQWUsRUFBUSxDQUFDO1FBQ3RELGFBQVEsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUMsQ0FBQztRQUVuQyxVQUFLLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBQztJQU9sQyxDQUFDO0lBRUQsVUFBVTtRQUNULE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQztJQUNuQyxDQUFDO0lBRUQsSUFBSTtRQUNILElBQUksQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUM3QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxLQUFLLElBQUksRUFBRTtnQkFDcEMsSUFBSSxJQUFJLENBQUMsS0FBSyxLQUFLLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDdEMsT0FBTyxDQUFDLHVDQUF1QztnQkFDaEQsQ0FBQztnQkFFRCxJQUFJLENBQUM7b0JBRUosZ0NBQWdDO29CQUNoQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7b0JBRXRELDhDQUE4QztvQkFDOUMsNENBQTRDO29CQUM1QyxpQkFBaUI7b0JBQ2pCLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7b0JBQ3hCLElBQUksQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDO29CQUV4QixvQ0FBb0M7b0JBQ3BDLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBRWxGLHFCQUFxQjtvQkFDckIsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUUzQixnREFBZ0Q7b0JBQ2hELE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBQ3BELElBQUksWUFBWSxLQUFLLFNBQVMsRUFBRSxDQUFDO3dCQUNoQyxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztvQkFDL0IsQ0FBQzt5QkFBTSxJQUFJLFlBQVksRUFBRSxDQUFDO3dCQUN6QixPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQztvQkFDaEMsQ0FBQztnQkFDRixDQUFDO2dCQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7b0JBQ2hCLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLDhEQUE4RCxLQUFLLEVBQUUsQ0FBQyxDQUFDO2dCQUM5RixDQUFDO3dCQUFTLENBQUM7b0JBRVYsZUFBZTtvQkFDZixJQUFJLENBQUMsS0FBSyxHQUFHLFlBQVksQ0FBQyxXQUFXLENBQUM7b0JBRXRDLGlDQUFpQztvQkFDakMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDakMsQ0FBQztZQUNGLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDTixDQUFDO1FBRUQsT0FBTyxJQUFJLENBQUMsaUJBQWlCLENBQUM7SUFDL0IsQ0FBQztJQUVTLG9CQUFvQjtRQUM3QixPQUFPO1lBQ04sUUFBUSxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsS0FBSyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVM7WUFDekcsUUFBUSxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO1NBQy9DLENBQUM7SUFDSCxDQUFDO0lBRVMsTUFBTSxDQUFDLE9BQWlCO1FBQ2pDLE9BQU8sT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ3ZCLENBQUM7SUFJRCxJQUFJLEtBQUssS0FBMEIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFJaEUsR0FBRyxDQUFDLEdBQVcsRUFBRSxhQUFzQjtRQUN0QyxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxhQUFhLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQsR0FBRyxDQUFDLEdBQVcsRUFBRSxLQUFtRDtRQUNuRSxPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN0QyxDQUFDO0lBRUQsTUFBTSxDQUFDLEdBQVc7UUFDakIsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRUQsUUFBUTtRQUNQLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztJQUNqQyxDQUFDO0lBRUQsS0FBSyxDQUFDLEtBQUs7UUFFViw2Q0FBNkM7UUFDN0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbkMsTUFBTSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDckIsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1FBRWIsNkNBQTZDO1FBQzdDLDJDQUEyQztRQUMzQyw2Q0FBNkM7UUFDN0MsK0NBQStDO1FBQy9DLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxHQUFHLGVBQWUsQ0FBQyx3QkFBd0IsRUFBRSxDQUFDO1lBQ2hFLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNoQyxDQUFDO1FBRUQsa0JBQWtCO1FBQ2xCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNoQyxDQUFDO0lBRU8sS0FBSyxDQUFDLFlBQVksQ0FBQyxLQUFnQjtRQUMxQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hCLE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0osTUFBTSxjQUFjLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7aUJBQ2xFLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztpQkFDN0csR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsR0FBRyxJQUFJLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMxRCxNQUFNLE1BQU0sR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUV2RSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyx5REFBeUQsS0FBSyxDQUFDLE9BQU8sRUFBRSxnQkFBZ0IsTUFBTSxrQkFBa0IsY0FBYyxFQUFFLENBQUMsQ0FBQztRQUN4SixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQywrRUFBK0UsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMvRyxDQUFDO0lBQ0YsQ0FBQztJQUVPLEtBQUssQ0FBQyxPQUFPO1FBRXBCLHlDQUF5QztRQUN6QywwQ0FBMEM7UUFDMUMsNENBQTRDO1FBQzVDLFlBQVk7UUFDWixJQUFJLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQzVCLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDO1FBQzlCLENBQUM7UUFFRCxlQUFlO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxZQUFZLENBQUMsTUFBTSxDQUFDO1FBRWpDLDJCQUEyQjtRQUMzQixNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDN0IsQ0FBQzs7QUFHRixNQUFNLDJCQUE0QixTQUFRLGVBQWU7YUFFaEMsaUJBQVksR0FBRyxhQUFhLENBQUM7SUFFckQsSUFBSSxJQUFJO1FBQ1AsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUN0QyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsMkJBQTJCLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDN0gsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxZQUNrQixPQUF5QixFQUN6QixPQUE0QixFQUM3QyxVQUF1QixFQUN2QixXQUF5QjtRQUV6QixLQUFLLENBQUMsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBTGQsWUFBTyxHQUFQLE9BQU8sQ0FBa0I7UUFDekIsWUFBTyxHQUFQLE9BQU8sQ0FBcUI7SUFLOUMsQ0FBQztJQUVTLEtBQUssQ0FBQyxRQUFRO1FBQ3ZCLE9BQU8sSUFBSSxPQUFPLENBQUMsSUFBSSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLHFCQUFxQixDQUFDLGNBQWMsRUFBRTtZQUMvRixPQUFPLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixFQUFFO1NBQ3BDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxFQUFFLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUN2RSxDQUFDOztBQUdGLE1BQU0sT0FBTyxrQkFBbUIsU0FBUSwyQkFBMkI7Q0FFbEU7QUFFRCxNQUFNLE9BQU8sc0JBQXVCLFNBQVEsMkJBQTJCO0lBRXRFLFlBQ0MsT0FBNEIsRUFDNUIsc0JBQWdELEVBQ2hELFVBQXVCLEVBQ3ZCLFdBQXlCO1FBRXpCLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxjQUFjLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUNoRixDQUFDO0lBRWtCLEtBQUssQ0FBQyxNQUFNLENBQUMsT0FBaUI7UUFDaEQsTUFBTSxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRTVCLDJFQUEyRTtRQUMzRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDcEMsQ0FBQztJQUVPLG9CQUFvQixDQUFDLE9BQWlCO1FBRTdDLDRCQUE0QjtRQUM1QixNQUFNLGdCQUFnQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsMEJBQTBCLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDNUUsSUFBSSxnQkFBZ0IsS0FBSyxTQUFTLEVBQUUsQ0FBQztZQUNwQyxPQUFPLENBQUMsR0FBRyxDQUFDLDBCQUEwQixFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUNuRSxDQUFDO1FBRUQsa0NBQWtDO1FBQ2xDLDJEQUEyRDtRQUMzRCxnQ0FBZ0M7UUFDaEMsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM3RSxNQUFNLGtCQUFrQixHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDcEQsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5QkFBeUIsRUFBRSxPQUFPLGVBQWUsS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDeEcsT0FBTyxDQUFDLEdBQUcsQ0FBQyw0QkFBNEIsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0lBQy9ELENBQUM7Q0FDRDtBQUVELE1BQU0sT0FBTyxvQkFBcUIsU0FBUSxlQUFlO2FBRWhDLDJCQUFzQixHQUFHLGFBQWEsQ0FBQzthQUN2Qyx3QkFBbUIsR0FBRyxnQkFBZ0IsQ0FBQztJQUUvRCxJQUFJLElBQUk7UUFDUCxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ3RDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxFQUFFLG9CQUFvQixDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDakssQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFRCxZQUNTLFNBQWtDLEVBQ3pCLE9BQTRCLEVBQzdDLFVBQXVCLEVBQ04sa0JBQXVDLEVBQ3hELFdBQXlCO1FBRXpCLEtBQUssQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFOdkIsY0FBUyxHQUFULFNBQVMsQ0FBeUI7UUFDekIsWUFBTyxHQUFQLE9BQU8sQ0FBcUI7UUFFNUIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFxQjtJQUl6RCxDQUFDO0lBRVMsS0FBSyxDQUFDLFFBQVE7UUFDdkIsTUFBTSxFQUFFLGVBQWUsRUFBRSxVQUFVLEVBQUUsR0FBRyxNQUFNLElBQUksQ0FBQyw2QkFBNkIsRUFBRSxDQUFDO1FBRW5GLE9BQU8sSUFBSSxPQUFPLENBQUMsSUFBSSxxQkFBcUIsQ0FBQyxlQUFlLEVBQUU7WUFDN0QsT0FBTyxFQUFFLElBQUksQ0FBQyxvQkFBb0IsRUFBRTtTQUNwQyxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQztJQUM5SSxDQUFDO0lBRU8sS0FBSyxDQUFDLDZCQUE2QjtRQUUxQyx5Q0FBeUM7UUFDekMsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLGtCQUFrQixFQUFFLENBQUM7WUFDckMsT0FBTyxFQUFFLGVBQWUsRUFBRSxxQkFBcUIsQ0FBQyxjQUFjLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxDQUFDO1FBQ3BGLENBQUM7UUFFRCxzREFBc0Q7UUFDdEQsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUMvSSxNQUFNLDRCQUE0QixHQUFHLElBQUksQ0FBQywwQkFBMEIsRUFBRSxvQkFBb0IsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBRW5ILE1BQU0sYUFBYSxHQUFHLE1BQU0sUUFBUSxDQUFDLE1BQU0sQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQ3hFLElBQUksYUFBYSxFQUFFLENBQUM7WUFDbkIsT0FBTyxFQUFFLGVBQWUsRUFBRSw0QkFBNEIsRUFBRSxVQUFVLEVBQUUsS0FBSyxFQUFFLENBQUM7UUFDN0UsQ0FBQztRQUVELCtCQUErQjtRQUMvQixNQUFNLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLDBCQUEwQixFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFFekUsZ0RBQWdEO1FBQ2hELElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBRWxFLE9BQU8sRUFBRSxlQUFlLEVBQUUsNEJBQTRCLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxDQUFDO0lBQzVFLENBQUM7SUFFTyxLQUFLLENBQUMsZ0NBQWdDLENBQUMsMEJBQWtDO1FBQ2hGLElBQUksSUFBSSxHQUF1QixTQUFTLENBQUM7UUFDekMsSUFBSSxpQ0FBaUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUN2RCxJQUFJLEdBQUcsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUNsRCxDQUFDO2FBQU0sSUFBSSxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUNsRCxJQUFJLEdBQUcsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQztRQUM1RCxDQUFDO1FBRUQsSUFBSSxJQUFJLEVBQUUsQ0FBQztZQUNWLElBQUksQ0FBQztnQkFDSixNQUFNLHdCQUF3QixHQUFHLElBQUksQ0FBQywwQkFBMEIsRUFBRSxvQkFBb0IsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO2dCQUM1RyxNQUFNLGFBQWEsR0FBRyxNQUFNLFFBQVEsQ0FBQyxNQUFNLENBQUMsd0JBQXdCLENBQUMsQ0FBQztnQkFDdEUsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO29CQUNwQixNQUFNLFFBQVEsQ0FBQyxTQUFTLENBQUMsd0JBQXdCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hGLENBQUM7WUFDRixDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDaEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMseUdBQXlHLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDekksQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDOztBQUdGLE1BQU0sT0FBTyxtQkFBb0IsU0FBUSxlQUFlO0lBRXZELElBQUksSUFBSTtRQUNQLE9BQU8sU0FBUyxDQUFDLENBQUMsd0JBQXdCO0lBQzNDLENBQUM7SUFFUyxLQUFLLENBQUMsUUFBUTtRQUN2QixPQUFPLElBQUksT0FBTyxDQUFDLElBQUksdUJBQXVCLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxXQUFXLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO0lBQzVGLENBQUM7Q0FDRCJ9