/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { AgentHostRemoteConnectionsBackend, AgentHostRemoteConnectionsSettingId } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IRemoteConnectionsService } from '../../common/remoteConnections.js';

const backendStorageKey = 'agentHost.remoteConnections.backend';

function normalizeBackend(value: string | undefined): AgentHostRemoteConnectionsBackend {
	return value === 'githubEnvironment' || value === 'missionControl' ? 'githubEnvironment' : 'devTunnel';
}

export class RemoteConnectionsService extends Disposable implements IRemoteConnectionsService {
	declare readonly _serviceBrand: undefined;
	readonly backend: IObservable<AgentHostRemoteConnectionsBackend>;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		if (this._storageService.get(backendStorageKey, StorageScope.APPLICATION) === undefined) {
			const legacyBackend = configurationService.inspect<string>(AgentHostRemoteConnectionsSettingId)?.userLocalValue;
			this._storageService.store(backendStorageKey, normalizeBackend(legacyBackend), StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		this.backend = observableFromEvent(this,
			this._storageService.onDidChangeValue(StorageScope.APPLICATION, backendStorageKey, this._store),
			() => normalizeBackend(this._storageService.get(backendStorageKey, StorageScope.APPLICATION)),
		);
	}

	setBackend(backend: AgentHostRemoteConnectionsBackend): void {
		const normalized = normalizeBackend(backend);
		if (this.backend.get() !== normalized) {
			this._storageService.store(backendStorageKey, normalized, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
	}
}
