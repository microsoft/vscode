/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader, ITransaction, observableValue, transaction } from '../../../../base/common/observable.js';
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
	readProfileEnabled(key: string, reader?: IReader): boolean;
	setEnabled(key: string, state: ContributionEnablementState, tx?: ITransaction): void;
	setDefaultEnabled?(key: string, enabled: boolean, tx?: ITransaction): void;
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
	private readonly _defaultState = observableValue<EnablementMap>(this, new Map());

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
		return this.readEnabledWithWorkspaceKey(key, key, reader);
	}

	readProfileEnabled(key: string, reader?: IReader): boolean {
		return this._profileState.read(reader).get(key) ?? this._defaultState.read(reader).get(key) ?? true;
	}

	readEnabledWithWorkspaceKey(profileKey: string, workspaceKey: string | undefined, reader?: IReader): ContributionEnablementState {
		const wsMap = this._workspaceState.read(reader);
		if (workspaceKey !== undefined && wsMap.has(workspaceKey)) {
			return wsMap.get(workspaceKey)!
				? ContributionEnablementState.EnabledWorkspace
				: ContributionEnablementState.DisabledWorkspace;
		}

		const profileMap = this._profileState.read(reader);
		if (profileMap.has(profileKey)) {
			return profileMap.get(profileKey)!
				? ContributionEnablementState.EnabledProfile
				: ContributionEnablementState.DisabledProfile;
		}

		return (this._defaultState.read(reader).get(profileKey) ?? true)
			? ContributionEnablementState.EnabledProfile
			: ContributionEnablementState.DisabledProfile;
	}

	setEnabled(key: string, state: ContributionEnablementState, tx?: ITransaction): void {
		this.setEnabledWithWorkspaceKey(key, key, state, tx);
	}

	setEnabledWithWorkspaceKey(profileKey: string, workspaceKey: string | undefined, state: ContributionEnablementState, tx?: ITransaction): void {
		const defaultEnabled = this._defaultState.get().get(profileKey) ?? true;
		switch (state) {
			case ContributionEnablementState.EnabledProfile: {
				this._setOrDeleteFromMap(this._profileState, profileKey, true, defaultEnabled, tx);
				if (workspaceKey !== undefined) {
					this._deleteFromMap(this._workspaceState, workspaceKey, tx);
				}
				break;
			}
			case ContributionEnablementState.DisabledProfile: {
				this._setOrDeleteFromMap(this._profileState, profileKey, false, defaultEnabled, tx);
				if (workspaceKey !== undefined) {
					this._deleteFromMap(this._workspaceState, workspaceKey, tx);
				}
				break;
			}
			case ContributionEnablementState.EnabledWorkspace: {
				// Workspace override: always store explicitly.
				if (workspaceKey === undefined) {
					throw new Error('Cannot enable a contribution for a workspace without a workspace key.');
				}
				this._setInMap(this._workspaceState, workspaceKey, true, tx);
				break;
			}
			case ContributionEnablementState.DisabledWorkspace: {
				// Workspace override: always store explicitly.
				if (workspaceKey === undefined) {
					throw new Error('Cannot disable a contribution for a workspace without a workspace key.');
				}
				this._setInMap(this._workspaceState, workspaceKey, false, tx);
				break;
			}
		}

	}

	setDefaultEnabled(key: string, enabled: boolean, tx?: ITransaction): void {
		this._setOrDeleteFromMap(this._defaultState, key, enabled, true, tx);
	}

	remove(key: string): void {
		this._deleteFromMap(this._profileState, key);
		this._deleteFromMap(this._workspaceState, key);
		this._deleteFromMap(this._defaultState, key);
	}

	private _setOrDeleteFromMap(memento: { get(): EnablementMap; set(value: EnablementMap, tx?: ITransaction): void }, key: string, value: boolean, defaultValue: boolean, tx?: ITransaction): void {
		if (value === defaultValue) {
			this._deleteFromMap(memento, key, tx);
		} else {
			this._setInMap(memento, key, value, tx);
		}
	}

	private _setInMap(memento: { get(): EnablementMap; set(value: EnablementMap, tx?: ITransaction): void }, key: string, value: boolean, tx?: ITransaction): void {
		const current = memento.get();
		if (current.get(key) === value) {
			return;
		}
		const next = new Map(current);
		next.set(key, value);
		memento.set(next, tx);
	}

	private _deleteFromMap(memento: { get(): EnablementMap; set(value: EnablementMap, tx?: ITransaction): void }, key: string, tx?: ITransaction): void {
		const current = memento.get();
		if (!current.has(key)) {
			return;
		}
		const next = new Map(current);
		next.delete(key);
		memento.set(next, tx);
	}
}

export class CollisionEnablementModel implements IEnablementModel {

	constructor(
		private readonly _base: IEnablementModel,
		private readonly _collisionGroups: IObservable<ReadonlyMap<string, readonly string[]>>,
	) { }

	readEnabled(key: string, reader?: IReader): ContributionEnablementState {
		const baseState = this._base.readEnabled(key, reader);

		if (!isContributionEnabled(baseState)) {
			return baseState;
		}

		const group = this._collisionGroups.read(reader).get(key);
		if (!group) {
			return baseState;
		}

		for (const otherId of group) {
			if (otherId === key) {
				return baseState;
			}
			if (isContributionEnabled(this._base.readEnabled(otherId, reader))) {
				return ContributionEnablementState.DisabledProfile;
			}
		}
		return baseState;
	}

	readProfileEnabled(key: string, reader?: IReader): boolean {
		return this._base.readProfileEnabled(key, reader);
	}

	setEnabled(key: string, state: ContributionEnablementState, tx?: ITransaction): void {
		const isEnabling = state === ContributionEnablementState.EnabledProfile || state === ContributionEnablementState.EnabledWorkspace;
		const group = isEnabling ? this._collisionGroups.get().get(key) : undefined;

		if (!group) {
			this._base.setEnabled(key, state, tx);
			return;
		}

		const updateGroup = (innerTx: ITransaction) => {
			this._base.setEnabled(key, state, innerTx);
			for (const otherId of group) {
				if (otherId !== key) {
					this._base.setEnabled(otherId, ContributionEnablementState.DisabledWorkspace, innerTx);
				}
			}
		};

		if (tx) {
			updateGroup(tx);
		} else {
			transaction(innerTx => updateGroup(innerTx));
		}
	}

	setDefaultEnabled(key: string, enabled: boolean, tx?: ITransaction): void {
		this._base.setDefaultEnabled?.(key, enabled, tx);
	}

	remove(key: string): void {
		this._base.remove(key);
	}
}
