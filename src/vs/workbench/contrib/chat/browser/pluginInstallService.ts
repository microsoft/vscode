/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { ChatConfiguration } from '../common/constants.js';
import { IAgentPluginRepositoryService } from '../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IMarketplacePlugin } from '../common/plugins/pluginMarketplaceService.js';

export class PluginInstallService implements IPluginInstallService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IAgentPluginRepositoryService private readonly _pluginRepositoryService: IAgentPluginRepositoryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@INotificationService private readonly _notificationService: INotificationService,
	) { }

	async installPlugin(plugin: IMarketplacePlugin): Promise<void> {
		try {
			await this._pluginRepositoryService.ensureRepository(plugin.marketplaceReference, {
				progressTitle: localize('installingPlugin', "Installing plugin '{0}'...", plugin.name),
				failureLabel: plugin.name,
				marketplaceType: plugin.marketplaceType,
			});
		} catch {
			return;
		}

		let pluginDir: URI;
		try {
			pluginDir = this._pluginRepositoryService.getPluginInstallUri(plugin);
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
		return this._pluginRepositoryService.pullRepository(plugin.marketplaceReference, {
			pluginName: plugin.name,
			failureLabel: plugin.name,
			marketplaceType: plugin.marketplaceType,
		});
	}

	async uninstallPlugin(pluginUri: URI): Promise<void> {
		await this._removePluginPath(pluginUri.fsPath);
	}

	getPluginInstallUri(plugin: IMarketplacePlugin): URI {
		return this._pluginRepositoryService.getPluginInstallUri(plugin);
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
