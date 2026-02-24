/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions.js';
import { dirname, isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { ChatConfiguration } from '../common/constants.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IMarketplacePlugin, MarketplaceType } from '../common/plugins/pluginMarketplaceService.js';

export class PluginInstallService implements IPluginInstallService {
	declare readonly _serviceBrand: undefined;

	private readonly _cacheRoot: URI;

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IProgressService private readonly _progressService: IProgressService,
	) {
		this._cacheRoot = joinPath(environmentService.cacheHome, 'agentPlugins');
	}

	async installPlugin(plugin: IMarketplacePlugin): Promise<void> {
		const repoDir = this._getRepoCacheDir(plugin.marketplaceType, plugin.marketplace);
		const repoExists = await this._fileService.exists(repoDir);

		if (!repoExists) {
			const repoUrl = `https://github.com/${plugin.marketplace}.git`;
			try {
				await this._progressService.withProgress(
					{
						location: ProgressLocation.Notification,
						title: localize('installingPlugin', "Installing plugin '{0}'...", plugin.name),
						cancellable: false,
					},
					async () => {
						await this._commandService.executeCommand('_git.cloneRepository', repoUrl, dirname(repoDir).fsPath);
					}
				);
			} catch (err) {
				this._logService.error(`[PluginInstallService] Failed to clone ${repoUrl}:`, err);
				this._notificationService.notify({
					severity: Severity.Error,
					message: localize('cloneFailed', "Failed to install plugin '{0}': {1}", plugin.name, err?.message ?? String(err)),
					actions: {
						primary: [new Action('showGitOutput', localize('showGitOutput', "Show Git Output"), undefined, true, () => {
							this._commandService.executeCommand('git.showOutput');
						})],
					},
				});
				return;
			}
		}

		let pluginDir: URI;
		try {
			pluginDir = this._getPluginDir(repoDir, plugin.source);
		} catch {
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('pluginDirInvalid', "Plugin source directory '{0}' is invalid for repository '{1}'.", plugin.source, plugin.marketplace),
			});
			return;
		}

		const pluginExists = await this._fileService.exists(pluginDir);
		if (!pluginExists) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('pluginDirNotFound', "Plugin source directory '{0}' not found in repository '{1}'.", plugin.source, plugin.marketplace),
			});
			return;
		}

		this._addPluginPath(pluginDir.fsPath);
	}

	async updatePlugin(plugin: IMarketplacePlugin): Promise<void> {
		const repoDir = this._getRepoCacheDir(plugin.marketplaceType, plugin.marketplace);
		const repoExists = await this._fileService.exists(repoDir);
		if (!repoExists) {
			this._logService.warn(`[PluginInstallService] Cannot update plugin '${plugin.name}': repository not cloned`);
			return;
		}

		try {
			await this._progressService.withProgress(
				{
					location: ProgressLocation.Notification,
					title: localize('updatingPlugin', "Updating plugin '{0}'...", plugin.name),
					cancellable: false,
				},
				async () => {
					await this._commandService.executeCommand('_git.pull', repoDir.fsPath);
				}
			);
		} catch (err) {
			this._logService.error(`[PluginInstallService] Failed to update ${plugin.marketplace}:`, err);
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('pullFailed', "Failed to update plugin '{0}': {1}", plugin.name, err?.message ?? String(err)),
				actions: {
					primary: [new Action('showGitOutput', localize('showGitOutput', "Show Git Output"), undefined, true, () => {
						this._commandService.executeCommand('git.showOutput');
					})],
				},
			});
		}
	}

	/**
	 * Computes the cache directory for a marketplace repository.
	 * Structure: `cacheRoot/{type}/{owner}/{repo}`
	 */
	private _getRepoCacheDir(type: MarketplaceType, marketplace: string): URI {
		const [owner, repo] = marketplace.split('/');
		return joinPath(this._cacheRoot, type, owner, repo);
	}

	/**
	 * Computes the plugin directory within a cloned repository using the
	 * marketplace plugin's `source` field (the subdirectory path within the repo).
	 */
	private _getPluginDir(repoDir: URI, source: string): URI {
		const normalizedSource = source.trim().replace(/^\.?\/+|\/+$/g, '');
		const pluginDir = normalizedSource ? joinPath(repoDir, normalizedSource) : repoDir;
		if (!isEqualOrParent(pluginDir, repoDir)) {
			throw new Error(`Invalid plugin source path '${source}'`);
		}
		return pluginDir;
	}

	async uninstallPlugin(pluginUri: URI): Promise<void> {
		await this._removePluginPath(pluginUri.fsPath);
	}

	getPluginInstallUri(plugin: IMarketplacePlugin): URI {
		const repoDir = this._getRepoCacheDir(plugin.marketplaceType, plugin.marketplace);
		return this._getPluginDir(repoDir, plugin.source);
	}

	/**
	 * Adds the given file-system path to `chat.plugins.paths` in user-local config.
	 */
	private _addPluginPath(fsPath: string): void {
		const current = this._configurationService.getValue<Record<string, boolean>>(ChatConfiguration.PluginPaths) ?? {};
		if (Object.prototype.hasOwnProperty.call(current, fsPath)) {
			return;
		}
		this._configurationService.updateValue(
			ChatConfiguration.PluginPaths,
			{ ...current, [fsPath]: true },
			ConfigurationTarget.USER_LOCAL,
		);
	}

	/**
	 * Removes the given file-system path from `chat.plugins.paths` in user-local config.
	 */
	private _removePluginPath(fsPath: string) {
		const current = this._configurationService.getValue<Record<string, boolean>>(ChatConfiguration.PluginPaths) ?? {};
		if (!Object.prototype.hasOwnProperty.call(current, fsPath)) {
			return;
		}
		const updated = { ...current };
		delete updated[fsPath];
		return this._configurationService.updateValue(
			ChatConfiguration.PluginPaths,
			updated,
			ConfigurationTarget.USER_LOCAL,
		);
	}
}
