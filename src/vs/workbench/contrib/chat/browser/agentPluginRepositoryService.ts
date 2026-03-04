/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action } from '../../../../base/common/actions.js';
import { Lazy } from '../../../../base/common/lazy.js';
import { revive } from '../../../../base/common/marshalling.js';
import { dirname, isEqual, isEqualOrParent, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import type { Dto } from '../../../services/extensions/common/proxyIdentifier.js';
import { IAgentPluginRepositoryService, IEnsureRepositoryOptions, IPullRepositoryOptions } from '../common/plugins/agentPluginRepositoryService.js';
import { IMarketplacePlugin, IMarketplaceReference, IPluginSourceDescriptor, MarketplaceReferenceKind, MarketplaceType, PluginSourceKind } from '../common/plugins/pluginMarketplaceService.js';
import { IPluginSource } from '../common/plugins/pluginSource.js';
import { GitHubPluginSource, GitUrlPluginSource, NpmPluginSource, PipPluginSource, RelativePathPluginSource } from './pluginSources.js';

const MARKETPLACE_INDEX_STORAGE_KEY = 'chat.plugins.marketplaces.index.v1';

interface IMarketplaceIndexEntry {
	repositoryUri: URI;
	marketplaceType?: MarketplaceType;
}

type IStoredMarketplaceIndex = Dto<Record<string, IMarketplaceIndexEntry>>;

export class AgentPluginRepositoryService implements IAgentPluginRepositoryService {
	declare readonly _serviceBrand: undefined;

	private readonly _cacheRoot: URI;
	private readonly _marketplaceIndex = new Lazy<Map<string, IMarketplaceIndexEntry>>(() => this._loadMarketplaceIndex());
	private readonly _pluginSources: ReadonlyMap<PluginSourceKind, IPluginSource>;

	constructor(
		@ICommandService private readonly _commandService: ICommandService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService private readonly _fileService: IFileService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IProgressService private readonly _progressService: IProgressService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		this._cacheRoot = joinPath(environmentService.cacheHome, 'agentPlugins');

		// Build per-kind source repository map via instantiation service so
		// each repository can inject its own dependencies.
		this._pluginSources = new Map<PluginSourceKind, IPluginSource>([
			[PluginSourceKind.RelativePath, new RelativePathPluginSource()],
			[PluginSourceKind.GitHub, instantiationService.createInstance(GitHubPluginSource)],
			[PluginSourceKind.GitUrl, instantiationService.createInstance(GitUrlPluginSource)],
			[PluginSourceKind.Npm, instantiationService.createInstance(NpmPluginSource)],
			[PluginSourceKind.Pip, instantiationService.createInstance(PipPluginSource)],
		]);
	}

	getPluginSource(kind: PluginSourceKind): IPluginSource {
		const repo = this._pluginSources.get(kind);
		if (!repo) {
			throw new Error(`No source repository registered for kind '${kind}'`);
		}
		return repo;
	}

	getRepositoryUri(marketplace: IMarketplaceReference, marketplaceType?: MarketplaceType): URI {
		if (marketplace.kind === MarketplaceReferenceKind.LocalFileUri && marketplace.localRepositoryUri) {
			return marketplace.localRepositoryUri;
		}

		const indexed = this._marketplaceIndex.value.get(marketplace.canonicalId);
		if (indexed?.repositoryUri) {
			return indexed.repositoryUri;
		}

		return this._getRepoCacheDirForReference(marketplace);
	}

	getPluginInstallUri(plugin: IMarketplacePlugin): URI {
		const repoDir = this.getRepositoryUri(plugin.marketplaceReference, plugin.marketplaceType);
		return this._getPluginDir(repoDir, plugin.source);
	}

	async ensureRepository(marketplace: IMarketplaceReference, options?: IEnsureRepositoryOptions): Promise<URI> {
		const repoDir = this.getRepositoryUri(marketplace, options?.marketplaceType);
		const repoExists = await this._fileService.exists(repoDir);
		if (repoExists) {
			this._updateMarketplaceIndex(marketplace, repoDir, options?.marketplaceType);
			return repoDir;
		}

		if (marketplace.kind === MarketplaceReferenceKind.LocalFileUri) {
			throw new Error(`Local marketplace repository does not exist: ${repoDir.fsPath}`);
		}

		const progressTitle = options?.progressTitle ?? localize('preparingMarketplace', "Preparing plugin marketplace '{0}'...", marketplace.displayLabel);
		const failureLabel = options?.failureLabel ?? marketplace.displayLabel;
		await this._cloneRepository(repoDir, marketplace.cloneUrl, progressTitle, failureLabel);
		this._updateMarketplaceIndex(marketplace, repoDir, options?.marketplaceType);
		return repoDir;
	}

	async pullRepository(marketplace: IMarketplaceReference, options?: IPullRepositoryOptions): Promise<void> {
		const repoDir = this.getRepositoryUri(marketplace, options?.marketplaceType);
		const repoExists = await this._fileService.exists(repoDir);
		if (!repoExists) {
			this._logService.warn(`[AgentPluginRepositoryService] Cannot update plugin '${options?.pluginName ?? marketplace.displayLabel}': repository not cloned`);
			return;
		}

		const updateLabel = options?.pluginName ?? marketplace.displayLabel;

		try {
			await this._progressService.withProgress(
				{
					location: ProgressLocation.Notification,
					title: localize('updatingPlugin', "Updating plugin '{0}'...", updateLabel),
					cancellable: false,
				},
				async () => {
					await this._commandService.executeCommand('_git.pull', repoDir.fsPath);
				}
			);
		} catch (err) {
			this._logService.error(`[AgentPluginRepositoryService] Failed to update ${marketplace.displayLabel}:`, err);
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
	}

	private _getRepoCacheDirForReference(reference: IMarketplaceReference): URI {
		return joinPath(this._cacheRoot, ...reference.cacheSegments);
	}

	private _loadMarketplaceIndex(): Map<string, IMarketplaceIndexEntry> {
		const result = new Map<string, IMarketplaceIndexEntry>();
		const stored = this._storageService.getObject<IStoredMarketplaceIndex>(MARKETPLACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION);
		if (!stored) {
			return result;
		}

		const revived = revive<IStoredMarketplaceIndex>(stored);
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

	private _updateMarketplaceIndex(marketplace: IMarketplaceReference, repositoryUri: URI, marketplaceType?: MarketplaceType): void {
		if (marketplace.kind === MarketplaceReferenceKind.LocalFileUri) {
			return;
		}

		const previous = this._marketplaceIndex.value.get(marketplace.canonicalId);
		if (previous && previous.repositoryUri.toString() === repositoryUri.toString() && previous.marketplaceType === marketplaceType) {
			return;
		}

		this._marketplaceIndex.value.set(marketplace.canonicalId, { repositoryUri, marketplaceType });
		this._saveMarketplaceIndex();
	}

	private _saveMarketplaceIndex(): void {
		const serialized: IStoredMarketplaceIndex = {};
		for (const [canonicalId, entry] of this._marketplaceIndex.value) {
			serialized[canonicalId] = JSON.parse(JSON.stringify({
				repositoryUri: entry.repositoryUri,
				marketplaceType: entry.marketplaceType,
			}));
		}

		if (Object.keys(serialized).length === 0) {
			this._storageService.remove(MARKETPLACE_INDEX_STORAGE_KEY, StorageScope.APPLICATION);
			return;
		}

		this._storageService.store(MARKETPLACE_INDEX_STORAGE_KEY, JSON.stringify(serialized), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private async _cloneRepository(repoDir: URI, cloneUrl: string, progressTitle: string, failureLabel: string, ref?: string): Promise<void> {
		try {
			await this._progressService.withProgress(
				{
					location: ProgressLocation.Notification,
					title: progressTitle,
					cancellable: false,
				},
				async () => {
					await this._fileService.createFolder(dirname(repoDir));
					await this._commandService.executeCommand('_git.cloneRepository', cloneUrl, repoDir.fsPath, ref);
				}
			);
		} catch (err) {
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

	private _getPluginDir(repoDir: URI, source: string): URI {
		const normalizedSource = source.trim().replace(/^\.?\/+|\/+$/g, '');
		const pluginDir = normalizedSource ? joinPath(repoDir, normalizedSource) : repoDir;
		if (!isEqualOrParent(pluginDir, repoDir)) {
			throw new Error(`Invalid plugin source path '${source}'`);
		}
		return pluginDir;
	}

	getPluginSourceInstallUri(sourceDescriptor: IPluginSourceDescriptor): URI {
		return this.getPluginSource(sourceDescriptor.kind).getInstallUri(this._cacheRoot, sourceDescriptor);
	}

	async ensurePluginSource(plugin: IMarketplacePlugin, options?: IEnsureRepositoryOptions): Promise<URI> {
		const repo = this.getPluginSource(plugin.sourceDescriptor.kind);
		if (plugin.sourceDescriptor.kind === PluginSourceKind.RelativePath) {
			return this.ensureRepository(plugin.marketplaceReference, options);
		}
		return repo.ensure(this._cacheRoot, plugin, options);
	}

	async updatePluginSource(plugin: IMarketplacePlugin, options?: IPullRepositoryOptions): Promise<void> {
		const repo = this.getPluginSource(plugin.sourceDescriptor.kind);
		if (plugin.sourceDescriptor.kind === PluginSourceKind.RelativePath) {
			return this.pullRepository(plugin.marketplaceReference, options);
		}
		return repo.update(this._cacheRoot, plugin, options);
	}

	async cleanupPluginSource(plugin: IMarketplacePlugin): Promise<void> {
		const repo = this.getPluginSource(plugin.sourceDescriptor.kind);
		const cleanupDir = repo.getCleanupTarget(this._cacheRoot, plugin.sourceDescriptor);
		if (!cleanupDir) {
			return;
		}

		try {
			const exists = await this._fileService.exists(cleanupDir);
			if (exists) {
				await this._fileService.del(cleanupDir, { recursive: true });
				this._logService.info(`[${plugin.sourceDescriptor.kind}] Removed plugin cache: ${cleanupDir.toString()}`);
			}
		} catch (err) {
			this._logService.warn(`[${plugin.sourceDescriptor.kind}] Failed to remove plugin cache '${cleanupDir.toString()}':`, err);
		}

		try {
			// Prune empty parent directories up to (but not including) the cache root
			// so we don't leave dangling owner/authority folders behind.
			await this._pruneEmptyParents(cleanupDir);
		} catch (err) {
			this._logService.warn(`[${plugin.sourceDescriptor.kind}] Failed to cleanup plugin source:`, err);
		}
	}

	/**
	 * Walk from {@link child}'s parent toward {@link _cacheRoot}, removing
	 * each directory that is empty. Stops as soon as a non-empty directory
	 * is found or the cache root is reached. Only operates on descendants
	 * of the cache root — returns immediately for paths outside it.
	 */
	private async _pruneEmptyParents(child: URI): Promise<void> {
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
			} catch {
				break;
			}
			current = dirname(current);
		}
	}

}
