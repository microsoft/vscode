/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { joinPath, normalizePath, relativePath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { asJson, IRequestService } from '../../../../../platform/request/common/request.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatConfiguration } from '../constants.js';

export const enum MarketplaceType {
	Copilot = 'copilot',
	Claude = 'claude',
}

export interface IMarketplacePlugin {
	readonly name: string;
	readonly description: string;
	readonly version: string;
	/** Subdirectory within the repository where the plugin lives. */
	readonly source: string;
	/** The `owner/repo` identifier of the marketplace repository. */
	readonly marketplace: string;
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
	fetchMarketplacePlugins(token: CancellationToken): Promise<IMarketplacePlugin[]>;
}

/**
 * Marketplace definition files by type, checked in order per repository.
 * The first match determines the marketplace type.
 */
const MARKETPLACE_DEFINITIONS: { type: MarketplaceType; path: string }[] = [
	{ type: MarketplaceType.Copilot, path: '.github/plugin/marketplace.json' },
	{ type: MarketplaceType.Claude, path: '.claude-plugin/marketplace.json' },
];

export class PluginMarketplaceService implements IPluginMarketplaceService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IRequestService private readonly _requestService: IRequestService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async fetchMarketplacePlugins(token: CancellationToken): Promise<IMarketplacePlugin[]> {
		const repos: string[] = this._configurationService.getValue(ChatConfiguration.PluginMarketplaces) ?? [];
		const results = await Promise.all(
			repos
				.filter(repo => typeof repo === 'string' && /^[^/]+\/[^/]+$/.test(repo.trim()))
				.map(repo => this._fetchFromRepo(repo.trim(), token))
		);
		return results.flat();
	}

	private async _fetchFromRepo(repo: string, token: CancellationToken): Promise<IMarketplacePlugin[]> {
		for (const def of MARKETPLACE_DEFINITIONS) {
			if (token.isCancellationRequested) {
				return [];
			}
			const url = `https://raw.githubusercontent.com/${repo}/main/${def.path}`;
			try {
				const context = await this._requestService.request({ type: 'GET', url }, token);
				if (context.res.statusCode !== 200) {
					this._logService.debug(`[PluginMarketplaceService] ${url} returned status ${context.res.statusCode}, skipping`);
					continue;
				}
				const json = await asJson<IMarketplaceJson>(context);
				if (!json?.plugins || !Array.isArray(json.plugins)) {
					this._logService.debug(`[PluginMarketplaceService] ${url} did not contain a valid plugins array, skipping`);
					continue;
				}
				return json.plugins
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
							marketplace: repo,
							marketplaceType: def.type,
							readmeUri: getMarketplaceReadmeUri(repo, source),
						}];
					});
			} catch (err) {
				this._logService.debug(`[PluginMarketplaceService] Failed to fetch marketplace.json from ${url}:`, err);
				continue;
			}
		}
		this._logService.debug(`[PluginMarketplaceService] No marketplace.json found in ${repo}`);
		return [];
	}
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
