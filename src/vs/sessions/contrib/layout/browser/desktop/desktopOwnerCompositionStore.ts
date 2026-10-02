/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../../../base/common/map.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { StorageScope, StorageTarget, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISidePaneState } from '../../../../browser/workbench.js';

const DESKTOP_OWNER_COMPOSITION_STATE_KEY = 'sessions.chatLayout.sidePaneComposition';
const DESKTOP_OWNER_PRE_HIDE_COMPOSITION_STATE_KEY = 'sessions.chatLayout.sidePanePreHideComposition';
const DESKTOP_OWNER_COMPOSITION_SCHEMA_VERSION = 1;

interface IDesktopOwnerCompositionSchema {
	version: number;
	entries: [string, ISidePaneState][];
}

function isValidDesktopOwnerCompositionEntry(value: unknown): value is [string, ISidePaneState] {
	if (!Array.isArray(value) || value.length !== 2) {
		return false;
	}
	const [ownerKeyRaw, state] = value as [unknown, unknown];
	if (typeof ownerKeyRaw !== 'string') {
		return false;
	}
	if (typeof state !== 'object' || state === null) {
		return false;
	}
	const sidePaneState = state as Partial<ISidePaneState>;
	return typeof sidePaneState.editor === 'boolean' && typeof sidePaneState.auxiliaryBar === 'boolean';
}

export class DesktopOwnerCompositionStore {

	private readonly _byOwner = new ResourceMap<ISidePaneState>();
	private readonly _preHideByOwner = new ResourceMap<ISidePaneState>();

	constructor(
		shared: boolean,
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._compositionStorageKey = shared ? 'sessions.sharedChatLayout.sidePaneComposition' : DESKTOP_OWNER_COMPOSITION_STATE_KEY;
		this._preHideStorageKey = shared ? 'sessions.sharedChatLayout.sidePanePreHideComposition' : DESKTOP_OWNER_PRE_HIDE_COMPOSITION_STATE_KEY;
		this._load(this._compositionStorageKey, this._byOwner);
		this._load(this._preHideStorageKey, this._preHideByOwner);
	}

	private readonly _compositionStorageKey: string;
	private readonly _preHideStorageKey: string;

	get(ownerKey: URI): ISidePaneState | undefined {
		return this._byOwner.get(ownerKey);
	}

	set(ownerKey: URI, state: ISidePaneState): void {
		this._byOwner.set(ownerKey, state);
		this._save(this._compositionStorageKey, this._byOwner);
	}

	getPreHide(ownerKey: URI): ISidePaneState | undefined {
		return this._preHideByOwner.get(ownerKey);
	}

	setPreHide(ownerKey: URI, state: ISidePaneState): void {
		this._preHideByOwner.set(ownerKey, state);
		this._save(this._preHideStorageKey, this._preHideByOwner);
	}

	forget(keys: readonly URI[]): void {
		let changed = false;
		for (const key of keys) {
			changed = this._byOwner.delete(key) || changed;
		}
		if (changed) {
			this._save(this._compositionStorageKey, this._byOwner);
		}

		let preHideChanged = false;
		for (const key of keys) {
			preHideChanged = this._preHideByOwner.delete(key) || preHideChanged;
		}
		if (preHideChanged) {
			this._save(this._preHideStorageKey, this._preHideByOwner);
		}
	}

	remap(oldKey: URI, newKey: URI): void {
		if (isEqual(oldKey, newKey)) {
			return;
		}
		const state = this._byOwner.get(oldKey);
		if (state) {
			this._byOwner.set(newKey, state);
			this._byOwner.delete(oldKey);
			this._save(this._compositionStorageKey, this._byOwner);
		}

		const preHideState = this._preHideByOwner.get(oldKey);
		if (preHideState) {
			this._preHideByOwner.set(newKey, preHideState);
			this._preHideByOwner.delete(oldKey);
			this._save(this._preHideStorageKey, this._preHideByOwner);
		}
	}

	private _load(storageKey: string, target: ResourceMap<ISidePaneState>): void {
		const raw = this._storageService.get(storageKey, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		try {
			const parsed = JSON.parse(raw) as Partial<IDesktopOwnerCompositionSchema>;
			if (parsed.version !== DESKTOP_OWNER_COMPOSITION_SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
				throw new Error(`Unsupported ${storageKey} schema: expected version ${DESKTOP_OWNER_COMPOSITION_SCHEMA_VERSION}, got version ${String(parsed.version)}`);
			}
			const staged = new ResourceMap<ISidePaneState>();
			parsed.entries.forEach((entry, index) => {
				if (!isValidDesktopOwnerCompositionEntry(entry)) {
					throw new Error(`Malformed ${storageKey} entry at index ${index}`);
				}
				const [ownerKeyRaw, state] = entry;
				staged.set(URI.parse(ownerKeyRaw), { editor: state.editor, auxiliaryBar: state.auxiliaryBar });
			});
			staged.forEach((state, ownerKey) => target.set(ownerKey, state));
		} catch (error) {
			this._logService.error(error);
			this._storageService.remove(storageKey, StorageScope.WORKSPACE);
		}
	}

	private _save(storageKey: string, source: ResourceMap<ISidePaneState>): void {
		const entries: [string, ISidePaneState][] = [];
		for (const [ownerKey, state] of source) {
			entries.push([ownerKey.toString(), state]);
		}
		const schema: IDesktopOwnerCompositionSchema = { version: DESKTOP_OWNER_COMPOSITION_SCHEMA_VERSION, entries };
		this._storageService.store(storageKey, JSON.stringify(schema), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}
