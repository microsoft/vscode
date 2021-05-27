/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, Emitter, PauseableEmitter } from 'vs/base/common/event';
import { Disposable, dispose, MutableDisposable } from 'vs/base/common/lifecycle';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { IWorkspaceInitializationPayload } from 'vs/platform/workspaces/common/workspaces';
import { InMemoryStorageDatabase, IStorage, Storage } from 'vs/base/parts/storage/common/storage';
import { Promises, RunOnceScheduler, runWhenIdle } from 'vs/base/common/async';

export const IS_NEW_KEY = '__$__isNewStorageMarker';
const TARGET_KEY = '__$__targetStorageMarker';

export const IStorageService = createDecorator<IStorageService>('storageService');

export enum WillSaveStateReason {

	/**
	 * No specific reason to save state.
	 */
	NONE,

	/**
	 * A hint that the workbench is about to shutdown.
	 */
	SHUTDOWN
}

export interface IWillSaveStateEvent {
	reason: WillSaveStateReason;
}

export interface IStorageService {

	readonly _serviceBrand: undefined;

	/**
	 * Emitted whenever data is updated or deleted.
	 */
	readonly onDidChangeValue: Event<IStorageValueChangeEvent>;

	/**
	 * Emitted whenever target of a storage entry changes.
	 */
	readonly onDidChangeTarget: Event<IStorageTargetChangeEvent>;

	/**
	 * Emitted when the storage is about to persist. This is the right time
	 * to persist data to ensure it is stored before the application shuts
	 * down.
	 *
	 * The will save state event allows to optionally ask for the reason of
	 * saving the state, e.g. to find out if the state is saved due to a
	 * shutdown.
	 *
	 * Note: this event may be fired many times, not only on shutdown to prevent
	 * loss of state in situations where the shutdown is not sufficient to
	 * persist the data properly.
	 */
	readonly onWillSaveState: Event<IWillSaveStateEvent>;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided `defaultValue` if the element is `null` or `undefined`.
	 *
	 * @param scope allows to define the scope of the storage operation
	 * to either the current workspace only or all workspaces.
	 */
	get(key: string, scope: StorageScope, fallbackValue: string): string;
	get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided `defaultValue` if the element is `null` or `undefined`.
	 * The element will be converted to a `boolean`.
	 *
	 * @param scope allows to define the scope of the storage operation
	 * to either the current workspace only or all workspaces.
	 */
	getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined;

	/**
	 * Retrieve an element stored with the given key from storage. Use
	 * the provided `defaultValue` if the element is `null` or `undefined`.
	 * The element will be converted to a `number` using `parseInt` with a
	 * base of `10`.
	 *
	 * @param scope allows to define the scope of the storage operation
	 * to either the current workspace only or all workspaces.
	 */
	getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
	getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined;

	/**
	 * Store a value under the given key to storage. The value will be
	 * converted to a `string`. Storing either `undefined` or `null` will
	 * remove the entry under the key.
	 *
	 * @param scope allows to define the scope of the storage operation
	 * to either the current workspace only or all workspaces.
	 *
	 * @param target allows to define the target of the storage operation
	 * to either the current machine or user.
	 */
	store(key: string, value: string | boolean | number | undefined | null, scope: StorageScope, target: StorageTarget): void;

	/**
	 * Delete an element stored under the provided key from storage.
	 *
	 * The scope argument allows to define the scope of the storage
	 * operation to either the current workspace only or all workspaces.
	 */
	remove(key: string, scope: StorageScope): void;

	/**
	 * Returns all the keys used in the storage for the provided `scope`
	 * and `target`.
	 *
	 * Note: this will NOT return all keys stored in the storage layer.
	 * Some keys may not have an associated `StorageTarget` and thus
	 * will be excluded from the results.
	 *
	 * @param scope allows to define the scope for the keys
	 * to either the current workspace only or all workspaces.
	 *
	 * @param target allows to define the target for the keys
	 * to either the current machine or user.
	 */
	keys(scope: StorageScope, target: StorageTarget): string[];

	/**
	 * Log the contents of the storage to the console.
	 */
	logStorage(): void;

	/**
	 * Migrate the storage contents to another workspace.
	 */
	migrate(toWorkspace: IWorkspaceInitializationPayload): Promise<void>;

	/**
	 * Whether the storage for the given scope was created during this session or
	 * existed before.
	 */
	isNew(scope: StorageScope): boolean;

	/**
	 * Allows to flush state, e.g. in cases where a shutdown is
	 * imminent. This will send out the `onWillSaveState` to ask
	 * everyone for latest state.
	 *
	 * @returns a `Promise` that can be awaited on when all updates
	 * to the underlying storage have been flushed.
	 */
	flush(): Promise<void>;
}

export const enum StorageScope {

	/**
	 * The stored data will be scoped to all workspaces.
	 */
	GLOBAL,

	/**
	 * The stored data will be scoped to the current workspace.
	 */
	WORKSPACE
}

export const enum StorageTarget {

	/**
	 * The stored data is user specific and applies across machines.
	 */
	USER,

	/**
	 * The stored data is machine specific.
	 */
	MACHINE
}

export interface IStorageValueChangeEvent {

	/**
	 * The scope for the storage entry that changed
	 * or was removed.
	 */
	readonly scope: StorageScope;

	/**
	 * The `key` of the storage entry that was changed
	 * or was removed.
	 */
	readonly key: string;

	/**
	 * The `target` can be `undefined` if a key is being
	 * removed.
	 */
	readonly target: StorageTarget | undefined;
}

export interface IStorageTargetChangeEvent {

	/**
	 * The scope for the target that changed. Listeners
	 * should use `keys(scope, target)` to get an updated
	 * list of keys for the given `scope` and `target`.
	 */
	readonly scope: StorageScope;
}

interface IKeyTargets {
	[key: string]: StorageTarget
}

export interface IStorageServiceOptions {
	flushInterval: number;
}

export abstract class AbstractStorageService extends Disposable implements IStorageService {

	declare readonly _serviceBrand: undefined;

	private static DEFAULT_FLUSH_INTERVAL = 60 * 1000; // every minute

	private readonly _onDidChangeValue = this._register(new PauseableEmitter<IStorageValueChangeEvent>());
	readonly onDidChangeValue = this._onDidChangeValue.event;

	private readonly _onDidChangeTarget = this._register(new PauseableEmitter<IStorageTargetChangeEvent>());
	readonly onDidChangeTarget = this._onDidChangeTarget.event;

	private readonly _onWillSaveState = this._register(new Emitter<IWillSaveStateEvent>());
	readonly onWillSaveState = this._onWillSaveState.event;

	private initializationPromise: Promise<void> | undefined;

	private readonly flushWhenIdleScheduler = this._register(new RunOnceScheduler(() => this.doFlushWhenIdle(), this.options.flushInterval));
	private readonly runFlushWhenIdle = this._register(new MutableDisposable());

	constructor(private options: IStorageServiceOptions = { flushInterval: AbstractStorageService.DEFAULT_FLUSH_INTERVAL }) {
		super();
	}

	private doFlushWhenIdle(): void {
		this.runFlushWhenIdle.value = runWhenIdle(() => {
			if (this.shouldFlushWhenIdle()) {
				this.flush();
			}

			// repeat
			this.flushWhenIdleScheduler.schedule();
		});
	}

	protected shouldFlushWhenIdle(): boolean {
		return true;
	}

	protected stopFlushWhenIdle(): void {
		dispose([this.runFlushWhenIdle, this.flushWhenIdleScheduler]);
	}

	initialize(): Promise<void> {
		if (!this.initializationPromise) {
			this.initializationPromise = (async () => {

				// Ask subclasses to initialize storage
				await this.doInitialize();

				// On some OS we do not get enough time to persist state on shutdown (e.g. when
				// Windows restarts after applying updates). In other cases, VSCode might crash,
				// so we periodically save state to reduce the chance of loosing any state.
				// In the browser we do not have support for long running unload sequences. As such,
				// we cannot ask for saving state in that moment, because that would result in a
				// long running operation.
				// Instead, periodically ask customers to save save. The library will be clever enough
				// to only save state that has actually changed.
				this.flushWhenIdleScheduler.schedule();
			})();
		}

		return this.initializationPromise;
	}

	protected emitDidChangeValue(scope: StorageScope, key: string): void {

		// Specially handle `TARGET_KEY`
		if (key === TARGET_KEY) {

			// Clear our cached version which is now out of date
			if (scope === StorageScope.GLOBAL) {
				this._globalKeyTargets = undefined;
			} else if (scope === StorageScope.WORKSPACE) {
				this._workspaceKeyTargets = undefined;
			}

			// Emit as `didChangeTarget` event
			this._onDidChangeTarget.fire({ scope });
		}

		// Emit any other key to outside
		else {
			this._onDidChangeValue.fire({ scope, key, target: this.getKeyTargets(scope)[key] });
		}
	}

	protected emitWillSaveState(reason: WillSaveStateReason): void {
		this._onWillSaveState.fire({ reason });
	}

	get(key: string, scope: StorageScope, fallbackValue: string): string;
	get(key: string, scope: StorageScope): string | undefined;
	get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined {
		return this.getStorage(scope)?.get(key, fallbackValue);
	}

	getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
	getBoolean(key: string, scope: StorageScope): boolean | undefined;
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined {
		return this.getStorage(scope)?.getBoolean(key, fallbackValue);
	}

	getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
	getNumber(key: string, scope: StorageScope): number | undefined;
	getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined {
		return this.getStorage(scope)?.getNumber(key, fallbackValue);
	}

	store(key: string, value: string | boolean | number | undefined | null, scope: StorageScope, target: StorageTarget): void {

		// We remove the key for undefined/null values
		if (isUndefinedOrNull(value)) {
			this.remove(key, scope);
			return;
		}

		// Update our datastructures but send events only after
		this.withPausedEmitters(() => {

			// Update key-target map
			this.updateKeyTarget(key, scope, target);

			// Store actual value
			this.getStorage(scope)?.set(key, value);
		});
	}

	remove(key: string, scope: StorageScope): void {

		// Update our datastructures but send events only after
		this.withPausedEmitters(() => {

			// Update key-target map
			this.updateKeyTarget(key, scope, undefined);

			// Remove actual key
			this.getStorage(scope)?.delete(key);
		});
	}

	private withPausedEmitters(fn: Function): void {

		// Pause emitters
		this._onDidChangeValue.pause();
		this._onDidChangeTarget.pause();

		try {
			fn();
		} finally {

			// Resume emitters
			this._onDidChangeValue.resume();
			this._onDidChangeTarget.resume();
		}
	}

	keys(scope: StorageScope, target: StorageTarget): string[] {
		const keys: string[] = [];

		const keyTargets = this.getKeyTargets(scope);
		for (const key of Object.keys(keyTargets)) {
			const keyTarget = keyTargets[key];
			if (keyTarget === target) {
				keys.push(key);
			}
		}

		return keys;
	}

	private updateKeyTarget(key: string, scope: StorageScope, target: StorageTarget | undefined): void {

		// Add
		const keyTargets = this.getKeyTargets(scope);
		if (typeof target === 'number') {
			if (keyTargets[key] !== target) {
				keyTargets[key] = target;
				this.getStorage(scope)?.set(TARGET_KEY, JSON.stringify(keyTargets));
			}
		}

		// Remove
		else {
			if (typeof keyTargets[key] === 'number') {
				delete keyTargets[key];
				this.getStorage(scope)?.set(TARGET_KEY, JSON.stringify(keyTargets));
			}
		}
	}

	private _workspaceKeyTargets: IKeyTargets | undefined = undefined;
	private get workspaceKeyTargets(): IKeyTargets {
		if (!this._workspaceKeyTargets) {
			this._workspaceKeyTargets = this.loadKeyTargets(StorageScope.WORKSPACE);
		}

		return this._workspaceKeyTargets;
	}

	private _globalKeyTargets: IKeyTargets | undefined = undefined;
	private get globalKeyTargets(): IKeyTargets {
		if (!this._globalKeyTargets) {
			this._globalKeyTargets = this.loadKeyTargets(StorageScope.GLOBAL);
		}

		return this._globalKeyTargets;
	}

	private getKeyTargets(scope: StorageScope): IKeyTargets {
		return scope === StorageScope.GLOBAL ? this.globalKeyTargets : this.workspaceKeyTargets;
	}

	private loadKeyTargets(scope: StorageScope): { [key: string]: StorageTarget } {
		const keysRaw = this.get(TARGET_KEY, scope);
		if (keysRaw) {
			try {
				return JSON.parse(keysRaw);
			} catch (error) {
				// Fail gracefully
			}
		}

		return Object.create(null);
	}

	isNew(scope: StorageScope): boolean {
		return this.getBoolean(IS_NEW_KEY, scope) === true;
	}

	async flush(): Promise<void> {

		// Signal event to collect changes
		this._onWillSaveState.fire({ reason: WillSaveStateReason.NONE });

		// Await flush
		await Promises.settled([
			this.getStorage(StorageScope.GLOBAL)?.whenFlushed() ?? Promise.resolve(),
			this.getStorage(StorageScope.WORKSPACE)?.whenFlushed() ?? Promise.resolve()
		]);
	}

	async logStorage(): Promise<void> {
		const globalItems = this.getStorage(StorageScope.GLOBAL)?.items ?? new Map<string, string>();
		const workspaceItems = this.getStorage(StorageScope.WORKSPACE)?.items ?? new Map<string, string>();

		return logStorage(
			globalItems,
			workspaceItems,
			this.getLogDetails(StorageScope.GLOBAL) ?? '',
			this.getLogDetails(StorageScope.WORKSPACE) ?? ''
		);
	}

	// --- abstract

	protected abstract doInitialize(): Promise<void>;

	protected abstract getStorage(scope: StorageScope): IStorage | undefined;

	protected abstract getLogDetails(scope: StorageScope): string | undefined;

	abstract migrate(toWorkspace: IWorkspaceInitializationPayload): Promise<void>;
}

export class InMemoryStorageService extends AbstractStorageService {

	private globalStorage = new Storage(new InMemoryStorageDatabase());
	private workspaceStorage = new Storage(new InMemoryStorageDatabase());

	constructor() {
		super();

		this._register(this.workspaceStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.WORKSPACE, key)));
		this._register(this.globalStorage.onDidChangeStorage(key => this.emitDidChangeValue(StorageScope.GLOBAL, key)));
	}

	protected getStorage(scope: StorageScope): IStorage {
		return scope === StorageScope.GLOBAL ? this.globalStorage : this.workspaceStorage;
	}

	protected getLogDetails(scope: StorageScope): string | undefined {
		return scope === StorageScope.GLOBAL ? 'inMemory (global)' : 'inMemory (workspace)';
	}

	protected async doInitialize(): Promise<void> { }

	async migrate(toWorkspace: IWorkspaceInitializationPayload): Promise<void> {
		// not supported
	}
}

export async function logStorage(global: Map<string, string>, workspace: Map<string, string>, globalPath: string, workspacePath: string): Promise<void> {
	const safeParse = (value: string) => {
		try {
			return JSON.parse(value);
		} catch (error) {
			return value;
		}
	};

	const globalItems = new Map<string, string>();
	const globalItemsParsed = new Map<string, string>();
	global.forEach((value, key) => {
		globalItems.set(key, value);
		globalItemsParsed.set(key, safeParse(value));
	});

	const workspaceItems = new Map<string, string>();
	const workspaceItemsParsed = new Map<string, string>();
	workspace.forEach((value, key) => {
		workspaceItems.set(key, value);
		workspaceItemsParsed.set(key, safeParse(value));
	});

	console.group(`Storage: Global (path: ${globalPath})`);
	let globalValues: { key: string, value: string }[] = [];
	globalItems.forEach((value, key) => {
		globalValues.push({ key, value });
	});
	console.table(globalValues);
	console.groupEnd();

	console.log(globalItemsParsed);

	console.group(`Storage: Workspace (path: ${workspacePath})`);
	let workspaceValues: { key: string, value: string }[] = [];
	workspaceItems.forEach((value, key) => {
		workspaceValues.push({ key, value });
	});
	console.table(workspaceValues);
	console.groupEnd();

	console.log(workspaceItemsParsed);
}
