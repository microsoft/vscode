/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IAgentPluginRepositoryService } from '../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService } from '../common/plugins/pluginInstallService.js';
import { IMarketplacePlugin, IPluginMarketplaceService, PluginSourceKind } from '../common/plugins/pluginMarketplaceService.js';

export class PluginInstallService implements IPluginInstallService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IAgentPluginRepositoryService private readonly _pluginRepositoryService: IAgentPluginRepositoryService,
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IFileService private readonly _fileService: IFileService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async installPlugin(plugin: IMarketplacePlugin): Promise<void> {
		if (!await this._ensureMarketplaceTrusted(plugin)) {
			return;
		}

		const kind = plugin.sourceDescriptor.kind;

		if (kind === PluginSourceKind.RelativePath) {
			return this._installRelativePathPlugin(plugin);
		}

		if (kind === PluginSourceKind.Npm || kind === PluginSourceKind.Pip) {
			return this._installPackagePlugin(plugin);
		}

		// GitHub / GitUrl
		return this._installGitPlugin(plugin);
	}

	async updatePlugin(plugin: IMarketplacePlugin): Promise<void> {
		const kind = plugin.sourceDescriptor.kind;

		if (kind === PluginSourceKind.Npm || kind === PluginSourceKind.Pip) {
			// Package-manager "update" re-runs install via terminal
			return this._installPackagePlugin(plugin);
		}

		// For relative-path and git sources, delegate to repository service
		return this._pluginRepositoryService.updatePluginSource(plugin, {
			pluginName: plugin.name,
			failureLabel: plugin.name,
			marketplaceType: plugin.marketplaceType,
		});
	}

	getPluginInstallUri(plugin: IMarketplacePlugin): URI {
		if (plugin.sourceDescriptor.kind === PluginSourceKind.RelativePath) {
			return this._pluginRepositoryService.getPluginInstallUri(plugin);
		}
		return this._pluginRepositoryService.getPluginSourceInstallUri(plugin.sourceDescriptor);
	}

	// --- Trust gate -------------------------------------------------------------

	private async _ensureMarketplaceTrusted(plugin: IMarketplacePlugin): Promise<boolean> {
		if (this._pluginMarketplaceService.isMarketplaceTrusted(plugin.marketplaceReference)) {
			return true;
		}

		const { confirmed } = await this._dialogService.confirm({
			type: 'question',
			message: localize('trustMarketplace', "Trust Plugins from '{0}'?", plugin.marketplaceReference.displayLabel),
			detail: localize('trustMarketplaceDetail', "Plugins can run code on your machine. Only install plugins from sources you trust.\n\nSource: {0}", plugin.marketplaceReference.rawValue),
			primaryButton: localize({ key: 'trustAndInstall', comment: ['&& denotes a mnemonic'] }, "&&Trust"),
			custom: {
				icon: Codicon.shield,
			},
		});

		if (!confirmed) {
			return false;
		}

		this._pluginMarketplaceService.trustMarketplace(plugin.marketplaceReference);
		return true;
	}

	// --- Relative-path source (existing git-based flow) -----------------------

	private async _installRelativePathPlugin(plugin: IMarketplacePlugin): Promise<void> {
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

		this._pluginMarketplaceService.addInstalledPlugin(pluginDir, plugin);
	}

	// --- GitHub / Git URL source (independent clone) --------------------------

	private async _installGitPlugin(plugin: IMarketplacePlugin): Promise<void> {
		const repo = this._pluginRepositoryService.getPluginSource(plugin.sourceDescriptor.kind);
		let pluginDir: URI;
		try {
			pluginDir = await this._pluginRepositoryService.ensurePluginSource(plugin, {
				progressTitle: localize('installingPlugin', "Installing plugin '{0}'...", plugin.name),
				failureLabel: plugin.name,
				marketplaceType: plugin.marketplaceType,
			});
		} catch {
			return;
		}

		const pluginExists = await this._fileService.exists(pluginDir);
		if (!pluginExists) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('pluginSourceNotFound', "Plugin source '{0}' not found after cloning.", repo.getLabel(plugin.sourceDescriptor)),
			});
			return;
		}

		this._pluginMarketplaceService.addInstalledPlugin(pluginDir, plugin);
	}

	// --- Package-manager sources (npm / pip) ----------------------------------

	private async _installPackagePlugin(plugin: IMarketplacePlugin): Promise<void> {
		const repo = this._pluginRepositoryService.getPluginSource(plugin.sourceDescriptor.kind);
		if (!repo.runInstall) {
			this._logService.error(`[PluginInstallService] Expected package repository for kind '${plugin.sourceDescriptor.kind}'`);
			return;
		}

		// Ensure the parent cache directory exists (returns npm/<pkg> or pip/<pkg>)
		const installDir = await this._pluginRepositoryService.ensurePluginSource(plugin);
		// The actual plugin content location (e.g. npm/<pkg>/node_modules/<pkg>)
		const pluginDir = this._pluginRepositoryService.getPluginSourceInstallUri(plugin.sourceDescriptor);

		const result = await repo.runInstall(installDir, pluginDir, plugin);
		if (!result) {
			return;
		}

		this._pluginMarketplaceService.addInstalledPlugin(result.pluginDir, plugin);
	}
}
