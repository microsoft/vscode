/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import type { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatConfiguration } from '../common/constants.js';
import { getAgentPluginPolicyId } from '../common/plugins/agentPluginEnablement.js';
import { IAgentPluginService } from '../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IMarketplacePlugin, IPluginMarketplaceService } from '../common/plugins/pluginMarketplaceService.js';

export class ManagedAgentPluginActivation extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.managedAgentPluginActivation';

	private readonly _cancellation = this._register(new CancellationTokenSource());
	private _reconcileRequested = false;
	private _reconcileRunning = false;

	constructor(
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IPluginInstallService private readonly _pluginInstallService: IPluginInstallService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(Event.any(
			Event.fromObservableLight(this._pluginMarketplaceService.installedPlugins),
			this._pluginMarketplaceService.onDidChangeMarketplaces,
			this._chatEntitlementService.onDidChangeSentiment,
			Event.filter(this._configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(ChatConfiguration.EnabledPlugins)),
		)(() => this._requestReconcile()));
		this._requestReconcile();
	}

	override dispose(): void {
		this._cancellation.cancel();
		super.dispose();
	}

	private _requestReconcile(): void {
		this._reconcileRequested = true;
		if (!this._reconcileRunning) {
			void this._reconcile();
		}
	}

	private async _reconcile(): Promise<void> {
		this._reconcileRunning = true;
		try {
			while (this._reconcileRequested && !this._store.isDisposed && !this._cancellation.token.isCancellationRequested) {
				this._reconcileRequested = false;
				await this._installRequiredPlugins();
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				this._logService.error('[ManagedAgentPluginActivation] Failed to reconcile required plugins', error);
			}
		} finally {
			this._reconcileRunning = false;
			if (this._reconcileRequested && !this._store.isDisposed && !this._cancellation.token.isCancellationRequested) {
				void this._reconcile();
			}
		}
	}

	private async _installRequiredPlugins(): Promise<void> {
		const requiredPluginIds = this._requiredPluginIds();
		if (requiredPluginIds.size === 0 || this._chatEntitlementService.sentiment.hidden) {
			return;
		}

		const marketplacePlugins = await this._pluginMarketplaceService.fetchMarketplacePlugins(
			this._cancellation.token,
			undefined,
			{
				onMarketplaceError: (marketplace, error) => {
					this._logService.warn(`[ManagedAgentPluginActivation] Could not read marketplace '${marketplace.displayLabel}': ${getErrorMessage(error)}`);
				},
			},
		);
		const pluginsById = new Map<string, IMarketplacePlugin>();
		for (const plugin of marketplacePlugins) {
			const pluginId = `${plugin.name}@${plugin.marketplace}`;
			if (!pluginsById.has(pluginId)) {
				pluginsById.set(pluginId, plugin);
			}
		}

		const discoveredPluginIds = new Set(this._agentPluginService.plugins.get().map(plugin => getAgentPluginPolicyId(plugin)).filter(pluginId => pluginId !== undefined));
		for (const pluginId of requiredPluginIds) {
			if (this._cancellation.token.isCancellationRequested || this._chatEntitlementService.sentiment.hidden) {
				return;
			}
			if (!this._requiredPluginIds().has(pluginId) || discoveredPluginIds.has(pluginId)) {
				continue;
			}

			const plugin = pluginsById.get(pluginId);
			if (!plugin) {
				this._logService.warn(`[ManagedAgentPluginActivation] Required plugin '${pluginId}' was not found in the configured marketplaces`);
				continue;
			}

			const installUri = this._pluginInstallService.getPluginInstallUri(plugin);
			if (this._isPluginInstalled(installUri)) {
				continue;
			}

			try {
				await this._pluginInstallService.installPlugin(plugin, this._cancellation.token);
			} catch (error) {
				if (!isCancellationError(error)) {
					this._logService.error(`[ManagedAgentPluginActivation] Failed to install required plugin '${pluginId}'`, error);
				}
				continue;
			}

			if (!this._isPluginInstalled(installUri)) {
				this._logService.warn(`[ManagedAgentPluginActivation] Required plugin '${pluginId}' was not installed`);
				continue;
			}

			this._agentPluginService.setInstalledPluginProfileBaseline(installUri.toString(), false);
		}
	}

	private _requiredPluginIds(): ReadonlySet<string> {
		const required = new Set<string>();
		const managed = this._configurationService.inspect<Record<string, boolean>>(ChatConfiguration.EnabledPlugins).policyValue;
		for (const [pluginId, enabled] of Object.entries(managed ?? {})) {
			if (enabled) {
				required.add(pluginId);
			}
		}
		return required;
	}

	private _isPluginInstalled(pluginUri: URI): boolean {
		return this._pluginMarketplaceService.installedPlugins.get().some(entry => isEqual(entry.pluginUri, pluginUri));
	}
}
