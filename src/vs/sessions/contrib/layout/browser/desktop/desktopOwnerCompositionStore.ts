/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../../../base/common/map.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { StorageScope, StorageTarget, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISidePaneState } from '../../../../browser/workbench.js';

const DESKTOP_OWNER_COMPOSITION_STATE_KEY = 'sessions.chatLayout.sidePaneComposition';
const DESKTOP_OWNER_PRE_HIDE_COMPOSITION_STATE_KEY = 'sessions.chatLayout.sidePanePreHideComposition';

export class DesktopOwnerCompositionStore {

	private readonly _byOwner = new ResourceMap<ISidePaneState>();
	private readonly _preHideByOwner = new ResourceMap<ISidePaneState>();

	constructor(@IStorageService private readonly _storageService: IStorageService) {
		this._load(DESKTOP_OWNER_COMPOSITION_STATE_KEY, this._byOwner);
		this._load(DESKTOP_OWNER_PRE_HIDE_COMPOSITION_STATE_KEY, this._preHideByOwner);
	}

	get(ownerKey: URI): ISidePaneState | undefined {
		return this._byOwner.get(ownerKey);
	}

	set(ownerKey: URI, state: ISidePaneState): void {
		this._byOwner.set(ownerKey, state);
		this._save(DESKTOP_OWNER_COMPOSITION_STATE_KEY, this._byOwner);
	}

	getPreHide(ownerKey: URI): ISidePaneState | undefined {
		return this._preHideByOwner.get(ownerKey);
	}

	setPreHide(ownerKey: URI, state: ISidePaneState): void {
		this._preHideByOwner.set(ownerKey, state);
		this._save(DESKTOP_OWNER_PRE_HIDE_COMPOSITION_STATE_KEY, this._preHideByOwner);
	}

	forget(keys: readonly URI[]): void {
		let changed = false;
		for (const key of keys) {
			changed = this._byOwner.delete(key) || changed;
		}
		if (changed) {
			this._save(DESKTOP_OWNER_COMPOSITION_STATE_KEY, this._byOwner);
		}

		let preHideChanged = false;
		for (const key of keys) {
			preHideChanged = this._preHideByOwner.delete(key) || preHideChanged;
		}
		if (preHideChanged) {
			this._save(DESKTOP_OWNER_PRE_HIDE_COMPOSITION_STATE_KEY, this._preHideByOwner);
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
			this._save(DESKTOP_OWNER_COMPOSITION_STATE_KEY, this._byOwner);
		}

		const preHideState = this._preHideByOwner.get(oldKey);
		if (preHideState) {
			this._preHideByOwner.set(newKey, preHideState);
			this._preHideByOwner.delete(oldKey);
			this._save(DESKTOP_OWNER_PRE_HIDE_COMPOSITION_STATE_KEY, this._preHideByOwner);
		}
	}

	private _load(storageKey: string, target: ResourceMap<ISidePaneState>): void {
		const raw = this._storageService.get(storageKey, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		try {
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) {
				throw new Error('Expected an array of [owner, composition] entries');
			}
			for (const entry of parsed) {
				const [ownerKeyRaw, state] = entry as [string, { editor?: unknown; auxiliaryBar?: unknown }];
				if (typeof ownerKeyRaw === 'string' && typeof state?.editor === 'boolean' && typeof state?.auxiliaryBar === 'boolean') {
					target.set(URI.parse(ownerKeyRaw), { editor: state.editor, auxiliaryBar: state.auxiliaryBar });
				}
			}
		} catch {
			this._storageService.remove(storageKey, StorageScope.WORKSPACE);
		}
	}

	private _save(storageKey: string, source: ResourceMap<ISidePaneState>): void {
		const entries: [string, ISidePaneState][] = [];
		for (const [ownerKey, state] of source) {
			entries.push([ownerKey.toString(), state]);
		}
		this._storageService.store(storageKey, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}
