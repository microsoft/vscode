/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import type { IAgentHostPluginManagementRequest, IAgentHostPluginManagementResult } from '../../common/agentHostPluginManagement.js';
import type { ICopilotPluginCommandApi } from './copilotCustomizationCommandDisplay.js';

/** Runs management against a session's resolved account, repository and managed-policy context. */
export async function manageCopilotPlugins(plugins: ICopilotPluginCommandApi, request: IAgentHostPluginManagementRequest): Promise<IAgentHostPluginManagementResult> {
	const messages: string[] = [];
	const catalog: IAgentHostPluginManagementResult['catalog'] = [];
	const target = request.target?.trim();
	if (request.operation !== 'list' && request.operation !== 'browse' && !target) {
		throw new Error(localize('pluginManagement.targetRequired', "A plugin source or identifier is required."));
	}
	if (request.operation === 'enable' || request.operation === 'disable') {
		const matches = (await plugins.list()).plugins.filter(plugin =>
			target === (plugin.marketplace ? `${plugin.name}@${plugin.marketplace}` : plugin.name) || target === plugin.name);
		if (matches.length !== 1 || !matches[0].marketplace) {
			throw new Error(localize('pluginManagement.toggleTargetInvalid', "Select one installed marketplace plugin to enable or disable."));
		}
	}
	switch (request.operation) {
		case 'install': {
			if (request.marketplaceSource) {
				const marketplace = target!.slice(target!.lastIndexOf('@') + 1);
				if (!target!.includes('@')) {
					throw new Error(localize('pluginManagement.marketplaceTargetInvalid', "A marketplace source requires a qualified plugin identifier."));
				}
				const registered = await plugins.marketplaces.list();
				if (!registered.marketplaces.some(candidate => candidate.name === marketplace)) {
					const added = await plugins.marketplaces.add({ source: request.marketplaceSource });
					if (added.name !== marketplace) {
						throw new Error(localize('pluginManagement.marketplaceMismatch', "The marketplace identifies itself as '{0}', not '{1}'. Refresh the catalog before installing.", added.name, marketplace));
					}
				}
			}
			const result = await plugins.install({ source: target! });
			if (result.deprecationWarning) {
				messages.push(result.deprecationWarning);
			}
			if (result.postInstallMessage) {
				messages.push(result.postInstallMessage);
			}
			break;
		}
		case 'uninstall':
			await plugins.uninstall({ name: target!, directSourceId: request.directSourceId });
			break;
		case 'update': {
			const matches = (await plugins.list()).plugins.filter(plugin => target === (plugin.marketplace ? `${plugin.name}@${plugin.marketplace}` : plugin.name));
			if (matches.length !== 1) {
				throw new Error(localize('pluginManagement.updateTargetInvalid', "Select one uniquely identified installed plugin to update."));
			}
			await plugins.update({ name: target! });
			break;
		}
		case 'enable':
			await plugins.enable({ names: [target!] });
			break;
		case 'disable':
			await plugins.disable({ names: [target!] });
			break;
		case 'browse':
			for (const marketplace of (await plugins.marketplaces.list()).marketplaces) {
				if (marketplace.available === false) {
					continue;
				}
				const result = await plugins.marketplaces.browse({ name: marketplace.name });
				catalog.push(...result.plugins.map(plugin => ({
					name: plugin.name,
					description: plugin.description,
					marketplace: marketplace.name,
					spec: `${plugin.name}@${marketplace.name}`,
				})));
			}
			break;
	}
	if (request.operation !== 'list' && request.operation !== 'browse') {
		await plugins.reload();
	}
	const installed = (await plugins.list()).plugins;
	if (request.operation === 'enable' || request.operation === 'disable') {
		const plugin = installed.find(plugin => target === (plugin.marketplace ? `${plugin.name}@${plugin.marketplace}` : plugin.name) || target === plugin.name);
		if (!plugin || plugin.enabled !== (request.operation === 'enable')) {
			throw new Error(localize('pluginManagement.toggleNotApplied', "The SDK did not apply the requested plugin enablement."));
		}
	}
	return {
		plugins: installed.map(plugin => {
			const spec = plugin.marketplace ? `${plugin.name}@${plugin.marketplace}` : plugin.name;
			const canUninstall = plugin.source !== 'builtin' && !plugin.managed && plugin.installed !== false && !plugin.installedFrom
				&& (!!plugin.marketplace || !!plugin.directSourceId || installed.filter(candidate => candidate.name === plugin.name).length === 1);
			return {
				name: plugin.name,
				marketplace: plugin.marketplace,
				spec,
				enabled: plugin.enabled,
				version: plugin.version,
				directSourceId: plugin.directSourceId,
				canToggle: !!plugin.marketplace && !plugin.managed && plugin.installed !== false,
				canUninstall,
				canUpdate: canUninstall && installed.filter(candidate => (candidate.marketplace ? `${candidate.name}@${candidate.marketplace}` : candidate.name) === spec).length === 1,
			};
		}),
		catalog,
		messages,
	};
}
