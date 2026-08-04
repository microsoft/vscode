/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { DEFAULT_CUSTOMIZATION_ENABLED, sortCustomizationEnablement } from '../../common/customizationEnablement.js';
export interface CustomizationEnablementPolicy {
	readonly global?: Record<string, boolean>;
	readonly workingDirectories?: Record<string, Record<string, boolean>>;
}
import { CustomizationEnablementKind, CustomizationType, type CustomizationEnablement, type Customization, type McpServerCustomization, type PluginCustomization } from '../../common/state/protocol/channels-session/state.js';

export const MCP_TOP_LEVEL_CUSTOMIZATION_ID_PREFIX = 'mcp-top-level:';

/** Returns the primary working directory for a session's ordered directory set. */
export function getPrimaryWorkingDirectory(workingDirectories: readonly string[] | undefined): string | undefined {
	return workingDirectories?.[0];
}

/**
 * The host-internal policy key for an MCP server, derived from the identity of
 * whatever contributed it plus the server name.
 *
 * Deliberately NOT the customization id: a plugin-provided server's id embeds
 * the *materialized* plugin path (`…/agentPlugins/<source>/<nonce>/.mcp.json#mcp=<name>`),
 * whose nonce changes whenever the plugin's content changes and whose prefix
 * changes with the user-data directory. Keying on that would silently orphan a
 * user's disable — the server would quietly come back enabled — so we key on
 * `source`, the contributing plugin's stable source URI.
 *
 * `source` is absent for servers that have no contributing plugin (root config
 * and session-discovered servers); those fall back to the name alone, which is
 * also how the SDK identifies servers at runtime.
 */
export function mcpServerPolicyKey(source: string | undefined, name: string): string {
	return source ? `${source}#mcp=${encodeURIComponent(name)}` : `mcpServers#${encodeURIComponent(name)}`;
}

export function rootConfigMcpServerPolicyKey(name: string): string {
	return mcpServerPolicyKey(undefined, name);
}

/**
 * The minimum a customization must expose to be keyed and resolved. Deliberately
 * structural rather than a `Pick` over `Customization`: enablement applies to
 * child customizations (skills, agents, …) as well as top-level ones.
 */
export type CustomizationEnablementTarget = {
	readonly id: string;
	readonly type: CustomizationType;
	readonly name?: string;
	readonly enablement?: readonly CustomizationEnablement[];
};

/**
 * Returns the host-internal, stable policy key for an MCP customization.
 * This key must never be sent over the protocol.
 *
 * @param source stable source URI of the contributing plugin, when there is one.
 */
export function customizationPolicyKey(customization: CustomizationEnablementTarget, source?: string): string {
	return customization.type === CustomizationType.McpServer
		? mcpServerPolicyKey(source, customization.name!)
		: customization.id;
}

export function resolveEnablement(
	customization: CustomizationEnablementTarget,
	policy: CustomizationEnablementPolicy | undefined,
	workingDirectory: string | undefined,
	source?: string,
): Pick<McpServerCustomization, 'enabled' | 'enablement'> {
	return resolvePersistedMcpServerEnablement(customizationPolicyKey(customization, source), policy, workingDirectory, customization.enablement);
}

export function resolveRootConfigMcpServerEnablement(
	name: string,
	policy: CustomizationEnablementPolicy | undefined,
	workingDirectory: string | undefined,
): Pick<McpServerCustomization, 'enabled' | 'enablement'> {
	return resolvePersistedMcpServerEnablement(rootConfigMcpServerPolicyKey(name), policy, workingDirectory);
}

function resolvePersistedMcpServerEnablement(
	key: string,
	policy: CustomizationEnablementPolicy | undefined,
	workingDirectory: string | undefined,
	existingEnablement: readonly CustomizationEnablement[] | undefined = undefined,
): Pick<McpServerCustomization, 'enabled' | 'enablement'> {
	const session = existingEnablement?.find(entry => entry.kind === CustomizationEnablementKind.Session);
	const workspaceEnabled = workingDirectory ? workingDirectoryPolicy(policy, workingDirectory)?.[key] : undefined;
	const enablement = sortCustomizationEnablement([
		...(policy?.global?.[key] !== undefined ? [{ kind: CustomizationEnablementKind.Global, enabled: policy.global[key] }] as const : []),
		...(workingDirectory && workspaceEnabled !== undefined
			? [{ kind: CustomizationEnablementKind.Workspace, uri: workingDirectory, enabled: workspaceEnabled }] as const
			: []),
		...(session ? [session] : []),
	]);
	return { ...(enablement.length > 0 ? { enablement } : {}), enabled: enablement[0]?.enabled ?? DEFAULT_CUSTOMIZATION_ENABLED };
}

export function applyPersistedCustomizationEnablementPolicy(
	customizations: readonly Customization[],
	policy: CustomizationEnablementPolicy | undefined,
	workingDirectory: string | undefined,
	appliesTo: (customization: McpServerCustomization) => boolean = () => true,
): readonly Customization[] {
	return customizations.map(customization => {
		if (customization.type === CustomizationType.McpServer) {
			// Narrowed here rather than folding `appliesTo` into the condition, so the
			// remaining branch is known to be a container that actually has `children`.
			return appliesTo(customization) ? applyPersistedCustomizationEnablement(customization, policy, workingDirectory, undefined) : customization;
		}
		const container = customization.type === CustomizationType.Plugin
			? applyPersistedCustomizationEnablement(customization, policy, workingDirectory, undefined)
			: customization;
		let changed = container !== customization;
		const children = customization.children?.map(child => {
			const next = child.type === CustomizationType.McpServer && appliesTo(child)
				? applyPersistedCustomizationEnablement(child, policy, workingDirectory, customizationSource(customization))
				: child;
			changed ||= next !== child;
			return next;
		});
		return changed ? { ...container, children } : container;
	});
}

/**
 * The stable source identity a container contributes to its children's policy
 * keys. Only plugins have one: their `uri` is the URI the client published
 * (e.g. the plugin's repo folder), independent of where the host materializes
 * it on disk. Other containers (directories, session-discovered groups) have no
 * durable identity, so their children key on name alone.
 */
function customizationSource(container: Customization): string | undefined {
	return container.type === CustomizationType.Plugin ? container.uri : undefined;
}

export function updateCustomizationEnablementPolicy(
	policy: CustomizationEnablementPolicy | undefined,
	key: string,
	enablement: readonly CustomizationEnablement[],
	workingDirectory: string | undefined,
): CustomizationEnablementPolicy | undefined {
	const next: {
		global?: Record<string, boolean>;
		workingDirectories?: Record<string, Record<string, boolean>>;
	} = {
		...(policy?.global ? { global: { ...policy.global } } : {}),
		...(policy?.workingDirectories ? {
			workingDirectories: Object.fromEntries(
				Object.entries(policy.workingDirectories).map(([directory, values]) => [directory, { ...values }])
			),
		} : {}),
	};
	// Only decisions that differ from what would be inherited are stored: at global
	// scope the default is enabled, and a workspace decision inherits from global.
	// Storing a redundant entry would resolve identically but accumulate forever.
	const global = enablement.find(entry => entry.kind === CustomizationEnablementKind.Global);
	if (global && global.enabled !== DEFAULT_CUSTOMIZATION_ENABLED) {
		(next.global ??= {})[key] = global.enabled;
	} else {
		delete next.global?.[key];
	}
	const workspace = enablement.find((entry): entry is Extract<CustomizationEnablement, { kind: CustomizationEnablementKind.Workspace }> => entry.kind === CustomizationEnablementKind.Workspace);
	if (workingDirectory) {
		const normalized = normalizedWorkingDirectory(workingDirectory);
		const values = { ...(next.workingDirectories?.[normalized] ?? {}) };
		const inherited = next.global?.[key] ?? DEFAULT_CUSTOMIZATION_ENABLED;
		if (workspace === undefined || workspace.enabled === inherited) {
			delete values[key];
		} else {
			values[key] = workspace.enabled;
		}
		if (Object.keys(values).length === 0) {
			delete next.workingDirectories?.[normalized];
		} else {
			(next.workingDirectories ??= {})[normalized] = values;
		}
	}
	if (next.global && Object.keys(next.global).length === 0) {
		delete next.global;
	}
	if (next.workingDirectories && Object.keys(next.workingDirectories).length === 0) {
		delete next.workingDirectories;
	}
	return next.global || next.workingDirectories ? next : undefined;
}

function applyPersistedCustomizationEnablement<T extends McpServerCustomization | PluginCustomization>(
	customization: T,
	policy: CustomizationEnablementPolicy | undefined,
	workingDirectory: string | undefined,
	source: string | undefined,
): T {
	const enablement = resolveEnablement(customization, policy, workingDirectory, source);
	return customization.enabled === enablement.enabled
		&& customizationEnablementEquals(customization.enablement, enablement.enablement)
		? customization
		: applyResolvedEnablement(customization, enablement);
}

function applyResolvedEnablement<T extends McpServerCustomization | PluginCustomization>(
	customization: T,
	resolved: Pick<McpServerCustomization, 'enabled' | 'enablement'>,
): T {
	const updated = { ...customization, ...resolved };
	if (!resolved.enablement) {
		delete updated.enablement;
	}
	return updated;
}

export function customizationEnablementEquals(a: readonly CustomizationEnablement[] | undefined, b: readonly CustomizationEnablement[] | undefined): boolean {
	if ((a?.length ?? 0) !== (b?.length ?? 0)) {
		return false;
	}
	return (a ?? []).every(entry => (b ?? []).some(candidate =>
		entry.kind === candidate.kind
		&& entry.enabled === candidate.enabled
		&& (entry.kind !== CustomizationEnablementKind.Workspace || candidate.kind === CustomizationEnablementKind.Workspace && normalizedWorkingDirectory(entry.uri) === normalizedWorkingDirectory(candidate.uri))));
}

function normalizedWorkingDirectory(directory: string): string {
	return extUriBiasedIgnorePathCase.removeTrailingPathSeparator(
		extUriBiasedIgnorePathCase.normalizePath(URI.parse(directory))
	).toString();
}

function workingDirectoryPolicy(policy: CustomizationEnablementPolicy | undefined, directory: string): Record<string, boolean> | undefined {
	const key = normalizedWorkingDirectory(directory);
	return Object.entries(policy?.workingDirectories ?? {}).find(([candidate]) => normalizedWorkingDirectory(candidate) === key)?.[1];
}
