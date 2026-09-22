/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatConfiguration } from '../common/constants.js';
import { getMarketplacePluginPolicyId } from '../common/plugins/agentPluginEnablement.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IMarketplacePlugin, IPluginMarketplaceService } from '../common/plugins/pluginMarketplaceService.js';

export class ManagedPluginInstall extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.managedPluginInstall';

	private readonly _reconcileScheduler = this._register(new RunOnceScheduler(() => void this._runReconcile(), 0));
	private _reconcileInFlight = false;
	private _reconcileQueued = false;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IPluginInstallService private readonly _pluginInstallService: IPluginInstallService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(autorun(reader => {
			this._pluginMarketplaceService.installedPlugins.read(reader);
			this._chatEntitlementService.sentimentObs.read(reader);
			this._queueReconcile();
		}));
		this._register(Event.filter(
			this._configurationService.onDidChangeConfiguration,
			event => event.affectsConfiguration(ChatConfiguration.PluginsEnabled)
				|| event.affectsConfiguration(ChatConfiguration.EnabledPlugins)
				|| event.affectsConfiguration(ChatConfiguration.ExtraMarketplaces)
				|| event.affectsConfiguration(ChatConfiguration.StrictMarketplaces),
		)(() => this._queueReconcile()));
	}

	private _queueReconcile(): void {
		if (this._store.isDisposed) {
			return;
		}
		if (this._reconcileInFlight) {
			this._reconcileQueued = true;
			return;
		}
		this._reconcileScheduler.schedule();
	}

	private async _runReconcile(): Promise<void> {
		if (this._store.isDisposed || this._reconcileInFlight) {
			return;
		}

		this._reconcileInFlight = true;
		try {
			do {
				this._reconcileQueued = false;
				await this._reconcileRequiredPlugins();
			} while (this._reconcileQueued && !this._store.isDisposed);
		} catch (error) {
			this._logService.error('[ManagedPluginInstall] Failed to reconcile required plugins:', error);
		} finally {
			this._reconcileInFlight = false;
		}
	}

	private async _reconcileRequiredPlugins(): Promise<void> {
		if (this._chatEntitlementService.sentiment.hidden
			|| this._configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled) === false) {
			return;
		}

		const enabledPluginsPolicy = this._configurationService.inspect<Record<string, boolean>>(ChatConfiguration.EnabledPlugins).policyValue;
		const requiredPluginIds = new Set(
			Object.entries(enabledPluginsPolicy ?? {})
				.filter(([, enabled]) => enabled)
				.map(([pluginId]) => pluginId)
		);
		if (requiredPluginIds.size === 0) {
			return;
		}

		await this._pluginMarketplaceService.whenInstalledPluginsReady();
		if (this._store.isDisposed) {
			return;
		}

		const marketplacePlugins = await this._pluginMarketplaceService.fetchMarketplacePlugins(CancellationToken.None);
		if (this._store.isDisposed) {
			return;
		}

		const resolvedPluginIds = new Set<string>();
		for (const plugin of marketplacePlugins) {
			if (this._store.isDisposed) {
				return;
			}
			const managedMarketplace = this._pluginMarketplaceService.getManagedMarketplace(plugin.marketplaceReference);
			if (!managedMarketplace) {
				continue;
			}
			const managedPlugin = managedMarketplace.displayLabel === plugin.marketplace
				? plugin
				: { ...plugin, marketplace: managedMarketplace.displayLabel, marketplaceReference: managedMarketplace };
			const pluginId = getMarketplacePluginPolicyId(managedPlugin);
			if (!requiredPluginIds.has(pluginId)) {
				continue;
			}

			resolvedPluginIds.add(pluginId);
			if (!this._pluginMarketplaceService.isPluginInstalled(managedPlugin)) {
				await this._installRequiredPlugin(managedPlugin);
			}
		}

		const unresolvedCount = [...requiredPluginIds].filter(pluginId => !resolvedPluginIds.has(pluginId)).length;
		if (unresolvedCount > 0) {
			this._logService.warn(`[ManagedPluginInstall] ${unresolvedCount} required plugin(s) could not be resolved from enterprise-managed marketplaces.`);
		}
	}

	private async _installRequiredPlugin(plugin: IMarketplacePlugin): Promise<void> {
		try {
			await this._pluginInstallService.installPlugin(plugin);
		} catch (error) {
			this._logService.error(`[ManagedPluginInstall] Failed to install required plugin '${plugin.name}':`, error);
		}
	}
}
