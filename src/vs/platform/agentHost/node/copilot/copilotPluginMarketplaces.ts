/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession } from '@github/copilot-sdk';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { compare as compareStrings } from '../../../../base/common/strings.js';
import type { IAgentPluginInstallResult, IAgentPluginMarketplaceItem, IAgentPluginMarketplaceSnapshot } from '../../common/agent.js';
import { sanitizeConnectionDiagnosticText } from '../../common/connectionDiagnostics.js';

export interface ICopilotPluginMarketplaceRpc {
	readonly list: CopilotSession['rpc']['plugins']['list'];
	readonly install: CopilotSession['rpc']['plugins']['install'];
	readonly reload: CopilotSession['rpc']['plugins']['reload'];
	readonly marketplaces: {
		readonly list: CopilotSession['rpc']['plugins']['marketplaces']['list'];
		readonly browse: CopilotSession['rpc']['plugins']['marketplaces']['browse'];
		readonly refresh: CopilotSession['rpc']['plugins']['marketplaces']['refresh'];
	};
}

export async function getCopilotPluginMarketplaceSnapshot(rpc: ICopilotPluginMarketplaceRpc): Promise<IAgentPluginMarketplaceSnapshot> {
	let listedMarketplaces: Awaited<ReturnType<ICopilotPluginMarketplaceRpc['marketplaces']['list']>>['marketplaces'];
	let installedPlugins: Awaited<ReturnType<ICopilotPluginMarketplaceRpc['list']>>['plugins'];
	try {
		[{ marketplaces: listedMarketplaces }, { plugins: installedPlugins }] = await Promise.all([
			rpc.marketplaces.list(),
			rpc.list(),
		]);
	} catch (error) {
		throw safePluginMarketplaceError('Failed to list plugin marketplaces', error);
	}
	const marketplaces = [...listedMarketplaces].sort((left, right) => compareStrings(left.name, right.name) || compareStrings(left.source, right.source));
	const installedSources = new Set(installedPlugins
		.filter(plugin => plugin.installed !== false)
		.map(plugin => `${plugin.name}@${plugin.marketplace}`));
	const plugins: IAgentPluginMarketplaceItem[] = [];
	const failures: IAgentPluginMarketplaceSnapshot['failures'][number][] = [];
	for (const marketplace of marketplaces) {
		if (marketplace.available === false) {
			continue;
		}
		try {
			const result = await rpc.marketplaces.browse({ name: marketplace.name });
			for (const plugin of [...result.plugins].sort((left, right) => compareStrings(left.name, right.name))) {
				const source = `${plugin.name}@${marketplace.name}`;
				plugins.push({
					name: plugin.name,
					...(plugin.description !== undefined ? { description: plugin.description } : {}),
					marketplace: marketplace.name,
					installed: installedSources.has(source),
					source,
				});
			}
		} catch (error) {
			failures.push({
				marketplace: marketplace.name,
				error: sanitizeConnectionDiagnosticText(getErrorMessage(error)) || 'Marketplace browse failed.',
			});
		}
	}
	return {
		marketplaces: marketplaces.map(marketplace => ({
			name: marketplace.name,
			source: sanitizeConnectionDiagnosticText(marketplace.source),
			...(marketplace.isDefault !== undefined ? { isDefault: marketplace.isDefault } : {}),
			...(marketplace.managed !== undefined ? { managed: marketplace.managed } : {}),
			...(marketplace.available !== undefined ? { available: marketplace.available } : {}),
		})),
		plugins,
		failures,
	};
}

export async function refreshCopilotPluginMarketplaces(rpc: ICopilotPluginMarketplaceRpc, marketplace?: string): Promise<IAgentPluginMarketplaceSnapshot> {
	try {
		await rpc.marketplaces.refresh(marketplace === undefined ? undefined : { name: marketplace });
	} catch (error) {
		throw safePluginMarketplaceError('Failed to refresh plugin marketplaces', error);
	}
	return getCopilotPluginMarketplaceSnapshot(rpc);
}

export async function installCopilotPlugin(rpc: ICopilotPluginMarketplaceRpc, source: string): Promise<IAgentPluginInstallResult> {
	let result: Awaited<ReturnType<ICopilotPluginMarketplaceRpc['install']>>;
	try {
		result = await rpc.install({ source });
		await rpc.reload();
	} catch (error) {
		throw safePluginMarketplaceError('Failed to install plugin', error);
	}
	return {
		...(result.postInstallMessage !== undefined ? { postInstallMessage: result.postInstallMessage } : {}),
		...(result.deprecationWarning !== undefined ? { deprecationWarning: result.deprecationWarning } : {}),
	};
}

function safePluginMarketplaceError(prefix: string, error: unknown): Error {
	const message = sanitizeConnectionDiagnosticText(getErrorMessage(error));
	return new Error(message ? `${prefix}: ${message}` : prefix);
}
