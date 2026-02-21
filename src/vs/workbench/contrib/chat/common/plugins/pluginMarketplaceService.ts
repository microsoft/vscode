/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { asJson, IRequestService } from '../../../../../platform/request/common/request.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatConfiguration } from '../constants.js';

export interface IMarketplacePlugin {
	readonly name: string;
	readonly description: string;
	readonly version: string;
	readonly source: string;
	readonly marketplace: string;
	readonly readmeUri?: URI;
}

interface IMarketplaceJson {
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
 * Paths within a repository where marketplace.json can be found, checked in order.
 */
const MARKETPLACE_JSON_PATHS = [
	'.github/plugin/marketplace.json',
	'.claude-plugin/marketplace.json',
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
		for (const jsonPath of MARKETPLACE_JSON_PATHS) {
			if (token.isCancellationRequested) {
				return [];
			}
			const url = `https://raw.githubusercontent.com/${repo}/main/${jsonPath}`;
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
					.map(p => {
						const source = p.source ?? '';
						return {
							name: p.name,
							description: p.description ?? '',
							version: p.version ?? '',
							source,
							marketplace: repo,
							readmeUri: getMarketplaceReadmeUri(repo, source),
						};
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

function getMarketplaceReadmeUri(repo: string, source: string): URI {
	const normalizedSource = source.trim().replace(/^\/+|\/+$/g, '');
	const readmePath = normalizedSource ? `${normalizedSource}/README.md` : 'README.md';
	return URI.parse(`https://github.com/${repo}/blob/main/${readmePath}`);
}
