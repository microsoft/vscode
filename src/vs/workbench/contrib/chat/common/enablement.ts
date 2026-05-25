/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IReader, ITransaction } from '../../../../base/common/observable.js';
import { ObservableMemento, observableMemento } from '../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

export const enum ContributionEnablementState {
	DisabledProfile,
	DisabledWorkspace,
	EnabledProfile,
	EnabledWorkspace,
}

export function isContributionEnabled(state: ContributionEnablementState): boolean {
	return state === ContributionEnablementState.EnabledProfile || state === ContributionEnablementState.EnabledWorkspace;
}

export function isContributionDisabled(state: ContributionEnablementState): boolean {
	return !isContributionEnabled(state);
}

export interface IEnablementModel {
	readEnabled(key: string, reader?: IReader): ContributionEnablementState;
	setEnabled(key: string, state: ContributionEnablementState, tx?: ITransaction): void;
	remove(key: string): void;
}

type EnablementMap = ReadonlyMap<string, boolean>;

function mapToStorage(value: EnablementMap): string {
	return JSON.stringify([...value]);
}

function mapFromStorage(value: string): EnablementMap {
	const parsed = JSON.parse(value);
	return new Map(Array.isArray(parsed) ? parsed : []);
}

/**
 * A reusable enablement model for string-keyed contributions. Uses
 * `observableMemento` to persist enable/disable state in both profile-scoped
 * and workspace-scoped storage.
 *
 * Resolution order: if a workspace-scoped entry exists for a key, it wins.
 * Otherwise, the profile-scoped entry is used. The default (absence of any
 * entry) is {@link ContributionEnablementState.EnabledProfile}.
 */
export class EnablementModel extends Disposable implements IEnablementModel {
	private readonly _profileState: ObservableMemento<EnablementMap>;
	private readonly _workspaceState: ObservableMemento<EnablementMap>;

	constructor(
		storageKey: string,
		@IStorageService storageService: IStorageService,
	) {
		super();

		const mapMemento = observableMemento<EnablementMap>({
			key: storageKey,
			defaultValue: new Map(),
			toStorage: mapToStorage,
			fromStorage: mapFromStorage,
		});

		this._profileState = this._register(
			mapMemento(StorageScope.PROFILE, StorageTarget.MACHINE, storageService)
		);

		this._workspaceState = this._register(
			mapMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE, storageService)
		);
	}

	readEnabled(key: string, reader?: IReader): ContributionEnablementState {
		const wsMap = this._workspaceState.read(reader);
		if (wsMap.has(key)) {
			return wsMap.get(key)!
				? ContributionEnablementState.EnabledWorkspace
				: ContributionEnablementState.DisabledWorkspace;
		}

		const profileMap = this._profileState.read(reader);
		if (profileMap.has(key)) {
			return profileMap.get(key)!
				? ContributionEnablementState.EnabledProfile
				: ContributionEnablementState.DisabledProfile;
		}

		return ContributionEnablementState.EnabledProfile;
	}

	setEnabled(key: string, state: ContributionEnablementState, tx?: ITransaction): void {
		switch (state) {
			case ContributionEnablementState.EnabledProfile: {
				// Enabled-profile is the default: remove key from profile state,
				// and also remove any workspace override.
				this._deleteFromMap(this._profileState, key, tx);
				this._deleteFromMap(this._workspaceState, key, tx);
				break;
			}
			case ContributionEnablementState.DisabledProfile: {
				// Store disabled in profile, remove workspace override.
				this._setInMap(this._profileState, key, false, tx);
				this._deleteFromMap(this._workspaceState, key, tx);
				break;
			}
			case ContributionEnablementState.EnabledWorkspace: {
				// Workspace override: always store explicitly.
				this._setInMap(this._workspaceState, key, true, tx);
				break;
			}
			case ContributionEnablementState.DisabledWorkspace: {
				// Workspace override: always store explicitly.
				this._setInMap(this._workspaceState, key, false, tx);
				break;
			}
		}
	}

	remove(key: string): void {
		this._deleteFromMap(this._profileState, key);
		this._deleteFromMap(this._workspaceState, key);
	}

	private _setInMap(memento: ObservableMemento<EnablementMap>, key: string, value: boolean, tx?: ITransaction): void {
		const current = memento.get();
		if (current.get(key) === value) {
			return;
		}
		const next = new Map(current);
		next.set(key, value);
		memento.set(next, tx);
	}

	private _deleteFromMap(memento: ObservableMemento<EnablementMap>, key: string, tx?: ITransaction): void {
		const current = memento.get();
		if (!current.has(key)) {
			return;
		}
		const next = new Map(current);
		next.delete(key);
		memento.set(next, tx);
	}
}
