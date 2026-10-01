/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from '../../../../../base/common/map.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { StorageScope, StorageTarget, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ISidePaneState } from '../../../../browser/workbench.js';

/** [R5][R7] Storage key for the per-owner (session or chat) side-pane composition, used only when chat-specific layout is enabled. */
const DESKTOP_OWNER_COMPOSITION_STATE_KEY = 'sessions.chatLayout.sidePaneComposition';

/**
 * [R5] Remembers each chat-layout owner's own last-open side-pane composition
 * (Editor/Details), independent of the legacy, session-type-wide
 * {@link import('./desktopVisibilityProfileStore.js').DesktopVisibilityProfileStore}.
 * Only consulted when chat-specific layout is enabled; the legacy store remains
 * the sole source of truth when it is not.
 */
export class DesktopOwnerCompositionStore {

	private readonly _byOwner = new ResourceMap<ISidePaneState>();

	constructor(@IStorageService private readonly _storageService: IStorageService) {
		this._load();
	}

	get(ownerKey: URI): ISidePaneState | undefined {
		return this._byOwner.get(ownerKey);
	}

	set(ownerKey: URI, state: ISidePaneState): void {
		this._byOwner.set(ownerKey, state);
		this._save();
	}

	/** [R8] Drops the remembered composition for owners that no longer exist. */
	forget(keys: readonly URI[]): void {
		let changed = false;
		for (const key of keys) {
			changed = this._byOwner.delete(key) || changed;
		}
		if (changed) {
			this._save();
		}
	}

	/** [R8] Carries a remembered composition across a draft→committed promotion. */
	remap(oldKey: URI, newKey: URI): void {
		if (isEqual(oldKey, newKey)) {
			return;
		}
		const state = this._byOwner.get(oldKey);
		if (!state) {
			return;
		}
		this._byOwner.set(newKey, state);
		this._byOwner.delete(oldKey);
		this._save();
	}

	private _load(): void {
		const raw = this._storageService.get(DESKTOP_OWNER_COMPOSITION_STATE_KEY, StorageScope.WORKSPACE);
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
					this._byOwner.set(URI.parse(ownerKeyRaw), { editor: state.editor, auxiliaryBar: state.auxiliaryBar });
				}
			}
		} catch {
			this._storageService.remove(DESKTOP_OWNER_COMPOSITION_STATE_KEY, StorageScope.WORKSPACE);
		}
	}

	private _save(): void {
		const entries: [string, ISidePaneState][] = [];
		for (const [ownerKey, state] of this._byOwner) {
			entries.push([ownerKey.toString(), state]);
		}
		this._storageService.store(DESKTOP_OWNER_COMPOSITION_STATE_KEY, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}
}
