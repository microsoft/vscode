/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ContributionEnablementState } from '../common/enablement.js';
import { getAgentPluginPolicyId } from '../common/plugins/agentPluginEnablement.js';
import { IAgentPluginService } from '../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IMarketplacePlugin, IPluginMarketplaceService } from '../common/plugins/pluginMarketplaceService.js';

export class WorkspaceAgentPluginActivation extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.workspaceAgentPluginActivation';

	private readonly _cancellation = this._register(new CancellationTokenSource());
	private _reconcileRequested = false;
	private _reconcileRunning = false;

	constructor(
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IPluginInstallService private readonly _pluginInstallService: IPluginInstallService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(Event.any(
			Event.fromObservableLight(this._pluginMarketplaceService.recommendedPlugins),
			Event.fromObservableLight(this._pluginMarketplaceService.installedPlugins),
			this._pluginMarketplaceService.onDidChangeMarketplaces,
			this._chatEntitlementService.onDidChangeSentiment,
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
				await this._installConfiguredPlugins();
			}
		} catch (error) {
			if (!isCancellationError(error)) {
				this._logService.error('[WorkspaceAgentPluginActivation] Failed to reconcile workspace plugins', error);
			}
		} finally {
			this._reconcileRunning = false;
			if (this._reconcileRequested && !this._store.isDisposed && !this._cancellation.token.isCancellationRequested) {
				void this._reconcile();
			}
		}
	}

	private async _installConfiguredPlugins(): Promise<void> {
		let configuredPluginIds = this._pluginMarketplaceService.recommendedPlugins.get();
		if (configuredPluginIds.size === 0 || this._chatEntitlementService.sentiment.hidden) {
			return;
		}

		await this._pluginMarketplaceService.whenInstalledPluginsReady;
		configuredPluginIds = this._pluginMarketplaceService.recommendedPlugins.get();
		if (configuredPluginIds.size === 0 || this._cancellation.token.isCancellationRequested || this._chatEntitlementService.sentiment.hidden) {
			return;
		}

		const marketplacePlugins = await this._pluginMarketplaceService.fetchMarketplacePlugins(
			this._cancellation.token,
			undefined,
			{
				onMarketplaceError: (marketplace, error) => {
					this._logService.warn(`[WorkspaceAgentPluginActivation] Could not read marketplace '${marketplace.displayLabel}': ${getErrorMessage(error)}`);
				},
			},
		);
		const pluginsById = new Map<string, IMarketplacePlugin>();
		for (const plugin of marketplacePlugins) {
			const pluginId = getMarketplacePluginId(plugin);
			if (!pluginsById.has(pluginId)) {
				pluginsById.set(pluginId, plugin);
			}
		}

		const discoveredPluginIds = new Set<string>();
		for (const plugin of this._agentPluginService.plugins.get()) {
			const pluginId = getAgentPluginPolicyId(plugin);
			if (pluginId !== undefined) {
				discoveredPluginIds.add(pluginId);
			}
		}

		for (const pluginId of configuredPluginIds) {
			if (this._cancellation.token.isCancellationRequested || this._chatEntitlementService.sentiment.hidden) {
				return;
			}
			if (!this._pluginMarketplaceService.recommendedPlugins.get().has(pluginId) || discoveredPluginIds.has(pluginId)) {
				continue;
			}

			const plugin = pluginsById.get(pluginId);
			if (!plugin) {
				this._logService.warn(`[WorkspaceAgentPluginActivation] Workspace plugin '${pluginId}' was not found in the configured marketplaces`);
				continue;
			}

			const installUri = this._pluginInstallService.getPluginInstallUri(plugin);
			if (this._pluginMarketplaceService.isPluginInstalled(installUri)) {
				continue;
			}

			try {
				await this._pluginInstallService.installPlugin(plugin, this._cancellation.token);
			} catch (error) {
				if (!isCancellationError(error)) {
					this._logService.error(`[WorkspaceAgentPluginActivation] Failed to install workspace plugin '${pluginId}'`, error);
				}
				continue;
			}

			if (!this._pluginMarketplaceService.isPluginInstalled(installUri)) {
				this._logService.warn(`[WorkspaceAgentPluginActivation] Workspace plugin '${pluginId}' was not installed`);
				continue;
			}

			this._agentPluginService.enablementModel.setEnabled(installUri.toString(), ContributionEnablementState.DisabledProfile);
		}
	}
}

function getMarketplacePluginId(plugin: IMarketplacePlugin): string {
	return `${plugin.name}@${plugin.marketplace}`;
}
