/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import type { URI } from '../../../../base/common/uri.js';
import { waitForState } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatConfiguration } from '../common/constants.js';
import { IAgentPluginActivationService } from '../common/plugins/agentPluginActivationService.js';
import { getAgentPluginPolicyId } from '../common/plugins/agentPluginEnablement.js';
import { IAgentPluginService } from '../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IMarketplacePlugin, IPluginMarketplaceService } from '../common/plugins/pluginMarketplaceService.js';

export class AgentPluginActivationService extends Disposable implements IAgentPluginActivationService {
	declare readonly _serviceBrand: undefined;

	private readonly _cancellation = this._register(new CancellationTokenSource());
	private _reconcileRequested = false;
	private _reconcilePromise: Promise<void> | undefined;

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
		)(() => void this.reconcile()));
		void this.reconcile();
	}

	reconcile(): Promise<void> {
		this._reconcileRequested = true;
		if (!this._reconcilePromise) {
			this._reconcilePromise = this._runReconcile().finally(() => {
				this._reconcilePromise = undefined;
			});
		}
		return this._reconcilePromise;
	}

	override dispose(): void {
		this._cancellation.cancel();
		super.dispose();
	}

	private async _runReconcile(): Promise<void> {
		try {
			while (this._reconcileRequested && !this._store.isDisposed && !this._cancellation.token.isCancellationRequested) {
				this._reconcileRequested = false;
				await this._installManagedPlugins();
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				this._logService.error('[AgentPluginActivationService] Failed to reconcile managed plugins', error);
			}
		}
	}

	private async _installManagedPlugins(): Promise<void> {
		const managedPluginIds = this._managedPluginIds();
		if (managedPluginIds.size === 0 || this._chatEntitlementService.sentiment.hidden) {
			return;
		}

		const marketplacePlugins = await this._pluginMarketplaceService.fetchMarketplacePlugins(
			this._cancellation.token,
			undefined,
			{
				onMarketplaceError: (marketplace, error) => {
					this._logService.warn(`[AgentPluginActivationService] Could not read marketplace '${marketplace.displayLabel}': ${getErrorMessage(error)}`);
				},
			},
		);
		const pluginsById = new Map<string, IMarketplacePlugin>();
		for (const plugin of marketplacePlugins) {
			const pluginId = `${plugin.name}@${plugin.marketplace}`;
			if (!managedPluginIds.has(pluginId) || !this._pluginMarketplaceService.isMarketplaceTrustedByPolicy(plugin.marketplaceReference)) {
				continue;
			}
			if (!pluginsById.has(pluginId)) {
				pluginsById.set(pluginId, plugin);
			}
		}

		const discoveredPluginIds = new Set(this._agentPluginService.plugins.get().map(plugin => getAgentPluginPolicyId(plugin)).filter(pluginId => pluginId !== undefined));
		const installedPluginIds: string[] = [];
		for (const pluginId of managedPluginIds) {
			if (this._cancellation.token.isCancellationRequested || this._chatEntitlementService.sentiment.hidden) {
				return;
			}
			const currentManagedIds = this._managedPluginIds();
			if (!currentManagedIds.has(pluginId) || discoveredPluginIds.has(pluginId)) {
				continue;
			}

			const plugin = pluginsById.get(pluginId);
			if (!plugin) {
				this._logService.warn(`[AgentPluginActivationService] Managed plugin '${pluginId}' was not found in a policy-trusted marketplace`);
				continue;
			}

			const installUri = this._pluginInstallService.getPluginInstallUri(plugin);
			if (this._isPluginInstalled(installUri)) {
				continue;
			}

			try {
				await this._pluginInstallService.installPlugin(plugin, this._cancellation.token, { skipTrust: true });
			} catch (error) {
				if (!isCancellationError(error)) {
					this._logService.error(`[AgentPluginActivationService] Failed to install managed plugin '${pluginId}'`, error);
				}
				continue;
			}

			if (!this._isPluginInstalled(installUri)) {
				this._logService.warn(`[AgentPluginActivationService] Managed plugin '${pluginId}' was not installed`);
				continue;
			}

			this._agentPluginService.setInstalledPluginProfileBaseline(installUri.toString(), false);
			installedPluginIds.push(pluginId);
		}

		if (installedPluginIds.length > 0) {
			const waitCancellation = new CancellationTokenSource(this._cancellation.token);
			try {
				const discoveryReady = waitForState(this._agentPluginService.plugins, plugins => {
					const discovered = new Set(plugins.map(plugin => getAgentPluginPolicyId(plugin)));
					return installedPluginIds.every(pluginId => discovered.has(pluginId));
				}, undefined, waitCancellation.token).catch(error => {
					if (!isCancellationError(error)) {
						throw error;
					}
				});
				await raceTimeout(discoveryReady, 10_000);
			} finally {
				waitCancellation.dispose(true);
			}
		}
	}

	private _managedPluginIds(): ReadonlySet<string> {
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

export class AgentPluginActivationContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.agentPluginActivation';

	constructor(@IAgentPluginActivationService _service: IAgentPluginActivationService) { }
}
