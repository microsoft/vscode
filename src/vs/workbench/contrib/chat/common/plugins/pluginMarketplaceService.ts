/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { parse as parseJSONC } from '../../../../../base/common/json.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { revive } from '../../../../../base/common/marshalling.js';
import { isEqualOrParent, joinPath, normalizePath, relativePath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { asJson, IRequestService } from '../../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import type { Dto } from '../../../../services/extensions/common/proxyIdentifier.js';
import { ChatConfiguration } from '../constants.js';
import { IAgentPluginRepositoryService } from './agentPluginRepositoryService.js';

export const enum MarketplaceType {
	Copilot = 'copilot',
	Claude = 'claude',
}

export const enum MarketplaceReferenceKind {
	GitHubShorthand = 'githubShorthand',
	GitUri = 'gitUri',
	LocalFileUri = 'localFileUri',
}

export interface IMarketplaceReference {
	readonly rawValue: string;
	readonly displayLabel: string;
	readonly cloneUrl: string;
	readonly canonicalId: string;
	readonly cacheSegments: readonly string[];
	readonly kind: MarketplaceReferenceKind;
	readonly githubRepo?: string;
	readonly localRepositoryUri?: URI;
}

export interface IMarketplacePlugin {
	readonly name: string;
	readonly description: string;
	readonly version: string;
	/** Subdirectory within the repository where the plugin lives. */
	readonly source: string;
	/** Marketplace label shown in UI and plugin provenance. */
	readonly marketplace: string;
	/** Canonical reference for clone/update/install location resolution. */
	readonly marketplaceReference: IMarketplaceReference;
	/** The type of marketplace this plugin comes from. */
	readonly marketplaceType: MarketplaceType;
	readonly readmeUri?: URI;
}

interface IMarketplaceJson {
	readonly metadata?: {
		readonly pluginRoot?: string;
	};
	readonly plugins?: readonly {
		readonly name?: string;
		readonly description?: string;
		readonly version?: string;
		readonly source?: string;
	}[];
}

export const IPluginMarketplaceService = createDecorator<IPluginMarketplaceService>('pluginMarketplaceService');

export interface IPluginMarketplaceService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeMarketplaces: Event<void>;
	fetchMarketplacePlugins(token: CancellationToken): Promise<IMarketplacePlugin[]>;
	getMarketplacePluginMetadata(pluginUri: URI): Promise<IMarketplacePlugin | undefined>;
}

/**
 * Marketplace definition files by type, checked in order per repository.
 * The first match determines the marketplace type.
 */
const MARKETPLACE_DEFINITIONS: { type: MarketplaceType; path: string }[] = [
	{ type: MarketplaceType.Copilot, path: '.github/plugin/marketplace.json' },
	{ type: MarketplaceType.Claude, path: '.claude-plugin/marketplace.json' },
];

const GITHUB_MARKETPLACE_CACHE_TTL_MS = 8 * 60 * 60 * 1000;
const GITHUB_MARKETPLACE_CACHE_STORAGE_KEY = 'chat.plugins.marketplaces.githubCache.v1';

interface IGitHubMarketplaceCacheEntry {
	readonly plugins: readonly IMarketplacePlugin[];
	readonly expiresAt: number;
	readonly referenceRawValue: string;
}

type IStoredGitHubMarketplaceCache = Dto<Record<string, IGitHubMarketplaceCacheEntry>>;

export class PluginMarketplaceService implements IPluginMarketplaceService {
	declare readonly _serviceBrand: undefined;
	private readonly _gitHubMarketplaceCache = new Lazy<Map<string, IGitHubMarketplaceCacheEntry>>(() => this._loadPersistedGitHubMarketplaceCache());

	readonly onDidChangeMarketplaces: Event<void>;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IRequestService private readonly _requestService: IRequestService,
		@IFileService private readonly _fileService: IFileService,
		@IAgentPluginRepositoryService private readonly _pluginRepositoryService: IAgentPluginRepositoryService,
		@ILogService private readonly _logService: ILogService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		this.onDidChangeMarketplaces = Event.filter(
			_configurationService.onDidChangeConfiguration,
			e => e.affectsConfiguration(ChatConfiguration.PluginsEnabled) || e.affectsConfiguration(ChatConfiguration.PluginMarketplaces),
		) as Event<unknown> as Event<void>;
	}

	async fetchMarketplacePlugins(token: CancellationToken): Promise<IMarketplacePlugin[]> {
		if (!this._configurationService.getValue<boolean>(ChatConfiguration.PluginsEnabled)) {
			return [];
		}

		const configuredRefs = this._configurationService.getValue<unknown[]>(ChatConfiguration.PluginMarketplaces) ?? [];
		const refs = parseMarketplaceReferences(configuredRefs);

		for (const value of configuredRefs) {
			if (typeof value !== 'string' || !parseMarketplaceReference(value)) {
				this._logService.debug(`[PluginMarketplaceService] Ignoring invalid marketplace entry: ${String(value)}`);
			}
		}

		const results = await Promise.all(
			refs.map(ref => {
				if (ref.kind === MarketplaceReferenceKind.GitHubShorthand && ref.githubRepo) {
					return this._fetchFromGitHubRepo(ref, ref.githubRepo, token);
				}
				return this._fetchFromClonedRepo(ref, token);
			})
		);
		return results.flat();
	}

	private async _fetchFromGitHubRepo(reference: IMarketplaceReference, repo: string, token: CancellationToken): Promise<IMarketplacePlugin[]> {
		const cache = this._gitHubMarketplaceCache.value;

		const cached = this._getCachedGitHubMarketplacePlugins(cache, reference.canonicalId);
		if (cached) {
			return cached;
		}

		let repoMayBePrivate = true;

		for (const def of MARKETPLACE_DEFINITIONS) {
			if (token.isCancellationRequested) {
				return [];
			}
			const url = `https://raw.githubusercontent.com/${repo}/main/${def.path}`;
			try {
				const context = await this._requestService.request({ type: 'GET', url }, token);
				const statusCode = context.res.statusCode;
				if (statusCode !== 200) {
					repoMayBePrivate &&= statusCode !== undefined && statusCode >= 400 && statusCode < 500;
					this._logService.debug(`[PluginMarketplaceService] ${url} returned status ${statusCode}, skipping`);
					continue;
				}
				const json = await asJson<IMarketplaceJson>(context);
				if (!json?.plugins || !Array.isArray(json.plugins)) {
					this._logService.debug(`[PluginMarketplaceService] ${url} did not contain a valid plugins array, skipping`);
					continue;
				}
				const plugins = json.plugins
					.filter((p): p is { name: string; description?: string; version?: string; source?: string } =>
						typeof p.name === 'string' && !!p.name
					)
					.flatMap(p => {
						const source = resolvePluginSource(json.metadata?.pluginRoot, p.source ?? '');
						if (source === undefined) {
							this._logService.warn(`[PluginMarketplaceService] Skipping plugin '${p.name}' in ${repo}: invalid source path '${p.source ?? ''}' with pluginRoot '${json.metadata?.pluginRoot ?? ''}'`);
							return [];
						}

						return [{
							name: p.name,
							description: p.description ?? '',
							version: p.version ?? '',
							source,
							marketplace: reference.displayLabel,
							marketplaceReference: reference,
							marketplaceType: def.type,
							readmeUri: getMarketplaceReadmeUri(repo, source),
						}];
					});

				cache.set(reference.canonicalId, {
					plugins,
					expiresAt: Date.now() + GITHUB_MARKETPLACE_CACHE_TTL_MS,
					referenceRawValue: reference.rawValue,
				});
				this._savePersistedGitHubMarketplaceCache(cache);

				return plugins;
			} catch (err) {
				this._logService.debug(`[PluginMarketplaceService] Failed to fetch marketplace.json from ${url}:`, err);
				continue;
			}
		}

		if (repoMayBePrivate) {
			this._logService.debug(`[PluginMarketplaceService] ${repo} may be private, attempting clone-based marketplace discovery`);
			return this._fetchFromClonedRepo(reference, token);
		}

		this._logService.debug(`[PluginMarketplaceService] No marketplace.json found in ${repo}`);
		return [];
	}

	private _getCachedGitHubMarketplacePlugins(cache: Map<string, IGitHubMarketplaceCacheEntry>, cacheKey: string): IMarketplacePlugin[] | undefined {
		const cached = cache.get(cacheKey);
		if (!cached) {
			return undefined;
		}

		if (cached.expiresAt <= Date.now()) {
			cache.delete(cacheKey);
			this._savePersistedGitHubMarketplaceCache(cache);
			return undefined;
		}

		return [...cached.plugins];
	}

	private _loadPersistedGitHubMarketplaceCache(): Map<string, IGitHubMarketplaceCacheEntry> {
		const cache = new Map<string, IGitHubMarketplaceCacheEntry>();
		const now = Date.now();
		const stored = this._storageService.getObject<IStoredGitHubMarketplaceCache>(GITHUB_MARKETPLACE_CACHE_STORAGE_KEY, StorageScope.APPLICATION);
		if (!stored) {
			return cache;
		}

		const revived = revive<IStoredGitHubMarketplaceCache>(stored);

		for (const [cacheKey, entry] of Object.entries(revived)) {
			if (!entry || !Array.isArray(entry.plugins) || typeof entry.expiresAt !== 'number' || entry.expiresAt <= now || typeof entry.referenceRawValue !== 'string') {
				continue;
			}

			const reference = parseMarketplaceReference(entry.referenceRawValue);
			if (!reference) {
				continue;
			}

			const plugins = entry.plugins.map(plugin => ({
				...plugin,
				marketplace: reference.displayLabel,
				marketplaceReference: reference,
			}));

			cache.set(cacheKey, {
				plugins,
				expiresAt: entry.expiresAt,
				referenceRawValue: entry.referenceRawValue,
			});
		}

		return cache;
	}

	private _savePersistedGitHubMarketplaceCache(cache: Map<string, IGitHubMarketplaceCacheEntry>): void {
		const serialized: IStoredGitHubMarketplaceCache = {};
		for (const [cacheKey, entry] of cache) {
			if (!entry.plugins.length || entry.expiresAt <= Date.now()) {
				continue;
			}

			serialized[cacheKey] = {
				expiresAt: entry.expiresAt,
				referenceRawValue: entry.referenceRawValue,
				plugins: entry.plugins,
			};
		}

		if (Object.keys(serialized).length === 0) {
			this._storageService.remove(GITHUB_MARKETPLACE_CACHE_STORAGE_KEY, StorageScope.APPLICATION);
			return;
		}

		this._storageService.store(
			GITHUB_MARKETPLACE_CACHE_STORAGE_KEY,
			JSON.stringify(serialized),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE,
		);
	}

	async getMarketplacePluginMetadata(pluginUri: URI): Promise<IMarketplacePlugin | undefined> {
		const configuredRefs = this._configurationService.getValue<unknown[]>(ChatConfiguration.PluginMarketplaces) ?? [];
		const refs = parseMarketplaceReferences(configuredRefs);

		for (const ref of refs) {
			let repoDir: URI;
			try {
				repoDir = this._pluginRepositoryService.getRepositoryUri(ref);
			} catch {
				continue;
			}

			if (!isEqualOrParent(pluginUri, repoDir)) {
				continue;
			}

			for (const def of MARKETPLACE_DEFINITIONS) {
				const definitionUri = joinPath(repoDir, def.path);
				let json: IMarketplaceJson | undefined;
				try {
					const contents = await this._fileService.readFile(definitionUri);
					json = parseJSONC(contents.value.toString()) as IMarketplaceJson | undefined;
				} catch {
					continue;
				}

				if (!json?.plugins || !Array.isArray(json.plugins)) {
					continue;
				}

				for (const p of json.plugins) {
					if (typeof p.name !== 'string' || !p.name) {
						continue;
					}

					const source = resolvePluginSource(json.metadata?.pluginRoot, p.source ?? '');
					if (source === undefined) {
						continue;
					}

					const pluginSourceUri = normalizePath(joinPath(repoDir, source));
					if (isEqualOrParent(pluginUri, pluginSourceUri)) {
						return {
							name: p.name,
							description: p.description ?? '',
							version: p.version ?? '',
							source,
							marketplace: ref.displayLabel,
							marketplaceReference: ref,
							marketplaceType: def.type,
							readmeUri: getMarketplaceReadmeFileUri(repoDir, source),
						};
					}
				}
			}
		}

		return undefined;
	}

	private async _fetchFromClonedRepo(reference: IMarketplaceReference, token: CancellationToken): Promise<IMarketplacePlugin[]> {
		let repoDir: URI;
		try {
			repoDir = await this._pluginRepositoryService.ensureRepository(reference);
		} catch (err) {
			this._logService.debug(`[PluginMarketplaceService] Failed to prepare marketplace repository ${reference.rawValue}:`, err);
			return [];
		}

		for (const def of MARKETPLACE_DEFINITIONS) {
			if (token.isCancellationRequested) {
				return [];
			}

			const definitionUri = joinPath(repoDir, def.path);
			let json: IMarketplaceJson | undefined;
			try {
				const contents = await this._fileService.readFile(definitionUri);
				json = parseJSONC(contents.value.toString()) as IMarketplaceJson | undefined;
			} catch {
				continue;
			}

			if (!json?.plugins || !Array.isArray(json.plugins)) {
				this._logService.debug(`[PluginMarketplaceService] ${definitionUri.toString()} did not contain a valid plugins array, skipping`);
				continue;
			}

			return json.plugins
				.filter((p): p is { name: string; description?: string; version?: string; source?: string } =>
					typeof p.name === 'string' && !!p.name
				)
				.flatMap(p => {
					const source = resolvePluginSource(json.metadata?.pluginRoot, p.source ?? '');
					if (source === undefined) {
						this._logService.warn(`[PluginMarketplaceService] Skipping plugin '${p.name}' in ${reference.rawValue}: invalid source path '${p.source ?? ''}' with pluginRoot '${json.metadata?.pluginRoot ?? ''}'`);
						return [];
					}

					return [{
						name: p.name,
						description: p.description ?? '',
						version: p.version ?? '',
						source,
						marketplace: reference.displayLabel,
						marketplaceReference: reference,
						marketplaceType: def.type,
						readmeUri: getMarketplaceReadmeFileUri(repoDir, source),
					}];
				});
		}

		this._logService.debug(`[PluginMarketplaceService] No marketplace.json found in ${reference.rawValue}`);
		return [];
	}
}

export function parseMarketplaceReferences(values: readonly unknown[]): IMarketplaceReference[] {
	const byCanonicalId = new Map<string, IMarketplaceReference>();

	for (const value of values) {
		if (typeof value !== 'string') {
			continue;
		}

		const parsed = parseMarketplaceReference(value);
		if (!parsed) {
			continue;
		}

		if (!byCanonicalId.has(parsed.canonicalId)) {
			byCanonicalId.set(parsed.canonicalId, parsed);
		}
	}

	return [...byCanonicalId.values()];
}

export function parseMarketplaceReference(value: string): IMarketplaceReference | undefined {
	const rawValue = value.trim();
	if (!rawValue) {
		return undefined;
	}

	const uriReference = parseUriMarketplaceReference(rawValue);
	if (uriReference) {
		return uriReference;
	}

	const scpReference = parseScpMarketplaceReference(rawValue);
	if (scpReference) {
		return scpReference;
	}

	const shorthandMatch = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(rawValue);
	if (shorthandMatch) {
		const owner = shorthandMatch[1];
		const repo = shorthandMatch[2];
		return {
			rawValue,
			displayLabel: `${owner}/${repo}`,
			cloneUrl: `https://github.com/${owner}/${repo}.git`,
			canonicalId: getGitHubCanonicalId(owner, repo),
			cacheSegments: ['github.com', owner, repo],
			kind: MarketplaceReferenceKind.GitHubShorthand,
			githubRepo: `${owner}/${repo}`,
		};
	}

	return undefined;
}

function parseUriMarketplaceReference(rawValue: string): IMarketplaceReference | undefined {
	let uri: URI;
	try {
		uri = URI.parse(rawValue);
	} catch {
		return undefined;
	}

	const scheme = uri.scheme.toLowerCase();
	if (scheme === 'file' && /^file:\/\//i.test(rawValue)) {
		const localRepositoryUri = URI.file(uri.fsPath);
		return {
			rawValue,
			displayLabel: localRepositoryUri.fsPath,
			cloneUrl: rawValue,
			canonicalId: `file:${localRepositoryUri.toString().toLowerCase()}`,
			cacheSegments: [],
			kind: MarketplaceReferenceKind.LocalFileUri,
			localRepositoryUri,
		};
	}

	if (scheme !== 'http' && scheme !== 'https' && scheme !== 'ssh') {
		return undefined;
	}

	if (!uri.authority) {
		return undefined;
	}

	const normalizedPath = normalizeGitRepoPath(uri.path);
	if (!normalizedPath) {
		return undefined;
	}

	const sanitizedAuthority = sanitizePathSegment(uri.authority.toLowerCase());
	const pathSegments = normalizedPath.slice(1, -4).split('/').map(sanitizePathSegment);
	return {
		rawValue,
		displayLabel: rawValue,
		cloneUrl: rawValue,
		canonicalId: `git:${uri.authority.toLowerCase()}/${normalizedPath.slice(1).toLowerCase()}`,
		cacheSegments: [sanitizedAuthority, ...pathSegments],
		kind: MarketplaceReferenceKind.GitUri,
	};
}

function parseScpMarketplaceReference(rawValue: string): IMarketplaceReference | undefined {
	const match = /^([^@\s]+)@([^:\s]+):(.+\.git)$/i.exec(rawValue);
	if (!match) {
		return undefined;
	}

	const authority = match[2];
	const pathWithGit = match[3].replace(/^\/+/, '');
	if (!pathWithGit.toLowerCase().endsWith('.git')) {
		return undefined;
	}

	const pathSegments = pathWithGit.slice(0, -4).split('/').map(sanitizePathSegment);
	return {
		rawValue,
		displayLabel: rawValue,
		cloneUrl: rawValue,
		canonicalId: `git:${authority.toLowerCase()}/${pathWithGit.toLowerCase()}`,
		cacheSegments: [sanitizePathSegment(authority.toLowerCase()), ...pathSegments],
		kind: MarketplaceReferenceKind.GitUri,
	};
}

function normalizeGitRepoPath(path: string): string | undefined {
	const trimmed = path.replace(/\/+/g, '/').replace(/\/+$/g, '');
	if (!trimmed.toLowerCase().endsWith('.git')) {
		return undefined;
	}

	const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
	const pathWithoutGit = withLeadingSlash.slice(1, -4);
	if (!pathWithoutGit || !pathWithoutGit.includes('/')) {
		return undefined;
	}

	return withLeadingSlash;
}

function getGitHubCanonicalId(owner: string, repo: string): string {
	return `github:${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

function sanitizePathSegment(value: string): string {
	return value.replace(/[\\/:*?"<>|]/g, '_');
}

function normalizeMarketplacePath(value: string): string {
	let normalized = value.trim().replace(/\\/g, '/');
	normalized = normalized.replace(/^\.?\/+/, '').replace(/\/+$/g, '');
	return normalized;
}

/**
 * Resolve plugin source from marketplace metadata.
 * - If pluginRoot exists, plugin source is resolved relative to it.
 * - If source already includes pluginRoot, it's preserved.
 * Validation of whether the final path is allowed is performed by the install service.
 */
function resolvePluginSource(pluginRoot: string | undefined, source: string): string | undefined {
	const normalizedRoot = pluginRoot ? normalizeMarketplacePath(pluginRoot) : '';
	const normalizedSource = normalizeMarketplacePath(source);
	const repoRoot = URI.file('/');
	const pluginRootUri = normalizedRoot ? normalizePath(joinPath(repoRoot, normalizedRoot)) : repoRoot;

	if (!normalizedSource) {
		return normalizedRoot || undefined;
	}

	if (normalizedRoot && (normalizedSource === normalizedRoot || normalizedSource.startsWith(`${normalizedRoot}/`))) {
		return normalizedSource;
	}

	const resolvedUri = normalizePath(joinPath(pluginRootUri, normalizedSource));
	return relativePath(repoRoot, resolvedUri) ?? undefined;
}

function getMarketplaceReadmeUri(repo: string, source: string): URI {
	const normalizedSource = source.trim().replace(/^\.?\/+|\/+$/g, '');
	const readmePath = normalizedSource ? `${normalizedSource}/README.md` : 'README.md';
	return URI.parse(`https://github.com/${repo}/blob/main/${readmePath}`);
}

function getMarketplaceReadmeFileUri(repoDir: URI, source: string): URI {
	const normalizedSource = source.trim().replace(/^\.?\/+|\/+$/g, '');
	return normalizedSource ? joinPath(repoDir, normalizedSource, 'README.md') : joinPath(repoDir, 'README.md');
}
