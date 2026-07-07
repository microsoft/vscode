/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { AgentPluginDiscoveryPriority, IAgentPlugin } from './agentPluginService.js';
import { IGitHubPluginSource, IGitUrlPluginSource, IMarketplacePlugin, INpmPluginSource, IPipPluginSource, PluginSourceKind } from './pluginMarketplaceService.js';
import { type IMarketplaceReference } from './marketplaceReference.js';
import { CollisionEnablementModel, IEnablementModel } from '../enablement.js';

export interface IDiscoveredAgentPlugins {
	readonly plugins: readonly IAgentPlugin[];
	readonly priority: AgentPluginDiscoveryPriority;
	readonly order: number;
}

interface IAgentPluginCandidate {
	readonly plugin: IAgentPlugin;
	readonly priority: AgentPluginDiscoveryPriority;
	readonly order: number;
	readonly pluginOrder: number;
	readonly canonicalKey: string;
}

/**
 * Path fragment that identifies a Copilot-CLI-installed plugin. Mirrored by
 * `ConfiguredAgentPluginDiscovery._resolveEnterprisePluginId`.
 */
const COPILOT_CLI_INSTALL_PATH_FRAGMENT = '/.copilot/installed-plugins/';

export class AgentPluginCollisionEnablementModel extends CollisionEnablementModel {
	constructor(base: IEnablementModel, collisionGroups: IObservable<ReadonlyMap<string, readonly string[]>>) {
		super(base, collisionGroups);
	}
}

export function getSortedAgentPlugins(discoveries: readonly IDiscoveredAgentPlugins[]): readonly IAgentPlugin[] {
	return getUniqueAgentPluginCandidates(discoveries)
		.map(candidate => candidate.plugin)
		.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
}

export function getCanonicalAgentPluginCollisionGroups(discoveries: readonly IDiscoveredAgentPlugins[], isBlocked?: (plugin: IAgentPlugin) => boolean): ReadonlyMap<string, readonly string[]> {
	const candidates = getUniqueAgentPluginCandidates(discoveries);
	const byCanonicalKey = new Map<string, string[]>();
	for (const candidate of candidates) {
		if (isBlocked?.(candidate.plugin)) {
			continue;
		}
		let group = byCanonicalKey.get(candidate.canonicalKey);
		if (!group) {
			group = [];
			byCanonicalKey.set(candidate.canonicalKey, group);
		}
		group.push(candidate.plugin.uri.toString());
	}

	const groups = new Map<string, readonly string[]>();
	for (const group of byCanonicalKey.values()) {
		if (group.length < 2) {
			continue;
		}
		for (const key of group) {
			groups.set(key, group);
		}
	}
	return groups;
}

/**
 * Whether the `ChatEnabledPlugins` enterprise policy explicitly blocks this plugin.
 *
 * The policy is a **deny list**, not an allowlist: enterprise-managed `enabledPlugins` entries
 * add to (never replace) the plugins a user has installed. A plugin is blocked only when its
 * policy id is mapped to `false`; entries mapped to `true` enable the plugin, and a plugin the
 * policy never mentions is left to the user's own enablement. This keeps a customer's existing
 * plugins working when their enterprise deploys `enabledPlugins` for a different plugin.
 */
export function isAgentPluginBlockedByPolicy(
	plugin: IAgentPlugin,
	enabledPluginsPolicy: Record<string, boolean> | undefined,
): boolean {
	const pluginId = getAgentPluginPolicyId(plugin);
	return pluginId !== undefined && enabledPluginsPolicy?.[pluginId] === false;
}

export function getAgentPluginPolicyId(plugin: IAgentPlugin): string | undefined {
	const identity = getPolicyIdentity(plugin);
	return identity ? `${identity.name}@${identity.marketplace}` : undefined;
}

function getAgentPluginCandidates(discoveries: readonly IDiscoveredAgentPlugins[]): IAgentPluginCandidate[] {
	const candidates: IAgentPluginCandidate[] = [];
	for (const discovery of discoveries) {
		for (let pluginOrder = 0; pluginOrder < discovery.plugins.length; pluginOrder++) {
			const plugin = discovery.plugins[pluginOrder];
			candidates.push({
				plugin,
				priority: discovery.priority,
				order: discovery.order,
				pluginOrder,
				canonicalKey: getCanonicalPluginIdentity(plugin),
			});
		}
	}

	return candidates.sort((a, b) =>
		a.priority - b.priority
		|| a.order - b.order
		|| a.pluginOrder - b.pluginOrder
		|| a.plugin.uri.toString().localeCompare(b.plugin.uri.toString())
	);
}

function getUniqueAgentPluginCandidates(discoveries: readonly IDiscoveredAgentPlugins[]): IAgentPluginCandidate[] {
	const unique: IAgentPluginCandidate[] = [];
	const seen = new Set<string>();
	for (const candidate of getAgentPluginCandidates(discoveries)) {
		const key = candidate.plugin.uri.toString();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		unique.push(candidate);
	}
	return unique;
}

function getCanonicalPluginIdentity(plugin: IAgentPlugin): string {
	return getMarketplaceCanonicalIdentity(plugin.fromMarketplace)
		?? getCopilotCliInstallCanonicalIdentity(plugin)
		?? `uri:${plugin.uri.toString()}`;
}

function getMarketplaceCanonicalIdentity(plugin: IMarketplacePlugin | undefined): string | undefined {
	if (!plugin) {
		return undefined;
	}

	const normalizedName = normalizePluginIdentitySegment(plugin.name);
	const source = plugin.sourceDescriptor;
	switch (source.kind) {
		case PluginSourceKind.RelativePath: {
			if (plugin.marketplaceReference.githubRepo) {
				return `github:${plugin.marketplaceReference.githubRepo.toLowerCase()}|${normalizedName}`;
			}
			return `marketplace:${plugin.marketplaceReference.canonicalId}|${normalizedName}`;
		}
		case PluginSourceKind.GitHub: {
			const github = source as IGitHubPluginSource;
			return `github:${github.repo.toLowerCase()}|${normalizedName}`;
		}
		case PluginSourceKind.GitUrl: {
			const git = source as IGitUrlPluginSource;
			return `git:${git.url.toLowerCase()}|${normalizedName}`;
		}
		case PluginSourceKind.Npm: {
			const npm = source as INpmPluginSource;
			return `npm:${npm.package.toLowerCase()}|${normalizedName}`;
		}
		case PluginSourceKind.Pip: {
			const pip = source as IPipPluginSource;
			return `pip:${pip.package.toLowerCase()}|${normalizedName}`;
		}
	}
}

function getCopilotCliInstallCanonicalIdentity(plugin: IAgentPlugin): string | undefined {
	if (plugin.uri.scheme !== 'file') {
		return undefined;
	}

	const idx = plugin.uri.path.indexOf(COPILOT_CLI_INSTALL_PATH_FRAGMENT);
	if (idx === -1) {
		return undefined;
	}

	const segments = plugin.uri.path.slice(idx + COPILOT_CLI_INSTALL_PATH_FRAGMENT.length).split('/').filter(s => s.length > 0);
	if (segments.length !== 2) {
		return undefined;
	}

	const [bucket, installName] = segments;
	const normalizedName = normalizePluginIdentitySegment(plugin.label || installName);
	if (bucket !== '_direct') {
		return `copilot-cli-marketplace:${normalizePluginIdentitySegment(bucket)}|${normalizedName}`;
	}

	const match = /^(?<owner>.+)--(?<repo>.+)--(?<plugin>.+)$/.exec(installName);
	const groups = match?.groups;
	if (!groups) {
		return undefined;
	}

	return `github:${groups.owner.toLowerCase()}/${groups.repo.toLowerCase()}|${normalizePluginIdentitySegment(groups.plugin)}`;
}

function normalizePluginIdentitySegment(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9_.:-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^[-:.]+|[-:.]+$/g, '');
}

interface IPolicyIdentity {
	readonly name: string;
	readonly marketplace: string;
	readonly marketplaceReference?: IMarketplaceReference;
}

function getPolicyIdentity(plugin: IAgentPlugin): IPolicyIdentity | undefined {
	const m = plugin.fromMarketplace;
	if (m) {
		return { name: m.name, marketplace: m.marketplace, marketplaceReference: m.marketplaceReference };
	}
	if (plugin.uri.scheme !== 'file') {
		return undefined;
	}
	const idx = plugin.uri.path.indexOf(COPILOT_CLI_INSTALL_PATH_FRAGMENT);
	if (idx === -1) {
		return undefined;
	}
	const segments = plugin.uri.path.slice(idx + COPILOT_CLI_INSTALL_PATH_FRAGMENT.length).split('/').filter(s => s.length > 0);
	if (segments.length !== 2) {
		return undefined;
	}
	const [marketplace, name] = segments;
	if (marketplace === '_direct') {
		return undefined;
	}
	return { name, marketplace };
}
