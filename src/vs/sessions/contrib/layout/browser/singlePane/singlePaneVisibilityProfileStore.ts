/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { StorageScope, StorageTarget, IStorageService } from '../../../../../platform/storage/common/storage.js';

export interface ISidePaneVisibilityState {
	readonly editorVisible: boolean;
	readonly auxiliaryBarVisible: boolean;
}

interface ISidePaneVisibilityProfiles {
	readonly newSession: ISidePaneVisibilityState;
	readonly existingSession: ISidePaneVisibilityState;
}

export const enum SessionVisibilityProfile {
	New,
	Existing,
}

const SINGLE_PANE_VISIBILITY_STATE_KEY = 'sessions.singlePane.sidePaneVisibility';
const DEFAULT_NEW_SESSION_VISIBILITY_STATE: ISidePaneVisibilityState = {
	editorVisible: false,
	auxiliaryBarVisible: true,
};
const DEFAULT_EXISTING_SESSION_VISIBILITY_STATE: ISidePaneVisibilityState = {
	editorVisible: true,
	auxiliaryBarVisible: false,
};

/**
 * Persists the Existing Session Editor/Details visibility profile.
 */
export class SinglePaneVisibilityProfileStore {

	private _profiles: ISidePaneVisibilityProfiles = {
		newSession: DEFAULT_NEW_SESSION_VISIBILITY_STATE,
		existingSession: DEFAULT_EXISTING_SESSION_VISIBILITY_STATE,
	};

	constructor(@IStorageService private readonly _storageService: IStorageService) {
		this._load();
	}

	get(profile: SessionVisibilityProfile): ISidePaneVisibilityState {
		return profile === SessionVisibilityProfile.New
			? this._profiles.newSession
			: this._profiles.existingSession;
	}

	set(profile: SessionVisibilityProfile, state: ISidePaneVisibilityState): void {
		this._profiles = profile === SessionVisibilityProfile.New
			? { ...this._profiles, newSession: state }
			: { ...this._profiles, existingSession: state };
		this._storageService.store(SINGLE_PANE_VISIBILITY_STATE_KEY, JSON.stringify(this._profiles), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private _load(): void {
		const raw = this._storageService.get(SINGLE_PANE_VISIBILITY_STATE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		try {
			const parsed = JSON.parse(raw);
			if (this._isVisibilityState(parsed?.newSession) && this._isVisibilityState(parsed?.existingSession)) {
				this._profiles = {
					newSession: parsed.newSession,
					existingSession: parsed.existingSession,
				};
			} else if (this._isVisibilityState(parsed)) {
				this._profiles = { ...this._profiles, existingSession: parsed };
			} else {
				this._storageService.remove(SINGLE_PANE_VISIBILITY_STATE_KEY, StorageScope.WORKSPACE);
			}
		} catch {
			this._storageService.remove(SINGLE_PANE_VISIBILITY_STATE_KEY, StorageScope.WORKSPACE);
		}
	}

	private _isVisibilityState(value: { editorVisible?: unknown; auxiliaryBarVisible?: unknown } | undefined): value is ISidePaneVisibilityState {
		return typeof value?.editorVisible === 'boolean' && typeof value.auxiliaryBarVisible === 'boolean';
	}
}
