/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import type { IAgentHostEnsureRequiredPluginsResult } from '../../../../../platform/agentHost/common/requiredPlugins.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';

export interface IRuntimeRepositoryPluginSnapshot {
	readonly workingDirectory?: URI;
	readonly result: IAgentHostEnsureRequiredPluginsResult;
}

export interface IRuntimeRepositoryPluginIdentity {
	readonly name: string;
	readonly marketplace: string;
}

export const IRuntimeRepositoryPluginService = createDecorator<IRuntimeRepositoryPluginService>('runtimeRepositoryPluginService');

export interface IRuntimeRepositoryPluginService {
	readonly _serviceBrand: undefined;
	readonly snapshots: IObservable<readonly IRuntimeRepositoryPluginSnapshot[]>;
	readonly snapshotRevision: IObservable<number>;
	setSnapshot(workingDirectory: URI, result: IAgentHostEnsureRequiredPluginsResult): void;
	setManagedSnapshot(result: IAgentHostEnsureRequiredPluginsResult): void;
	removeSnapshots(workingDirectories: readonly URI[]): void;
	removeManagedSnapshot(): void;
	retainWorkingDirectories(workingDirectories: readonly URI[]): void;
	getEnablement(pluginIdentity: IRuntimeRepositoryPluginIdentity | undefined, isRuntimeSource: boolean, workingDirectory: URI | undefined): boolean | undefined;
	getManagedEnablement(pluginIdentity: IRuntimeRepositoryPluginIdentity | undefined): boolean | undefined;
	markDiscoverySettled(revision: number): void;
	whenDiscoverySettled(): Promise<void>;
}

export class RuntimeRepositoryPluginService extends Disposable implements IRuntimeRepositoryPluginService {
	declare readonly _serviceBrand: undefined;

	private readonly _snapshots = observableValue<ReadonlyMap<string, IRuntimeRepositoryPluginSnapshot>>(this, new Map());
	private readonly _snapshotRevision = observableValue(this, 0);
	private readonly _discoveryRevision = observableValue(this, 0);
	readonly snapshots = this._snapshots.map(snapshots => [...snapshots.values()]);
	readonly snapshotRevision = this._snapshotRevision;

	constructor(
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
	) {
		super();
	}

	setSnapshot(workingDirectory: URI, result: IAgentHostEnsureRequiredPluginsResult): void {
		this._setSnapshot(this._key(workingDirectory), { workingDirectory, result });
	}

	setManagedSnapshot(result: IAgentHostEnsureRequiredPluginsResult): void {
		this._setSnapshot('', { result });
	}

	private _setSnapshot(key: string, snapshot: IRuntimeRepositoryPluginSnapshot): void {
		if (this._snapshots.get().get(key)?.result.fingerprint === snapshot.result.fingerprint) {
			return;
		}
		const snapshots = new Map(this._snapshots.get());
		snapshots.set(key, snapshot);
		this._setSnapshots(snapshots);
	}

	removeSnapshots(workingDirectories: readonly URI[]): void {
		const snapshots = new Map(this._snapshots.get());
		let changed = false;
		for (const workingDirectory of workingDirectories) {
			changed = snapshots.delete(this._key(workingDirectory)) || changed;
		}
		if (changed) {
			this._setSnapshots(snapshots);
		}
	}

	removeManagedSnapshot(): void {
		if (!this._snapshots.get().has('')) {
			return;
		}
		const snapshots = new Map(this._snapshots.get());
		snapshots.delete('');
		this._setSnapshots(snapshots);
	}

	retainWorkingDirectories(workingDirectories: readonly URI[]): void {
		const retained = new Set(workingDirectories.map(uri => this._key(uri)));
		const snapshots = new Map([...this._snapshots.get()].filter(([key]) => key === '' || retained.has(key)));
		if (snapshots.size !== this._snapshots.get().size) {
			this._setSnapshots(snapshots);
		}
	}

	getEnablement(pluginIdentity: IRuntimeRepositoryPluginIdentity | undefined, isRuntimeSource: boolean, workingDirectory: URI | undefined): boolean | undefined {
		if (!pluginIdentity) {
			return undefined;
		}
		const workspaceActivation = workingDirectory
			? this._snapshots.get().get(this._key(workingDirectory))?.result.plugins.find(candidate =>
				candidate.plugin.name === pluginIdentity.name
				&& candidate.plugin.marketplace === pluginIdentity.marketplace
			)
			: undefined;
		const activation = workspaceActivation ?? this._snapshots.get().get('')?.result.plugins.find(candidate =>
			candidate.plugin.name === pluginIdentity.name
			&& candidate.plugin.marketplace === pluginIdentity.marketplace
		);
		if (activation === undefined) {
			return isRuntimeSource ? false : undefined;
		}
		return isRuntimeSource && activation.enabled;
	}

	getManagedEnablement(pluginIdentity: IRuntimeRepositoryPluginIdentity | undefined): boolean | undefined {
		if (!pluginIdentity) {
			return undefined;
		}
		for (const snapshot of this._snapshots.get().values()) {
			const activation = snapshot.result.plugins.find(candidate =>
				candidate.managed
				&& candidate.plugin.name === pluginIdentity.name
				&& candidate.plugin.marketplace === pluginIdentity.marketplace
			);
			if (activation) {
				return activation.enabled;
			}
		}
		return undefined;
	}

	markDiscoverySettled(revision: number): void {
		if (revision > this._discoveryRevision.get()) {
			this._discoveryRevision.set(revision, undefined);
		}
	}

	async whenDiscoverySettled(): Promise<void> {
		const revision = this._snapshotRevision.get();
		await waitForState(this._discoveryRevision, settledRevision => settledRevision >= revision);
	}

	private _key(uri: URI): string {
		return this._uriIdentityService.extUri.getComparisonKey(uri);
	}

	private _setSnapshots(snapshots: ReadonlyMap<string, IRuntimeRepositoryPluginSnapshot>): void {
		transaction(tx => {
			this._snapshots.set(snapshots, tx);
			this._snapshotRevision.set(this._snapshotRevision.get() + 1, tx);
		});
	}
}
