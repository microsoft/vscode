/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IAgentHostManagedSettingsPermissions } from '../common/agentHostManagedSettings.js';

export const IAgentHostManagedSettingsService = createDecorator<IAgentHostManagedSettingsService>('agentHostManagedSettingsService');

export interface IAgentHostManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly permissions: IAgentHostManagedSettingsPermissions;
	readonly remoteAgentHostsEnabled: boolean | undefined;
	setClientPermissions(clientId: string, permissions: IAgentHostManagedSettingsPermissions): void;
	removeClientPermissions(clientId: string): void;
	setClientRemoteAgentHostsEnabled(clientId: string, enabled: boolean): void;
	removeClientRemoteAgentHostsEnabled(clientId: string): void;
}

export class AgentHostManagedSettingsService extends Disposable implements IAgentHostManagedSettingsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _permissionsByClient = new Map<string, IAgentHostManagedSettingsPermissions>();
	private readonly _remoteAgentHostsEnabledByClient = new Map<string, boolean>();
	private _permissions: IAgentHostManagedSettingsPermissions = {};

	get permissions(): IAgentHostManagedSettingsPermissions {
		return this._permissions;
	}

	get remoteAgentHostsEnabled(): boolean | undefined {
		if (this._remoteAgentHostsEnabledByClient.size === 0) {
			return undefined;
		}
		return [...this._remoteAgentHostsEnabledByClient.values()].every(enabled => enabled);
	}

	setClientPermissions(clientId: string, permissions: IAgentHostManagedSettingsPermissions): void {
		if (Object.keys(permissions).length === 0) {
			this._permissionsByClient.delete(clientId);
		} else {
			this._permissionsByClient.set(clientId, permissions);
		}
		this._updatePermissions();
	}

	removeClientPermissions(clientId: string): void {
		if (this._permissionsByClient.delete(clientId)) {
			this._updatePermissions();
		}
	}

	setClientRemoteAgentHostsEnabled(clientId: string, enabled: boolean): void {
		if (this._remoteAgentHostsEnabledByClient.get(clientId) === enabled) {
			return;
		}
		const previous = this.remoteAgentHostsEnabled;
		this._remoteAgentHostsEnabledByClient.set(clientId, enabled);
		if (previous !== this.remoteAgentHostsEnabled) {
			this._onDidChange.fire();
		}
	}

	removeClientRemoteAgentHostsEnabled(clientId: string): void {
		const previous = this.remoteAgentHostsEnabled;
		if (this._remoteAgentHostsEnabledByClient.delete(clientId) && previous !== this.remoteAgentHostsEnabled) {
			this._onDidChange.fire();
		}
	}

	private _updatePermissions(): void {
		const permissions: IAgentHostManagedSettingsPermissions = {};
		const deny = new Set<string>();
		const ask = new Set<string>();
		for (const contribution of this._permissionsByClient.values()) {
			if (contribution.disableBypassPermissionsMode === 'disable') {
				permissions.disableBypassPermissionsMode = 'disable';
			}
			if (contribution.deny) {
				contribution.deny.forEach(rule => deny.add(rule));
			}
			if (contribution.ask) {
				contribution.ask.forEach(rule => ask.add(rule));
			}
		}
		if (deny.size > 0) {
			permissions.deny = [...deny];
		}
		if (ask.size > 0) {
			permissions.ask = [...ask];
		}
		if (!equals(this._permissions, permissions)) {
			this._permissions = permissions;
			this._onDidChange.fire();
		}
	}

}
