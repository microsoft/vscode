/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { autorun } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatConfiguration } from '../common/constants.js';
import { getMarketplacePluginPolicyId } from '../common/plugins/agentPluginEnablement.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IMarketplacePlugin, IPluginMarketplaceService } from '../common/plugins/pluginMarketplaceService.js';
import { ChatInputNotificationSeverity, IChatInputNotificationService } from './widget/input/chatInputNotificationService.js';

const requiredPluginNotificationId = 'managedRequiredPluginsUnavailable';

export class ManagedPluginInstall extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.managedPluginInstall';

	private readonly _reconcileScheduler = this._register(new RunOnceScheduler(() => void this._runReconcile(), 0));
	private _reconcileInFlight = false;
	private _reconcileQueued = false;
	private _notificationSignature: string | undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IPluginInstallService private readonly _pluginInstallService: IPluginInstallService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@ILogService private readonly _logService: ILogService,
		@IChatInputNotificationService private readonly _chatInputNotificationService: IChatInputNotificationService,
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
		this._updatePendingNotification();
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
			if (!this._store.isDisposed) {
				this._setUnavailableNotification(this._getMissingRequiredPluginIds());
			}
		} finally {
			this._reconcileInFlight = false;
		}
	}

	override dispose(): void {
		this._clearNotification();
		super.dispose();
	}

	private async _reconcileRequiredPlugins(): Promise<void> {
		if (this._chatEntitlementService.sentiment.hidden
			|| this._configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled) === false) {
			this._clearNotification();
			return;
		}

		const requiredPluginIds = this._getRequiredPluginIds();
		if (requiredPluginIds.size === 0) {
			this._clearNotification();
			return;
		}

		await this._pluginMarketplaceService.whenInstalledPluginsReady();
		if (this._store.isDisposed) {
			return;
		}

		const missingPluginIds = this._getMissingRequiredPluginIds(requiredPluginIds);
		if (missingPluginIds.length === 0) {
			this._clearNotification();
			return;
		}

		const marketplacePlugins = await this._pluginMarketplaceService.fetchMarketplacePlugins(CancellationToken.None);
		if (this._store.isDisposed) {
			return;
		}

		const requiredPlugins: IMarketplacePlugin[] = [];
		const pluginIdsByInstallUri = new ResourceMap<string>();
		const conflictingPluginIds = new Set<string>();
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

			try {
				const installUri = this._pluginInstallService.getPluginInstallUri(managedPlugin);
				const existingPluginId = pluginIdsByInstallUri.get(installUri);
				if (existingPluginId && existingPluginId !== pluginId) {
					conflictingPluginIds.add(existingPluginId);
					conflictingPluginIds.add(pluginId);
					this._logService.warn(`[ManagedPluginInstall] Required plugins '${existingPluginId}' and '${pluginId}' share an install location and cannot both be installed.`);
				} else {
					pluginIdsByInstallUri.set(installUri, pluginId);
				}
				requiredPlugins.push(managedPlugin);
			} catch (error) {
				this._logService.error(`[ManagedPluginInstall] Failed to resolve the install location for required plugin '${pluginId}':`, error);
			}
		}

		const unavailablePluginIds = new Set(missingPluginIds);
		for (const plugin of requiredPlugins) {
			if (this._store.isDisposed) {
				return;
			}
			const pluginId = getMarketplacePluginPolicyId(plugin);
			if (conflictingPluginIds.has(pluginId) || !unavailablePluginIds.has(pluginId)) {
				continue;
			}

			if (this._pluginMarketplaceService.isPluginInstalled(plugin)
				|| await this._installRequiredPlugin(plugin)) {
				unavailablePluginIds.delete(pluginId);
			}
		}

		if (unavailablePluginIds.size > 0) {
			this._logService.warn(`[ManagedPluginInstall] ${unavailablePluginIds.size} required plugin(s) could not be resolved or installed from enterprise-managed marketplaces.`);
			this._setUnavailableNotification([...unavailablePluginIds]);
		} else {
			this._clearNotification();
		}
	}

	private async _installRequiredPlugin(plugin: IMarketplacePlugin): Promise<boolean> {
		try {
			await this._pluginInstallService.installPlugin(plugin);
			return true;
		} catch (error) {
			this._logService.error(`[ManagedPluginInstall] Failed to install required plugin '${plugin.name}':`, error);
			return false;
		}
	}

	private _getRequiredPluginIds(): Set<string> {
		const enabledPluginsPolicy = this._configurationService.inspect<Record<string, boolean>>(ChatConfiguration.EnabledPlugins).policyValue;
		return new Set(
			Object.entries(enabledPluginsPolicy ?? {})
				.filter(([, enabled]) => enabled)
				.map(([pluginId]) => pluginId)
		);
	}

	private _getMissingRequiredPluginIds(requiredPluginIds = this._getRequiredPluginIds()): string[] {
		const installedPluginIds = new Set(
			this._pluginMarketplaceService.installedPlugins.get()
				.map(({ plugin }) => getMarketplacePluginPolicyId(plugin))
		);
		return [...requiredPluginIds].filter(pluginId => !installedPluginIds.has(pluginId)).sort();
	}

	private _updatePendingNotification(): void {
		if (this._chatEntitlementService.sentiment.hidden
			|| this._configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled) === false) {
			this._clearNotification();
			return;
		}

		const missingPluginIds = this._getMissingRequiredPluginIds();
		if (missingPluginIds.length === 0) {
			this._clearNotification();
			return;
		}

		this._setNotification(
			`pending:${missingPluginIds.join('\0')}`,
			ChatInputNotificationSeverity.Warning,
			localize('managedRequiredPluginsInstalling', "Installing required organization plugins"),
			localize('managedRequiredPluginsInstallingDescription', "Chat will be available after the required plugins are installed."),
		);
	}

	private _setUnavailableNotification(pluginIds: readonly string[]): void {
		if (pluginIds.length === 0) {
			this._clearNotification();
			return;
		}
		const sortedPluginIds = [...pluginIds].sort();
		this._setNotification(
			`unavailable:${sortedPluginIds.join('\0')}`,
			ChatInputNotificationSeverity.Error,
			localize('managedRequiredPluginsUnavailable', "Required organization plugins are unavailable"),
			localize(
				'managedRequiredPluginsUnavailableDescription',
				"Chat is unavailable because these required plugins could not be installed: {0}. Check your connection or contact your administrator.",
				sortedPluginIds.join(', '),
			),
		);
	}

	private _setNotification(signature: string, severity: ChatInputNotificationSeverity, message: string, description: string): void {
		if (this._notificationSignature === signature) {
			return;
		}
		this._notificationSignature = signature;
		this._chatInputNotificationService.setNotification({
			id: requiredPluginNotificationId,
			severity,
			blocksSubmission: true,
			message,
			description,
			actions: [],
			dismissible: false,
			autoDismissOnMessage: false,
		});
	}

	private _clearNotification(): void {
		if (this._notificationSignature === undefined) {
			return;
		}
		this._notificationSignature = undefined;
		this._chatInputNotificationService.deleteNotification(requiredPluginNotificationId);
	}
}
