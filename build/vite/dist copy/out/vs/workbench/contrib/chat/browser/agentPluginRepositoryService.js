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
import { SequencerByKey } from '../../../../base/common/async.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { revive } from '../../../../base/common/marshalling.js';
import { dirname, isEqual, isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { GitHubPluginSource, GitUrlPluginSource, NpmPluginSource, PipPluginSource, RelativePathPluginSource } from './pluginSources.js';
const MARKETPLACE_INDEX_STORAGE_KEY = 'chat.plugins.marketplaces.index.v1';
let AgentPluginRepositoryService = class AgentPluginRepositoryService {
    constructor(_commandService, environmentService, _fileService, instantiationService, _logService, _notificationService, _progressService, _storageService) {
        this._commandService = _commandService;
        this._fileService = _fileService;
        this._logService = _logService;
        this._notificationService = _notificationService;
        this._progressService = _progressService;
        this._storageService = _storageService;
        this._marketplaceIndex = new Lazy(() => this._loadMarketplaceIndex());
        this._cloneSequencer = new SequencerByKey();
        // On native, use the well-known ~/{dataFolderName}/agent-plugins/ path
        // so that external tools can discover it. On web, fall back to the
        // internal cache location.
        this.agentPluginsHome = environmentService.agentPluginsHome;
        const legacyCacheRoot = joinPath(environmentService.cacheHome, 'agentPlugins');
        const oldCacheRoot = environmentService.cacheHome.scheme === 'file'
            ? legacyCacheRoot
            : this.agentPluginsHome;
        this._cacheRoot = this.agentPluginsHome;
        // Migrate plugin files from the old internal cache directory to the
        // new well-known location. This is a one-time operation.
        if (!isEqual(oldCacheRoot, this.agentPluginsHome)) {
            this._migrationDone = this._migrateDirectory(oldCacheRoot);
        }
        else {
            this._migrationDone = Promise.resolve();
        }
        // Build per-kind source repository map via instantiation service so
        // each repository can inject its own dependencies.
        this._pluginSources = new Map([
            ["relativePath" /* PluginSourceKind.RelativePath */, new RelativePathPluginSource()],
            ["github" /* PluginSourceKind.GitHub */, instantiationService.createInstance(GitHubPluginSource)],
            ["url" /* PluginSourceKind.GitUrl */, instantiationService.createInstance(GitUrlPluginSource)],
            ["npm" /* PluginSourceKind.Npm */, instantiationService.createInstance(NpmPluginSource)],
            ["pip" /* PluginSourceKind.Pip */, instantiationService.createInstance(PipPluginSource)],
        ]);
    }
    getPluginSource(kind) {
        const repo = this._pluginSources.get(kind);
        if (!repo) {
            throw new Error(`No source repository registered for kind '${kind}'`);
        }
        return repo;
    }
    getRepositoryUri(marketplace, marketplaceType) {
        if (marketplace.kind === "localFileUri" /* MarketplaceReferenceKind.LocalFileUri */ && marketplace.localRepositoryUri) {
            return marketplace.localRepositoryUri;
        }
        const indexed = this._marketplaceIndex.value.get(marketplace.canonicalId);
        if (indexed?.repositoryUri) {
            return indexed.repositoryUri;
        }
        return this._getRepoCacheDirForReference(marketplace);
    }
    getPluginInstallUri(plugin) {
        const repoDir = this.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
        return this._getPluginDir(repoDir, plugin.source);
    }
    async ensureRepository(marketplace, options) {
        await this._migrationDone;
        const repoDir = this.getRepositoryUri(marketplace, options?.marketplaceType);
        return this._cloneSequencer.queue(repoDir.fsPath, async () => {
            const repoExists = await this._fileService.exists(repoDir);
            if (repoExists) {
                this._updateMarketplaceIndex(marketplace, repoDir, options?.marketplaceType);
                return repoDir;
            }
            if (marketplace.kind === "localFileUri" /* MarketplaceReferenceKind.LocalFileUri */) {
                throw new Error(`Local marketplace repository does not exist: ${repoDir.fsPath}`);
            }
            const progressTitle = options?.progressTitle ?? localize('preparingMarketplace', "Preparing plugin marketplace '{0}'...", marketplace.displayLabel);
            const failureLabel = options?.failureLabel ?? marketplace.displayLabel;
            await this._cloneRepository(repoDir, marketplace.cloneUrl, progressTitle, failureLabel);
            this._updateMarketplaceIndex(marketplace, repoDir, options?.marketplaceType);
            return repoDir;
        });
    }
    async pullRepository(marketplace, options) {
        const repoDir = this.getRepositoryUri(marketplace, options?.marketplaceType);
        const repoExists = await this._fileService.exists(repoDir);
        if (!repoExists) {
            this._logService.warn(`[AgentPluginRepositoryService] Cannot update plugin '${options?.pluginName ?? marketplace.displayLabel}': repository not cloned`);
            return false;
        }
        const updateLabel = options?.pluginName ?? marketplace.displayLabel;
        try {
            const doPull = async () => {
                return !!(await this._commandService.executeCommand('_git.pull', repoDir.fsPath));
            };
            if (options?.silent) {
                return await doPull();
            }
            return await this._progressService.withProgress({
                location: 15 /* ProgressLocation.Notification */,
                title: localize('updatingPlugin', "Updating plugin '{0}'...", updateLabel),
                cancellable: false,
            }, doPull);
        }
        catch (err) {
            this._logService.error(`[AgentPluginRepositoryService] Failed to update ${marketplace.displayLabel}:`, err);
            if (!options?.silent) {
                this._notificationService.notify({
                    severity: Severity.Error,
                    message: localize('pullFailed', "Failed to update plugin '{0}': {1}", options?.failureLabel ?? updateLabel, err?.message ?? String(err)),
                    actions: {
                        primary: [new Action('showGitOutput', localize('showGitOutput', "Show Git Output"), undefined, true, () => {
                                this._commandService.executeCommand('git.showOutput');
                            })],
                    },
                });
            }
            throw err;
        }
    }
    _getRepoCacheDirForReference(reference) {
        return joinPath(this._cacheRoot, ...reference.cacheSegments);
    }
    _loadMarketplaceIndex() {
        const result = new Map();
        const stored = this._storageService.getObject(MARKETPLACE_INDEX_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
        if (!stored) {
            return result;
        }
        const revived = revive(stored);
        for (const [canonicalId, entry] of Object.entries(revived)) {
            if (!entry || !entry.repositoryUri) {
                continue;
            }
            result.set(canonicalId, {
                repositoryUri: entry.repositoryUri,
                marketplaceType: entry.marketplaceType,
            });
        }
        return result;
    }
    _updateMarketplaceIndex(marketplace, repositoryUri, marketplaceType) {
        if (marketplace.kind === "localFileUri" /* MarketplaceReferenceKind.LocalFileUri */) {
            return;
        }
        const previous = this._marketplaceIndex.value.get(marketplace.canonicalId);
        if (previous && previous.repositoryUri.toString() === repositoryUri.toString() && previous.marketplaceType === marketplaceType) {
            return;
        }
        this._marketplaceIndex.value.set(marketplace.canonicalId, { repositoryUri, marketplaceType });
        this._saveMarketplaceIndex();
    }
    _saveMarketplaceIndex() {
        const serialized = {};
        for (const [canonicalId, entry] of this._marketplaceIndex.value) {
            serialized[canonicalId] = JSON.parse(JSON.stringify({
                repositoryUri: entry.repositoryUri,
                marketplaceType: entry.marketplaceType,
            }));
        }
        if (Object.keys(serialized).length === 0) {
            this._storageService.remove(MARKETPLACE_INDEX_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
            return;
        }
        this._storageService.store(MARKETPLACE_INDEX_STORAGE_KEY, JSON.stringify(serialized), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
    }
    async _cloneRepository(repoDir, cloneUrl, progressTitle, failureLabel, ref) {
        try {
            await this._progressService.withProgress({
                location: 15 /* ProgressLocation.Notification */,
                title: progressTitle,
                cancellable: false,
            }, async () => {
                await this._fileService.createFolder(dirname(repoDir));
                await this._commandService.executeCommand('_git.cloneRepository', cloneUrl, repoDir.fsPath, ref);
            });
        }
        catch (err) {
            this._logService.error(`[AgentPluginRepositoryService] Failed to clone ${cloneUrl}:`, err);
            this._notificationService.notify({
                severity: Severity.Error,
                message: localize('cloneFailed', "Failed to install plugin '{0}': {1}", failureLabel, err?.message ?? String(err)),
                actions: {
                    primary: [new Action('showGitOutput', localize('showGitOutput', "Show Git Output"), undefined, true, () => {
                            this._commandService.executeCommand('git.showOutput');
                        })],
                },
            });
            throw err;
        }
    }
    _getPluginDir(repoDir, source) {
        const normalizedSource = source.trim().replace(/^\.?\/+|\/+$/g, '');
        const pluginDir = normalizedSource ? joinPath(repoDir, normalizedSource) : repoDir;
        if (!isEqualOrParent(pluginDir, repoDir)) {
            throw new Error(`Invalid plugin source path '${source}'`);
        }
        return pluginDir;
    }
    getPluginSourceInstallUri(sourceDescriptor) {
        return this.getPluginSource(sourceDescriptor.kind).getInstallUri(this._cacheRoot, sourceDescriptor);
    }
    async ensurePluginSource(plugin, options) {
        await this._migrationDone;
        const repo = this.getPluginSource(plugin.sourceDescriptor.kind);
        if (plugin.sourceDescriptor.kind === "relativePath" /* PluginSourceKind.RelativePath */) {
            return this.ensureRepository(plugin.marketplaceReference, options);
        }
        return repo.ensure(this._cacheRoot, plugin, options);
    }
    async updatePluginSource(plugin, options) {
        const repo = this.getPluginSource(plugin.sourceDescriptor.kind);
        if (plugin.sourceDescriptor.kind === "relativePath" /* PluginSourceKind.RelativePath */) {
            return this.pullRepository(plugin.marketplaceReference, options);
        }
        return repo.update(this._cacheRoot, plugin, options);
    }
    async fetchRepository(marketplace) {
        const repoDir = this.getRepositoryUri(marketplace);
        const repoExists = await this._fileService.exists(repoDir);
        if (!repoExists) {
            return false;
        }
        try {
            await this._commandService.executeCommand('_git.fetchRepository', repoDir.fsPath);
            const behindCount = await this._commandService.executeCommand('_git.revListCount', repoDir.fsPath, 'HEAD', '@{u}') ?? 0;
            return behindCount > 0;
        }
        catch (err) {
            this._logService.debug(`[AgentPluginRepositoryService] Silent fetch failed for ${marketplace.displayLabel}:`, err);
            return false;
        }
    }
    async cleanupPluginSource(plugin, otherInstalledDescriptors) {
        const repo = this.getPluginSource(plugin.sourceDescriptor.kind);
        const cleanupDir = repo.getCleanupTarget(this._cacheRoot, plugin.sourceDescriptor);
        if (!cleanupDir) {
            return;
        }
        // Skip deletion when another installed plugin shares the same
        // cleanup target (e.g. same cloned repository with different sub-paths).
        if (otherInstalledDescriptors) {
            const shared = otherInstalledDescriptors.some(other => {
                const otherRepo = this.getPluginSource(other.kind);
                const otherTarget = otherRepo.getCleanupTarget(this._cacheRoot, other);
                return otherTarget && isEqual(otherTarget, cleanupDir);
            });
            if (shared) {
                this._logService.info(`[${plugin.sourceDescriptor.kind}] Skipping cleanup of shared cache: ${cleanupDir.toString()}`);
                return;
            }
        }
        try {
            const exists = await this._fileService.exists(cleanupDir);
            if (exists) {
                await this._fileService.del(cleanupDir, { recursive: true });
                this._logService.info(`[${plugin.sourceDescriptor.kind}] Removed plugin cache: ${cleanupDir.toString()}`);
            }
        }
        catch (err) {
            this._logService.warn(`[${plugin.sourceDescriptor.kind}] Failed to remove plugin cache '${cleanupDir.toString()}':`, err);
        }
        try {
            // Prune empty parent directories up to (but not including) the cache root
            // so we don't leave dangling owner/authority folders behind.
            await this._pruneEmptyParents(cleanupDir);
        }
        catch (err) {
            this._logService.warn(`[${plugin.sourceDescriptor.kind}] Failed to cleanup plugin source:`, err);
        }
    }
    /**
     * Walk from {@link child}'s parent toward {@link _cacheRoot}, removing
     * each directory that is empty. Stops as soon as a non-empty directory
     * is found or the cache root is reached. Only operates on descendants
     * of the cache root — returns immediately for paths outside it.
     */
    async _pruneEmptyParents(child) {
        if (!isEqualOrParent(child, this._cacheRoot)) {
            return;
        }
        let current = dirname(child);
        while (isEqualOrParent(current, this._cacheRoot) && !isEqual(current, this._cacheRoot)) {
            try {
                const stat = await this._fileService.resolve(current);
                if (stat.children && stat.children.length > 0) {
                    break;
                }
                await this._fileService.del(current);
            }
            catch {
                break;
            }
            current = dirname(current);
        }
    }
    /**
     * One-time migration of plugin files from the old internal cache
     * directory (`{cacheHome}/agentPlugins/`) to the new well-known
     * location (`~/{dataFolderName}/agent-plugins/`).
     */
    async _migrateDirectory(oldCacheRoot) {
        try {
            const oldExists = await this._fileService.exists(oldCacheRoot);
            if (!oldExists) {
                return;
            }
            const newExists = await this._fileService.exists(this.agentPluginsHome);
            if (newExists) {
                this._logService.info('[AgentPluginRepositoryService] Both old and new agent-plugins directories exist; skipping directory migration');
                return;
            }
            this._logService.info(`[AgentPluginRepositoryService] Migrating agent plugins from ${oldCacheRoot.toString()} to ${this.agentPluginsHome.toString()}`);
            await this._fileService.move(oldCacheRoot, this.agentPluginsHome, false);
            // Clear the marketplace index — it caches repository URIs that
            // pointed to the old location and would cause path mismatches.
            this._storageService.remove(MARKETPLACE_INDEX_STORAGE_KEY, -1 /* StorageScope.APPLICATION */);
            this._marketplaceIndex.value.clear();
        }
        catch (error) {
            this._logService.error('[AgentPluginRepositoryService] Directory migration failed', error);
        }
    }
};
AgentPluginRepositoryService = __decorate([
    __param(0, ICommandService),
    __param(1, IWorkbenchEnvironmentService),
    __param(2, IFileService),
    __param(3, IInstantiationService),
    __param(4, ILogService),
    __param(5, INotificationService),
    __param(6, IProgressService),
    __param(7, IStorageService)
], AgentPluginRepositoryService);
export { AgentPluginRepositoryService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDbEUsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbkcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDMUUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxRQUFRLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUMxRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQW9CLE1BQU0sa0RBQWtELENBQUM7QUFDdEcsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUs5RyxPQUFPLEVB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