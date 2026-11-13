/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { isObject } from '../../../../base/common/types.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export const ISharedLayoutStateService = createDecorator<ISharedLayoutStateService>('sharedLayoutStateService');

/**
 * Stores layout state that all windows of a profile share, for example the location
 * of view containers and views. The state is stored in the profile, so a change made
 * in one window applies to all windows of the profile.
 *
 * A window can use a local copy of this state instead, for example while a named
 * layout is active. Changes to the local copy only apply to this window. The local
 * copy is stored per workspace. A key that the local copy does not contain uses the
 * shared value.
 */
export interface ISharedLayoutStateService {

	readonly _serviceBrand: undefined;

	/**
	 * Fires when the value of the given key changes, in this window or in another
	 * window, or because this window switched between the shared state and a local copy.
	 */
	onDidChangeValue(key: string, disposable: DisposableStore): Event<string>;

	/**
	 * Returns the value of the given key, or the fallback value if it has no value.
	 */
	get(key: string, fallbackValue: string): string;

	/**
	 * Stores the value of the given key. Shared values are user state and
	 * therefore synchronized by Settings Sync.
	 */
	store(key: string, value: string): void;

	/**
	 * Removes the value of the given key.
	 */
	remove(key: string): void;

	/**
	 * Returns the values of all keys in use in this window. Keys without a value are `null`.
	 */
	getState(): IStringDictionary<string | null>;

	/**
	 * Returns the shared values of all keys in use in this window, also while this
	 * window uses a local copy. Keys without a value are `null`.
	 */
	getSharedState(): IStringDictionary<string | null>;

	/**
	 * Uses the given state as local copy instead of the shared state. A key that
	 * is `null` in the given state has no value in the local copy. Pass `undefined`
	 * to use the shared state again.
	 */
	setLocalState(state: IStringDictionary<string | null> | undefined): void;
}

export class SharedLayoutStateService extends Disposable implements ISharedLayoutStateService {

	declare readonly _serviceBrand: undefined;

	private static readonly LOCAL_STATE_STORAGE_KEY = 'workbench.sharedLayoutState.local';

	private readonly _onDidChangeValue = this._register(new Emitter<string>());

	/**
	 * Keys in use in this window. Only these keys are part of {@link getState}.
	 */
	private readonly keys = new Set<string>();

	/**
	 * The local copy, if this window uses one. `null` means that the key has no value.
	 */
	private localState: Map<string, string | null> | undefined;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.localState = this.loadLocalState();

		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, undefined, this._store)(e => {
			if (!this.localState?.has(e.key)) {
				this._onDidChangeValue.fire(e.key);
			}
		}));
	}

	onDidChangeValue(key: string, disposable: DisposableStore): Event<string> {
		this.keys.add(key);
		return Event.filter(this._onDidChangeValue.event, changedKey => changedKey === key, disposable);
	}

	get(key: string, fallbackValue: string): string {
		this.keys.add(key);
		return this.getValue(key) ?? fallbackValue;
	}

	store(key: string, value: string): void {
		this.keys.add(key);
		if (!this.localState) {
			this.storageService.store(key, value, StorageScope.PROFILE, StorageTarget.USER);
		} else if (this.localState.get(key) !== value) {
			this.localState.set(key, value);
			this.saveLocalState();
			this._onDidChangeValue.fire(key);
		}
	}

	remove(key: string): void {
		if (!this.localState) {
			this.storageService.remove(key, StorageScope.PROFILE);
		} else if (this.localState.get(key) !== null) {
			const hadValue = this.getValue(key) !== undefined;
			this.localState.set(key, null);
			this.saveLocalState();
			if (hadValue) {
				this._onDidChangeValue.fire(key);
			}
		}
	}

	getState(): IStringDictionary<string | null> {
		const state: IStringDictionary<string | null> = {};
		for (const key of this.getKeys()) {
			state[key] = this.getValue(key) ?? null;
		}
		return state;
	}

	getSharedState(): IStringDictionary<string | null> {
		const state: IStringDictionary<string | null> = {};
		for (const key of this.getKeys()) {
			state[key] = this.storageService.get(key, StorageScope.PROFILE) ?? null;
		}
		return state;
	}

	setLocalState(state: IStringDictionary<string | null> | undefined): void {
		const keys = this.getKeys(state);
		const previousValues = new Map<string, string | undefined>();
		for (const key of keys) {
			previousValues.set(key, this.getValue(key));
		}

		this.localState = state ? new Map(Object.entries(state)) : undefined;
		this.saveLocalState();

		for (const key of keys) {
			if (this.getValue(key) !== previousValues.get(key)) {
				this._onDidChangeValue.fire(key);
			}
		}
	}

	private getValue(key: string): string | undefined {
		if (this.localState?.has(key)) {
			return this.localState.get(key) ?? undefined;
		}
		return this.storageService.get(key, StorageScope.PROFILE);
	}

	private getKeys(state?: IStringDictionary<string | null>): Set<string> {
		return new Set([...this.keys, ...(this.localState?.keys() ?? []), ...Object.keys(state ?? {})]);
	}

	private loadLocalState(): Map<string, string | null> | undefined {
		const value = this.storageService.get(SharedLayoutStateService.LOCAL_STATE_STORAGE_KEY, StorageScope.WORKSPACE);
		if (!value) {
			return undefined;
		}

		try {
			const state: unknown = JSON.parse(value);
			if (isObject(state)) {
				return new Map(Object.entries(state).filter((entry): entry is [string, string | null] => typeof entry[1] === 'string' || entry[1] === null));
			}
		} catch (error) {
			this.logService.error('[shared layout state] Failed to parse the local layout state.', error);
		}
		return undefined;
	}

	private saveLocalState(): void {
		if (this.localState) {
			this.storageService.store(SharedLayoutStateService.LOCAL_STATE_STORAGE_KEY, JSON.stringify(Object.fromEntries(this.localState)), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(SharedLayoutStateService.LOCAL_STATE_STORAGE_KEY, StorageScope.WORKSPACE);
		}
	}
}

registerSingleton(ISharedLayoutStateService, SharedLayoutStateService, InstantiationType.Delayed);
