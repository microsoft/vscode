/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { untildify } from '../../../../base/common/labels.js';
import { posix, win32 } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IQuickInputService, IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { IAgentPluginRepositoryService } from '../common/plugins/agentPluginRepositoryService.js';
import { ChatConfiguration } from '../common/constants.js';
import { IPluginInstallService, IInstallPluginFromSourceOptions, IInstallPluginFromSourceResult, IUpdateAllPluginsOptions, IUpdateAllPluginsResult } from '../common/plugins/pluginInstallService.js';
import { IMarketplacePlugin, IMarketplaceReference, IPluginMarketplaceService, MarketplaceReferenceKind, MarketplaceType, hasSourceChanged, parseMarketplaceReference, parseMarketplaceReferences, PluginSourceKind, readConfiguredMarketplaces } from '../common/plugins/pluginMarketplaceService.js';

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
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IPathService private readonly _pathService: IPathService,
	) { }

	async installPlugin(plugin: IMarketplacePlugin): Promise<void> {
		if (!await this._ensureMarketplaceTrusted(plugin)) {
			throw new CancellationError();
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

	validatePluginSource(source: string): string | undefined {
		const reference = parseMarketplaceReference(source);
		if (reference || this._isLocalPathSource(source)) {
			return undefined;
		}
		return localize('invalidSource', "'{0}' is not a valid plugin source. Enter a GitHub repository (owner/repo), a git clone URL, or a local folder path.", source);
	}

	async installPluginFromSource(source: string, options?: IInstallPluginFromSourceOptions): Promise<IInstallPluginFromSourceResult> {
		const reference = parseMarketplaceReference(source);
		if (reference && reference.kind !== MarketplaceReferenceKind.LocalFileUri) {
			return this._doInstallFromSource(reference, options);
		}

		const local = await this._resolveLocalDirectorySource(source);
		if (local) {
			return this._doInstallFromLocalSource(local.reference, local.configPath, options);
		}

		return {
			success: false,
			message: localize('invalidSource', "'{0}' is not a valid plugin source. Enter a GitHub repository (owner/repo), a git clone URL, or a local folder path.", source),
		};
	}

	private async _doInstallFromSource(reference: IMarketplaceReference, options?: IInstallPluginFromSourceOptions): Promise<IInstallPluginFromSourceResult> {
		// Build a source descriptor for the git clone.
		const sourceDescriptor = reference.kind === MarketplaceReferenceKind.GitHubShorthand
			? { kind: PluginSourceKind.GitHub as const, repo: reference.githubRepo! }
			: { kind: PluginSourceKind.GitUrl as const, url: reference.cloneUrl };

		// Build a temporary plugin object for the trust gate and clone step.
		const tempPlugin: IMarketplacePlugin = {
			name: reference.displayLabel,
			description: '',
			version: '',
			source: '',
			sourceDescriptor,
			marketplace: reference.displayLabel,
			marketplaceReference: reference,
			marketplaceType: MarketplaceType.OpenPlugin,
		};

		if (!await this._ensureMarketplaceTrusted(tempPlugin)) {
			return { success: false };
		}

		// Clone the repository.
		let repoDir: URI;
		try {
			repoDir = await this._pluginRepositoryService.ensurePluginSource(tempPlugin, {
				progressTitle: localize('cloningSource', "Cloning plugin source '{0}'...", reference.displayLabel),
				failureLabel: reference.displayLabel,
				marketplaceType: MarketplaceType.OpenPlugin,
			});
		} catch (e) {
			const detail = e instanceof Error ? e.message : String(e);
			return {
				success: false,
				message: localize('cloneFailedDetail', "Failed to clone plugin source '{0}': {1}", reference.displayLabel, detail),
			};
		}

		const repoExists = await this._fileService.exists(repoDir);
		if (!repoExists) {
			return {
				success: false,
				message: localize('cloneFailed', "Failed to clone plugin source '{0}'.", reference.displayLabel),
			};
		}

		// Scan for marketplace.json to discover plugins.
		const discoveredPlugins = await this._pluginMarketplaceService.readPluginsFromDirectory(repoDir, reference);

		if (discoveredPlugins.length === 0) {
			// Fall back to a single-plugin manifest at the repo root
			// (e.g. `.claude-plugin/plugin.json`). Such repos are not
			// marketplaces, so we do NOT register the reference under the
			// `chat.plugins.marketplaces` config — updates flow through
			// `updatePluginSource` via the plugin's git source descriptor.
			const singlePlugin = await this._pluginMarketplaceService.readSinglePluginManifest(repoDir, reference);
			if (singlePlugin) {
				if (options?.plugin && options.plugin !== singlePlugin.name) {
					return {
						success: false,
						message: localize('pluginNotFound', "Plugin '{0}' not found in '{1}'.", options.plugin, reference.displayLabel),
					};
				}
				await this.installPlugin(singlePlugin);
				return options?.plugin
					? { success: true, matchedPlugin: singlePlugin }
					: { success: true };
			}

			void this._pluginRepositoryService.cleanupPluginSource(tempPlugin);
			return {
				success: false,
				message: localize('noPluginsFound', "No plugins found in '{0}'. This does not appear to be a valid plugin marketplace.", reference.displayLabel),
			};
		}

		// When targeting a specific plugin, find it, register it, and return.
		return this._installDiscoveredPlugins(reference, discoveredPlugins, options);
	}

	/**
	 * Installs a plugin from a local folder path (`file://` URI, absolute path,
	 * or `~`-prefixed path). Inspects the directory to decide whether it is a
	 * marketplace or a standalone plugin and writes to the appropriate setting:
	 * - a marketplace is registered under `chat.plugins.marketplaces`,
	 * - a standalone plugin path is registered under `chat.pluginLocations`.
	 */
	private async _doInstallFromLocalSource(reference: IMarketplaceReference, configPath: string, options?: IInstallPluginFromSourceOptions): Promise<IInstallPluginFromSourceResult> {
		const repoDir = reference.localRepositoryUri;
		if (!repoDir) {
			return {
				success: false,
				message: localize('invalidSource', "'{0}' is not a valid plugin source. Enter a GitHub repository (owner/repo), a git clone URL, or a local folder path.", reference.rawValue),
			};
		}

		let isDirectory = false;
		try {
			isDirectory = (await this._fileService.resolve(repoDir)).isDirectory;
		} catch {
			// resolve throws when the path doesn't exist — handled below.
		}
		if (!isDirectory) {
			return {
				success: false,
				message: localize('localSourceNotFound', "The folder '{0}' does not exist or is not a directory.", repoDir.fsPath),
			};
		}

		// A directory with a marketplace index is registered as a marketplace.
		const discoveredPlugins = await this._pluginMarketplaceService.readPluginsFromDirectory(repoDir, reference);
		if (discoveredPlugins.length > 0) {
			// Verify trust before writing to config, mirroring the git path
			// (_doInstallFromSource): declining the prompt must not persist the
			// marketplace under `chat.plugins.marketplaces`.
			const tempPlugin: IMarketplacePlugin = {
				name: reference.displayLabel,
				description: '',
				version: '',
				source: '',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: '' },
				marketplace: reference.displayLabel,
				marketplaceReference: reference,
				marketplaceType: MarketplaceType.OpenPlugin,
			};
			if (!await this._ensureMarketplaceTrusted(tempPlugin)) {
				return { success: false };
			}
			return this._installDiscoveredPlugins(reference, discoveredPlugins, options);
		}

		// Otherwise, a directory with a single-plugin manifest is registered as
		// a standalone plugin location.
		if (await this._pluginMarketplaceService.isPluginDirectory(repoDir)) {
			await this._addPluginLocationToConfig(configPath);
			return { success: true };
		}

		return {
			success: false,
			message: localize('localNoPlugins', "No plugin or marketplace found in '{0}'. This folder does not contain a plugin or marketplace manifest.", repoDir.fsPath),
		};
	}

	/**
	 * Registers the marketplace and installs the discovered plugin(s): when a
	 * specific plugin is targeted it installs that one, when there is exactly
	 * one it installs it directly, and otherwise prompts the user to choose.
	 */
	private async _installDiscoveredPlugins(reference: IMarketplaceReference, discoveredPlugins: readonly IMarketplacePlugin[], options?: IInstallPluginFromSourceOptions): Promise<IInstallPluginFromSourceResult> {
		if (options?.plugin) {
			const matchedPlugin = discoveredPlugins.find(p => p.name === options.plugin);
			if (!matchedPlugin) {
				return {
					success: false,
					message: localize('pluginNotFound', "Plugin '{0}' not found in '{1}'.", options.plugin, reference.displayLabel),
				};
			}
			await this._addMarketplaceToConfig(reference);
			await this.installPlugin(matchedPlugin);
			return { success: true, matchedPlugin };
		}

		if (discoveredPlugins.length === 1) {
			await this._addMarketplaceToConfig(reference);
			await this.installPlugin(discoveredPlugins[0]);
			return { success: true };
		}

		// Multiple plugins — let the user choose.
		const picks: (IQuickPickItem & { plugin: IMarketplacePlugin })[] = discoveredPlugins.map(p => ({
			label: p.name,
			description: p.description,
			plugin: p,
		}));

		const selected = await this._quickInputService.pick(picks, {
			placeHolder: localize('selectPlugin', "Select a plugin to install from '{0}'", reference.displayLabel),
			canPickMany: false,
		});

		if (!selected) {
			return { success: false };
		}

		await this._addMarketplaceToConfig(reference);
		await this.installPlugin(selected.plugin);

		return { success: true };
	}

	private _addMarketplaceToConfig(reference: IMarketplaceReference) {
		const { userValues, effectiveValues } = readConfiguredMarketplaces(this._configurationService);
		const existingRefs = parseMarketplaceReferences(effectiveValues);
		if (existingRefs.some(r => r.canonicalId === reference.canonicalId)) {
			return;
		}
		return this._configurationService.updateValue(ChatConfiguration.PluginMarketplaces, [...userValues, reference.rawValue]);
	}

	private _addPluginLocationToConfig(pathKey: string) {
		const current = this._configurationService.inspect<Record<string, boolean>>(ChatConfiguration.PluginLocations).userValue ?? {};
		if (current[pathKey] === true) {
			return;
		}
		return this._configurationService.updateValue(ChatConfiguration.PluginLocations, { ...current, [pathKey]: true });
	}

	/**
	 * Returns `true` when the source string looks like a local folder path —
	 * a `file://` URI, an absolute filesystem path, or a `~`-prefixed path.
	 * This is a synchronous format check only; existence is verified later.
	 */
	private _isLocalPathSource(source: string): boolean {
		const trimmed = source.trim();
		if (!trimmed) {
			return false;
		}
		if (/^file:\/\//i.test(trimmed)) {
			return true;
		}
		if (trimmed === '~' || trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
			return true;
		}
		return win32.isAbsolute(trimmed) || posix.isAbsolute(trimmed);
	}

	/**
	 * Resolves a local folder source string to a {@link MarketplaceReferenceKind.LocalFileUri}
	 * reference plus the path to persist in `chat.pluginLocations`. Tilde paths
	 * are expanded against the user home. Returns `undefined` when the string
	 * does not resolve to an absolute local folder.
	 */
	private async _resolveLocalDirectorySource(source: string): Promise<{ reference: IMarketplaceReference; configPath: string } | undefined> {
		const trimmed = source.trim();

		// Already a `file://` URI — parseMarketplaceReference yields a LocalFileUri reference.
		const parsed = parseMarketplaceReference(trimmed);
		if (parsed?.kind === MarketplaceReferenceKind.LocalFileUri && parsed.localRepositoryUri) {
			return { reference: parsed, configPath: parsed.localRepositoryUri.fsPath };
		}

		if (!this._isLocalPathSource(trimmed)) {
			return undefined;
		}

		let resolvedPath = trimmed;
		if (resolvedPath.startsWith('~')) {
			const userHome = await this._pathService.userHome();
			const home = userHome.scheme === 'file' ? userHome.fsPath : userHome.path;
			resolvedPath = untildify(resolvedPath, home);
		}

		if (!win32.isAbsolute(resolvedPath) && !posix.isAbsolute(resolvedPath)) {
			return undefined;
		}

		const reference = parseMarketplaceReference(URI.file(resolvedPath).toString());
		if (reference?.kind !== MarketplaceReferenceKind.LocalFileUri) {
			return undefined;
		}

		// Preserve the user's original path form (e.g. `~/plugins/foo`) so that
		// the persisted `chat.pluginLocations` key stays portable.
		return { reference, configPath: trimmed };
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
		const installed = this._pluginMarketplaceService.installedPlugins.get();
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
		return this._pluginRepositoryService.getPluginInstallUri(plugin);
	}

	// --- Trust gate -------------------------------------------------------------

	private async _ensureMarketplaceTrusted(plugin: IMarketplacePlugin): Promise<boolean> {
		if (this._pluginMarketplaceService.isMarketplaceTrusted(plugin.marketplaceReference)) {
			return true;
		}

		// Under the strict-marketplace enterprise policy, a marketplace that is not
		// on the allowlist is blocked outright — the user cannot grant trust to
		// bypass it. Surface a non-actionable enterprise-policy notification that
		// points at the managed setting (shown as "Managed by organization").
		if (this._pluginMarketplaceService.isStrictMarketplacePolicyActive()) {
			this._notificationService.notify({
				severity: Severity.Warning,
				message: localize('strictMarketplaceBlockedInstall', "Plugins from '{0}' are blocked by your organization's policy.", plugin.marketplaceReference.displayLabel),
				actions: {
					primary: [new Action('chat.plugins.viewMarketplacePolicy', localize('viewPolicySettings', "View Policy Settings"), undefined, true, () => {
						return this._commandService.executeCommand('workbench.action.openSettings', ChatConfiguration.StrictMarketplaces);
					})],
				},
			});
			return false;
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
