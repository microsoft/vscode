/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Action } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IAgentPluginRepositoryService } from '../common/plugins/agentPluginRepositoryService.js';
import { ChatConfiguration } from '../common/constants.js';
import { IPluginMarketplaceService, hasSourceChanged, parseMarketplaceReference, parseMarketplaceReferences } from '../common/plugins/pluginMarketplaceService.js';
let PluginInstallService = class PluginInstallService {
    constructor(_pluginRepositoryService, _pluginMarketplaceService, _fileService, _notificationService, _dialogService, _logService, _progressService, _commandService, _quickInputService, _configurationService) {
        this._pluginRepositoryService = _pluginRepositoryService;
        this._pluginMarketplaceService = _pluginMarketplaceService;
        this._fileService = _fileService;
        this._notificationService = _notificationService;
        this._dialogService = _dialogService;
        this._logService = _logService;
        this._progressService = _progressService;
        this._commandService = _commandService;
        this._quickInputService = _quickInputService;
        this._configurationService = _configurationService;
    }
    async installPlugin(plugin) {
        if (!await this._ensureMarketplaceTrusted(plugin)) {
            return;
        }
        const kind = plugin.sourceDescriptor.kind;
        if (kind === "relativePath" /* PluginSourceKind.RelativePath */) {
            return this._installRelativePathPlugin(plugin);
        }
        if (kind === "npm" /* PluginSourceKind.Npm */ || kind === "pip" /* PluginSourceKind.Pip */) {
            await this._installPackagePlugin(plugin);
            return;
        }
        // GitHub / GitUrl
        return this._installGitPlugin(plugin);
    }
    async installPluginFromSource(source, options) {
        const reference = parseMarketplaceReference(source);
        if (!reference) {
            this._notificationService.notify({
                severity: Severity.Error,
                message: localize('invalidSource', "'{0}' is not a valid plugin source. Enter a GitHub repository (owner/repo) or a git clone URL.", source),
            });
            return;
        }
        if (reference.kind === "localFileUri" /* MarketplaceReferenceKind.LocalFileUri */) {
            this._notificationService.notify({
                severity: Severity.Error,
                message: localize('localSourceNotSupported', "Local file paths are not supported. Enter a GitHub repository (owner/repo) or a git clone URL."),
            });
            return;
        }
        const result = await this._doInstallFromSource(reference, options);
        if (!result.success && result.message) {
            this._notificationService.notify({
                severity: Severity.Error,
                message: result.message,
            });
        }
    }
    validatePluginSource(source) {
        const reference = parseMarketplaceReference(source);
        if (!reference) {
            return localize('invalidSource', "'{0}' is not a valid plugin source. Enter a GitHub repository (owner/repo) or a git clone URL.", source);
        }
        if (reference.kind === "localFileUri" /* MarketplaceReferenceKind.LocalFileUri */) {
            return localize('localSourceNotSupported', "Local file paths are not supported. Enter a GitHub repository (owner/repo) or a git clone URL.");
        }
        return undefined;
    }
    async installPluginFromValidatedSource(source, options) {
        const reference = parseMarketplaceReference(source);
        if (!reference) {
            return {
                success: false,
                message: localize('invalidSource', "'{0}' is not a valid plugin source. Enter a GitHub repository (owner/repo) or a git clone URL.", source),
            };
        }
        if (reference.kind === "localFileUri" /* MarketplaceReferenceKind.LocalFileUri */) {
            return {
                success: false,
                message: localize('localSourceNotSupported', "Local file paths are not supported. Enter a GitHub repository (owner/repo) or a git clone URL."),
            };
        }
        return this._doInstallFromSource(reference, options);
    }
    async _doInstallFromSource(reference, options) {
        // Build a source descriptor for the git clone.
        const sourceDescriptor = reference.kind === "githubShorthand" /* MarketplaceReferenceKind.GitHubShorthand */
            ? { kind: "github" /* PluginSourceKind.GitHub */, repo: reference.githubRepo }
            : { kind: "url" /* PluginSourceKind.GitUrl */, url: reference.cloneUrl };
        // Build a temporary plugin object for the trust gate and clone step.
        const tempPlugin = {
            name: reference.displayLabel,
            description: '',
            version: '',
            source: '',
            sourceDescriptor,
            marketplace: reference.displayLabel,
            marketplaceReference: reference,
            marketplaceType: "openPlugin" /* MarketplaceType.OpenPlugin */,
        };
        if (!await this._ensureMarketplaceTrusted(tempPlugin)) {
            return { success: false };
        }
        // Clone the repository.
        let repoDir;
        try {
            repoDir = await this._pluginRepositoryService.ensurePluginSource(tempPlugin, {
                progressTitle: localize('cloningSource', "Cloning plugin source '{0}'...", reference.displayLabel),
                failureLabel: reference.displayLabel,
                marketplaceType: "openPlugin" /* MarketplaceType.OpenPlugin */,
            });
        }
        catch (e) {
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
            void this._pluginRepositoryService.cleanupPluginSource(tempPlugin);
            return {
                success: false,
                message: localize('noPluginsFound', "No plugins found in '{0}'. This does not appear to be a valid plugin marketplace.", reference.displayLabel),
            };
        }
        // When targeting a specific plugin, find it, register it, and return.
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
        const picks = discoveredPlugins.map(p => ({
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
    _addMarketplaceToConfig(reference) {
        const currentValues = this._configurationService.getValue(ChatConfiguration.PluginMarketplaces) ?? [];
        const existingRefs = parseMarketplaceReferences(currentValues);
        if (existingRefs.some(r => r.canonicalId === reference.canonicalId)) {
            return;
        }
        return this._configurationService.updateValue(ChatConfiguration.PluginMarketplaces, [...currentValues, reference.rawValue]);
    }
    async updatePlugin(plugin, silent) {
        const kind = plugin.sourceDescriptor.kind;
        if (kind === "npm" /* PluginSourceKind.Npm */ || kind === "pip" /* PluginSourceKind.Pip */) {
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
    async updateAllPlugins(options, token) {
        const installed = this._pluginMarketplaceService.installedPlugins.get();
        if (installed.length === 0) {
            return { updatedNames: [], failedNames: [] };
        }
        const updatedNames = [];
        const failedNames = [];
        const doUpdate = async () => {
            const gitTasks = [];
            const packagePlugins = [];
            // 1. Pull each unique marketplace repository first (handles all
            //    relative-path plugins and ensures the marketplace index on
            //    disk is up-to-date before we re-read it).
            const seenMarketplaces = new Set();
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
                    }
                    catch (err) {
                        this._logService.error(`[PluginInstallService] Failed to pull marketplace '${ref.displayLabel}':`, err);
                        failedNames.push(ref.displayLabel);
                    }
                })());
            }
            await Promise.all(gitTasks);
            // 2. Re-fetch marketplace data *after* pulling so we see any
            //    updated plugin descriptors (new versions, refs, etc.).
            const marketplacePlugins = await this._pluginMarketplaceService.fetchMarketplacePlugins(token);
            const marketplaceByKey = new Map();
            for (const mp of marketplacePlugins) {
                marketplaceByKey.set(`${mp.marketplaceReference.canonicalId}::${mp.name}`, mp);
            }
            // 3. Update non-relative-path plugins individually.
            const independentGitTasks = [];
            for (const entry of installed) {
                if (entry.plugin.sourceDescriptor.kind === "relativePath" /* PluginSourceKind.RelativePath */) {
                    continue;
                }
                const livePlugin = marketplaceByKey.get(`${entry.plugin.marketplaceReference.canonicalId}::${entry.plugin.name}`);
                if (!livePlugin || !hasSourceChanged(entry.plugin.sourceDescriptor, livePlugin.sourceDescriptor)) {
                    continue;
                }
                const desc = livePlugin.sourceDescriptor;
                if (desc.kind === "npm" /* PluginSourceKind.Npm */ || desc.kind === "pip" /* PluginSourceKind.Pip */) {
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
                    }
                    catch (err) {
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
                }
                catch (err) {
                    this._logService.error(`[PluginInstallService] Failed to update plugin '${marketplace.name}':`, err);
                    failedNames.push(marketplace.name);
                }
            }
        };
        if (options.silent) {
            await doUpdate();
        }
        else {
            await this._progressService.withProgress({
                location: 15 /* ProgressLocation.Notification */,
                title: localize('updatingAllPlugins', "Updating plugins..."),
            }, doUpdate);
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
        }
        else if (updatedNames.length > 0) {
            this._pluginMarketplaceService.clearUpdatesAvailable();
            this._notificationService.notify({
                severity: Severity.Info,
                message: localize('updateAllSuccess', "Updated plugins: {0}", updatedNames.join(', ')),
            });
        }
        else if (!token.isCancellationRequested) {
            this._pluginMarketplaceService.clearUpdatesAvailable();
        }
        return { updatedNames, failedNames };
    }
    getPluginInstallUri(plugin) {
        if (plugin.sourceDescriptor.kind === "relativePath" /* PluginSourceKind.RelativePath */) {
            return this._pluginRepositoryService.getPluginInstallUri(plugin);
        }
        return this._pluginRepositoryService.getPluginSourceInstallUri(plugin.sourceDescriptor);
    }
    // --- Trust gate -------------------------------------------------------------
    async _ensureMarketplaceTrusted(plugin) {
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
    async _installRelativePathPlugin(plugin) {
        try {
            await this._pluginRepositoryService.ensureRepository(plugin.marketplaceReference, {
                progressTitle: localize('installingPlugin', "Installing plugin '{0}'...", plugin.name),
                failureLabel: plugin.name,
                marketplaceType: plugin.marketplaceType,
            });
        }
        catch {
            return;
        }
        let pluginDir;
        try {
            pluginDir = this._pluginRepositoryService.getPluginInstallUri(plugin);
        }
        catch {
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
    async _installGitPlugin(plugin) {
        const repo = this._pluginRepositoryService.getPluginSource(plugin.sourceDescriptor.kind);
        let pluginDir;
        try {
            pluginDir = await this._pluginRepositoryService.ensurePluginSource(plugin, {
                progressTitle: localize('installingPlugin', "Installing plugin '{0}'...", plugin.name),
                failureLabel: plugin.name,
                marketplaceType: plugin.marketplaceType,
            });
        }
        catch {
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
    async _installPackagePlugin(plugin, silent) {
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
};
PluginInstallService = __decorate([
    __param(0, IAgentPluginRepositoryService),
    __param(1, IPluginMarketplaceService),
    __param(2, IFileService),
    __param(3, INotificationService),
    __param(4, IDialogService),
    __param(5, ILogService),
    __param(6, IProgressService),
    __param(7, ICommandService),
    __param(8, IQuickInputService),
    __param(9, IConfigurationService)
], PluginInstallService);
export { PluginInstallService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGx1Z2luSW5zdGFsbFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvcGx1Z2luSW5zdGFsbFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBRTVELE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUU5RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQW9CLE1BQU0sa0RBQWtELENBQUM7QUFDdEcsT0FBTyxFQUFFLGtCQUFrQixFQUFrQixNQUFNLHNEQUFzRCxDQUFDO0FBQzFHLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRTNELE9BQU8sRUFBNkMseUJBQXlCLEVBQTZDLGdCQUFnQixFQUFFLHlCQUF5QixFQUFFLDBCQUEwQixFQUFvQixNQUFNLCtDQUErQyxDQUFDO0FBRXBRLElBQU0sb0JB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