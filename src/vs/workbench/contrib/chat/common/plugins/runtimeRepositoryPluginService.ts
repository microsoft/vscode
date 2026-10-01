/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { IObservable, observableValue, transaction, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import type { IAgentHostEnsureRequiredPluginsResult } from '../../../../../platform/agentHost/common/requiredPlugins.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';

export interface IRuntimeRepositoryPluginSnapshot {
	readonly workingDirectory: URI;
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
	removeSnapshots(workingDirectories: readonly URI[]): void;
	retainWorkingDirectories(workingDirectories: readonly URI[]): void;
	getEnablement(pluginIdentity: IRuntimeRepositoryPluginIdentity | undefined, isRuntimeSource: boolean, workingDirectory: URI | undefined): boolean | undefined;
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
		const key = this._key(workingDirectory);
		if (equals(this._snapshots.get().get(key)?.result, result)) {
			return;
		}
		const snapshots = new Map(this._snapshots.get());
		snapshots.set(key, { workingDirectory, result });
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

	retainWorkingDirectories(workingDirectories: readonly URI[]): void {
		const retained = new Set(workingDirectories.map(uri => this._key(uri)));
		const snapshots = new Map([...this._snapshots.get()].filter(([key]) => retained.has(key)));
		if (snapshots.size !== this._snapshots.get().size) {
			this._setSnapshots(snapshots);
		}
	}

	getEnablement(pluginIdentity: IRuntimeRepositoryPluginIdentity | undefined, isRuntimeSource: boolean, workingDirectory: URI | undefined): boolean | undefined {
		if (!pluginIdentity || !workingDirectory) {
			return undefined;
		}
		const snapshot = this._snapshots.get().get(this._key(workingDirectory));
		const activation = snapshot?.result.plugins.find(candidate =>
			candidate.plugin.name === pluginIdentity.name
			&& candidate.plugin.marketplace === pluginIdentity.marketplace
		);
		if (activation === undefined) {
			return isRuntimeSource ? false : undefined;
		}
		return isRuntimeSource && activation.enabled;
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
