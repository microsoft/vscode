/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { equals } from '../../../base/common/objects.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IAgentHostManagedPluginEnablement, IAgentHostManagedSettingsContribution, IAgentHostManagedSettingsPermissions } from '../common/agentHostManagedSettings.js';

export const IAgentHostManagedSettingsService = createDecorator<IAgentHostManagedSettingsService>('agentHostManagedSettingsService');

export interface IAgentHostManagedSettingsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly permissions: IAgentHostManagedSettingsPermissions;
	readonly enabledPlugins: IAgentHostManagedPluginEnablement;
	setClientContribution(clientId: string, contribution: IAgentHostManagedSettingsContribution): void;
	removeClientContribution(clientId: string): void;
}

export class AgentHostManagedSettingsService extends Disposable implements IAgentHostManagedSettingsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _contributionsByClient = new Map<string, IAgentHostManagedSettingsContribution>();
	private _permissions: IAgentHostManagedSettingsPermissions = {};
	private _enabledPlugins: IAgentHostManagedPluginEnablement = {};

	get permissions(): IAgentHostManagedSettingsPermissions {
		return this._permissions;
	}

	get enabledPlugins(): IAgentHostManagedPluginEnablement {
		return this._enabledPlugins;
	}

	setClientContribution(clientId: string, contribution: IAgentHostManagedSettingsContribution): void {
		if (Object.keys(contribution.permissions).length === 0 && Object.keys(contribution.enabledPlugins).length === 0) {
			this._contributionsByClient.delete(clientId);
		} else {
			this._contributionsByClient.set(clientId, contribution);
		}
		this._update();
	}

	removeClientContribution(clientId: string): void {
		if (this._contributionsByClient.delete(clientId)) {
			this._update();
		}
	}

	private _update(): void {
		const permissions: IAgentHostManagedSettingsPermissions = {};
		const deny = new Set<string>();
		const ask = new Set<string>();
		const pluginValues = new Map<string, boolean>();
		for (const contribution of this._contributionsByClient.values()) {
			if (contribution.permissions.disableBypassPermissionsMode === 'disable') {
				permissions.disableBypassPermissionsMode = 'disable';
			}
			if (contribution.permissions.deny) {
				contribution.permissions.deny.forEach(rule => deny.add(rule));
			}
			if (contribution.permissions.ask) {
				contribution.permissions.ask.forEach(rule => ask.add(rule));
			}
			for (const [pluginId, enabled] of Object.entries(contribution.enabledPlugins)) {
				const previous = pluginValues.get(pluginId);
				pluginValues.set(pluginId, previous === false ? false : enabled);
			}
		}
		if (deny.size > 0) {
			permissions.deny = [...deny];
		}
		if (ask.size > 0) {
			permissions.ask = [...ask];
		}
		const enabledPlugins = Object.fromEntries(pluginValues);
		if (!equals(this._permissions, permissions) || !equals(this._enabledPlugins, enabledPlugins)) {
			this._permissions = permissions;
			this._enabledPlugins = enabledPlugins;
			this._onDidChange.fire();
		}
	}
}
