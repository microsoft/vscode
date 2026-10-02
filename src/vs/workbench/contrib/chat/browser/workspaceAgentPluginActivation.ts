/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { ContributionEnablementState } from '../common/enablement.js';
import { IAgentPluginService } from '../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { areMarketplacePluginsEqual, IMarketplacePlugin, IPluginMarketplaceService } from '../common/plugins/pluginMarketplaceService.js';
import { IWorkspacePluginSettings, IWorkspacePluginSettingsService } from '../common/plugins/workspacePluginSettingsService.js';

export const IWorkspaceAgentPluginActivationService = createDecorator<IWorkspaceAgentPluginActivationService>('workspaceAgentPluginActivationService');

export interface IWorkspaceAgentPluginActivationService {
	readonly _serviceBrand: undefined;
	/** Reconciles repository plugin installs for the requested workspace folders, or all folders when omitted. */
	reconcile(workspaceFolders?: readonly URI[]): Promise<void>;
}

export class WorkspaceAgentPluginActivationService extends Disposable implements IWorkspaceAgentPluginActivationService {
	declare readonly _serviceBrand: undefined;

	static readonly ID = 'workbench.contrib.workspaceAgentPluginActivation';

	private readonly _cancellation = this._register(new CancellationTokenSource());
	private readonly _requestedWorkspaceFolders: URI[] = [];
	private _allWorkspaceFoldersRequested = false;
	private _reconcilePromise: Promise<void> | undefined;

	constructor(
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IPluginInstallService private readonly _pluginInstallService: IPluginInstallService,
		@IAgentPluginService private readonly _agentPluginService: IAgentPluginService,
		@IWorkspacePluginSettingsService private readonly _workspacePluginSettingsService: IWorkspacePluginSettingsService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(Event.any(
			Event.fromObservableLight(this._workspacePluginSettingsService.workspaceSettings),
			Event.fromObservableLight(this._pluginMarketplaceService.installedPlugins),
			this._pluginMarketplaceService.onDidChangeMarketplaces,
			this._chatEntitlementService.onDidChangeSentiment,
		)(() => {
			void this.reconcile();
		}));
		void this.reconcile();
	}

	override dispose(): void {
		this._cancellation.cancel();
		super.dispose();
	}

	reconcile(workspaceFolders?: readonly URI[]): Promise<void> {
		if (workspaceFolders === undefined) {
			this._allWorkspaceFoldersRequested = true;
			this._requestedWorkspaceFolders.length = 0;
		} else if (!this._allWorkspaceFoldersRequested) {
			this._requestedWorkspaceFolders.push(...workspaceFolders);
		}

		if (!this._reconcilePromise) {
			const reconcilePromise = this._runReconcile().finally(() => {
				if (this._reconcilePromise === reconcilePromise) {
					this._reconcilePromise = undefined;
				}
			});
			this._reconcilePromise = reconcilePromise;
		}
		return this._reconcilePromise;
	}

	private async _runReconcile(): Promise<void> {
		while ((this._allWorkspaceFoldersRequested || this._requestedWorkspaceFolders.length > 0)
			&& !this._store.isDisposed
			&& !this._cancellation.token.isCancellationRequested) {
			const workspaceFolders = this._allWorkspaceFoldersRequested ? undefined : this._requestedWorkspaceFolders.splice(0);
			this._allWorkspaceFoldersRequested = false;
			try {
				await this._installConfiguredPlugins(workspaceFolders);
			} catch (error) {
				if (!isCancellationError(error)) {
					this._logService.error('[WorkspaceAgentPluginActivation] Failed to reconcile workspace plugins', error);
				}
			}
		}
	}

	private async _installConfiguredPlugins(workspaceFolders: readonly URI[] | undefined): Promise<void> {
		await this._workspacePluginSettingsService.whenSettled();
		if (this._chatEntitlementService.sentiment.hidden) {
			return;
		}

		const workspaceSettings = this._getWorkspaceSettings(workspaceFolders);
		const hasConfiguredEnablement = workspaceSettings.some(settings => settings.enabledPlugins.size > 0);
		if (!hasConfiguredEnablement) {
			return;
		}

		await this._pluginMarketplaceService.whenInstalledPluginsReady;
		if (this._cancellation.token.isCancellationRequested || this._chatEntitlementService.sentiment.hidden) {
			return;
		}

		let refreshPluginDiscovery = false;
		for (const settings of workspaceSettings) {
			const configuredPluginIds = new Set([...settings.enabledPlugins].filter(([, enabled]) => enabled).map(([pluginId]) => pluginId));
			if (configuredPluginIds.size === 0) {
				continue;
			}

			const marketplacePlugins = await this._pluginMarketplaceService.fetchMarketplacePlugins(
				this._cancellation.token,
				undefined,
				{
					workspaceFolder: settings.workspaceFolder,
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

			for (const pluginId of configuredPluginIds) {
				if (this._cancellation.token.isCancellationRequested || this._chatEntitlementService.sentiment.hidden) {
					return;
				}
				if (this._workspacePluginSettingsService.getWorkspaceSettings(settings.workspaceFolder)?.enabledPlugins.get(pluginId) !== true) {
					continue;
				}

				const plugin = pluginsById.get(pluginId);
				if (!plugin) {
					this._logService.warn(`[WorkspaceAgentPluginActivation] Workspace plugin '${pluginId}' was not found in the configured marketplaces`);
					continue;
				}

				const installUri = this._pluginInstallService.getPluginInstallUri(plugin);
				if (this._pluginMarketplaceService.isPluginInstalled(installUri)) {
					const installedMetadata = this._pluginMarketplaceService.getMarketplacePluginMetadata(installUri);
					if (!areMarketplacePluginsEqual(installedMetadata, plugin)) {
						this._pluginMarketplaceService.addInstalledPlugin(installUri, plugin);
						refreshPluginDiscovery = true;
					}
					continue;
				}

				try {
					await this._pluginInstallService.installPlugin(plugin, this._cancellation.token, { skipTrust: true });
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
				refreshPluginDiscovery = true;
			}
		}

		await this._agentPluginService.whenReady;
		if (refreshPluginDiscovery && !this._cancellation.token.isCancellationRequested) {
			await this._agentPluginService.refresh();
		}
	}

	private _getWorkspaceSettings(workspaceFolders: readonly URI[] | undefined): readonly IWorkspacePluginSettings[] {
		if (workspaceFolders === undefined) {
			return this._workspacePluginSettingsService.workspaceSettings.get();
		}
		const result: IWorkspacePluginSettings[] = [];
		for (const workspaceFolder of workspaceFolders) {
			const settings = this._workspacePluginSettingsService.getWorkspaceSettings(workspaceFolder);
			if (settings && !result.some(candidate => isEqual(candidate.workspaceFolder, settings.workspaceFolder))) {
				result.push(settings);
			}
		}
		return result;
	}
}

export class WorkspaceAgentPluginActivation implements IWorkbenchContribution {
	static readonly ID = WorkspaceAgentPluginActivationService.ID;

	constructor(
		@IWorkspaceAgentPluginActivationService _workspaceAgentPluginActivationService: IWorkspaceAgentPluginActivationService,
	) { }
}

function getMarketplacePluginId(plugin: IMarketplacePlugin): string {
	return `${plugin.name}@${plugin.marketplace}`;
}
