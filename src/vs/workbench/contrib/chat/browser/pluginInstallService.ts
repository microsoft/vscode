/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IAgentPluginRepositoryService } from '../common/plugins/agentPluginRepositoryService.js';
import { IPluginInstallService, IUpdateAllPluginsOptions, IUpdateAllPluginsResult } from '../common/plugins/pluginInstallService.js';
import { IMarketplacePlugin, IPluginMarketplaceService, hasSourceChanged, PluginSourceKind } from '../common/plugins/pluginMarketplaceService.js';

export class PluginInstallService implements IPluginInstallService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IAgentPluginRepositoryService private readonly _pluginRepositoryService: IAgentPluginRepositoryService,
		@IPluginMarketplaceService private readonly _pluginMarketplaceService: IPluginMarketplaceService,
		@IFileService private readonly _fileService: IFileService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ILogService private readonly _logService: ILogService,
		@IProgressService private readonly _progressService: IProgressService,
		@ICommandService private readonly _commandService: ICommandService,
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
			await this._installPackagePlugin(plugin);
			return;
		}

		// GitHub / GitUrl
		return this._installGitPlugin(plugin);
	}

	async updatePlugin(plugin: IMarketplacePlugin, silent?: boolean): Promise<boolean> {
		const kind = plugin.sourceDescriptor.kind;

		if (kind === PluginSourceKind.Npm || kind === PluginSourceKind.Pip) {
			// Package-manager "update" re-runs install via terminal
			return this._installPackagePlugin(plugin, silent);
		}

		// For relative-path and git sources, delegate to repository service
		return this._pluginRepositoryService.updatePluginSource(plugin, {
			pluginName: plugin.name,
			failureLabel: plugin.name,
			marketplaceType: plugin.marketplaceType,
		});
	}

	async updateAllPlugins(options: IUpdateAllPluginsOptions, token: CancellationToken): Promise<IUpdateAllPluginsResult> {
		const installed = this._pluginMarketplaceService.installedPlugins.get().filter(e => e.enabled);
		if (installed.length === 0) {
			return { updatedNames: [], failedNames: [] };
		}

		const updatedNames: string[] = [];
		const failedNames: string[] = [];

		const doUpdate = async () => {
			const gitTasks: Promise<void>[] = [];
			const packagePlugins: { installed: IMarketplacePlugin; marketplace: IMarketplacePlugin }[] = [];

			// 1. Pull each unique marketplace repository first (handles all
			//    relative-path plugins and ensures the marketplace index on
			//    disk is up-to-date before we re-read it).
			const seenMarketplaces = new Set<string>();
			for (const entry of installed) {
				const ref = entry.plugin.marketplaceReference;
				if (seenMarketplaces.has(ref.canonicalId)) {
					continue;
				}
				seenMarketplaces.add(ref.canonicalId);
				gitTasks.push((async () => {
					if (token.isCancellationRequested) {
						return;
					}

					try {
						const changed = await this._pluginRepositoryService.pullRepository(ref, {
							pluginName: ref.displayLabel,
							failureLabel: ref.displayLabel,
							marketplaceType: entry.plugin.marketplaceType,
							silent: options.silent,
						});
						if (changed) {
							updatedNames.push(ref.displayLabel);
						}
					} catch (err) {
						this._logService.error(`[PluginInstallService] Failed to pull marketplace '${ref.displayLabel}':`, err);
						failedNames.push(ref.displayLabel);
					}
				})());
			}

			await Promise.all(gitTasks);

			// 2. Re-fetch marketplace data *after* pulling so we see any
			//    updated plugin descriptors (new versions, refs, etc.).
			const marketplacePlugins = await this._pluginMarketplaceService.fetchMarketplacePlugins(token);
			const marketplaceByKey = new Map<string, IMarketplacePlugin>();
			for (const mp of marketplacePlugins) {
				marketplaceByKey.set(`${mp.marketplaceReference.canonicalId}::${mp.name}`, mp);
			}

			// 3. Update non-relative-path plugins individually.
			const independentGitTasks: Promise<void>[] = [];
			for (const entry of installed) {
				if (entry.plugin.sourceDescriptor.kind === PluginSourceKind.RelativePath) {
					continue;
				}

				const livePlugin = marketplaceByKey.get(`${entry.plugin.marketplaceReference.canonicalId}::${entry.plugin.name}`);
				if (!livePlugin || !hasSourceChanged(entry.plugin.sourceDescriptor, livePlugin.sourceDescriptor)) {
					continue;
				}

				const desc = livePlugin.sourceDescriptor;
				if (desc.kind === PluginSourceKind.Npm || desc.kind === PluginSourceKind.Pip) {
					if (!options.force && !desc.version) {
						continue;
					}
					packagePlugins.push({ installed: entry.plugin, marketplace: livePlugin });
					continue;
				}

				independentGitTasks.push((async () => {
					if (token.isCancellationRequested) {
						return;
					}

					try {
						const changed = await this._pluginRepositoryService.updatePluginSource(livePlugin, {
							pluginName: livePlugin.name,
							failureLabel: livePlugin.name,
							marketplaceType: livePlugin.marketplaceType,
							silent: options.silent,
						});
						if (changed) {
							updatedNames.push(livePlugin.name);
							this._pluginMarketplaceService.addInstalledPlugin(entry.pluginUri, livePlugin);
						}
					} catch (err) {
						this._logService.error(`[PluginInstallService] Failed to update plugin '${livePlugin.name}':`, err);
						failedNames.push(livePlugin.name);
					}
				})());
			}

			await Promise.all(independentGitTasks);

			for (const { installed: _installed, marketplace } of packagePlugins) {
				if (token.isCancellationRequested) {
					return;
				}

				try {
					const changed = await this.updatePlugin(marketplace, options?.silent);
					if (changed) {
						updatedNames.push(marketplace.name);
						const pluginUri = this._pluginRepositoryService.getPluginSourceInstallUri(marketplace.sourceDescriptor);
						this._pluginMarketplaceService.addInstalledPlugin(pluginUri, marketplace);
					}
				} catch (err) {
					this._logService.error(`[PluginInstallService] Failed to update plugin '${marketplace.name}':`, err);
					failedNames.push(marketplace.name);
				}
			}
		};

		if (options.silent) {
			await doUpdate();
		} else {
			await this._progressService.withProgress(
				{
					location: ProgressLocation.Notification,
					title: localize('updatingAllPlugins', "Updating plugins..."),
				},
				doUpdate,
			);
		}

		if (failedNames.length > 0) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: localize('updateAllFailed', "Failed to update: {0}", failedNames.join(', ')),
				actions: {
					primary: [new Action('showGitOutput', localize('showOutput', "Show Output"), undefined, true, () => {
						this._commandService.executeCommand('git.showOutput');
					})],
				},
			});
		} else if (updatedNames.length > 0) {
			this._pluginMarketplaceService.clearUpdatesAvailable();
			this._notificationService.notify({
				severity: Severity.Info,
				message: localize('updateAllSuccess', "Updated plugins: {0}", updatedNames.join(', ')),
			});
		} else if (!token.isCancellationRequested) {
			this._pluginMarketplaceService.clearUpdatesAvailable();
		}

		return { updatedNames, failedNames };
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

	private async _installPackagePlugin(plugin: IMarketplacePlugin, silent?: boolean): Promise<boolean> {
		const repo = this._pluginRepositoryService.getPluginSource(plugin.sourceDescriptor.kind);
		if (!repo.runInstall) {
			this._logService.error(`[PluginInstallService] Expected package repository for kind '${plugin.sourceDescriptor.kind}'`);
			return false;
		}

		// Ensure the parent cache directory exists (returns npm/<pkg> or pip/<pkg>)
		const installDir = await this._pluginRepositoryService.ensurePluginSource(plugin);
		// The actual plugin content location (e.g. npm/<pkg>/node_modules/<pkg>)
		const pluginDir = this._pluginRepositoryService.getPluginSourceInstallUri(plugin.sourceDescriptor);

		const result = await repo.runInstall(installDir, pluginDir, plugin, { silent });
		if (!result) {
			return false;
		}

		this._pluginMarketplaceService.addInstalledPlugin(result.pluginDir, plugin);
		return true;
	}
}
