/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { isCustomizationEnabled } from '../../common/customizationEnablement.js';
import { CustomizationEnablementKind, CustomizationType, type ChildCustomization, type ClientPluginCustomization, type Customization, type CustomizationEnablement, type McpServerCustomization, type PluginCustomization } from '../../common/state/protocol/channels-session/state.js';
import { IAgentHostCustomizationEnablementService, type CustomizationEnablementResolution, type ICustomizationEnablementTarget } from '../agentHostCustomizationEnablementService.js';

export interface IResolvedCustomizationEnablement {
	readonly customizations: readonly Customization[];
	readonly pending: boolean;
	readonly pendingCustomizationIds: ReadonlySet<string>;
}

export function targetForPlugin(plugin: PluginCustomization): ICustomizationEnablementTarget {
	return {
		id: plugin.id,
		type: CustomizationType.Plugin,
		name: plugin.name,
		source: URI.parse(plugin.uri),
		isClientBundled: true,
	};
}

export function targetForMcpServer(server: McpServerCustomization, owningPluginUri: string | undefined, isClientBundled: boolean): ICustomizationEnablementTarget {
	return {
		id: server.id,
		type: CustomizationType.McpServer,
		name: server.name,
		source: URI.parse(server.uri),
		isClientBundled,
		...(owningPluginUri ? { owningPluginSource: URI.parse(owningPluginUri) } : {}),
	};
}

function isClientBundledMcpServer(childEnablement: Readonly<Record<string, readonly CustomizationEnablement[]>> | undefined, serverName: string): boolean {
	return childEnablement !== undefined && Object.hasOwn(childEnablement, serverName);
}

function applyResolution(customization: PluginCustomization, resolution: CustomizationEnablementResolution): { readonly customization: PluginCustomization; readonly pending: boolean };
function applyResolution(customization: McpServerCustomization, resolution: CustomizationEnablementResolution): { readonly customization: McpServerCustomization; readonly pending: boolean };
function applyResolution(customization: PluginCustomization | McpServerCustomization, resolution: CustomizationEnablementResolution): { readonly customization: PluginCustomization | McpServerCustomization; readonly pending: boolean } {
	if (resolution.kind === 'pending') {
		return {
			// Publication must not fabricate a scope while the host's durable
			// decision is loading. SDK-boundary consumers use `pending` to fail
			// closed; step 5 republishes when the enablement service settles.
			customization,
			pending: true,
		};
	}
	const { enablement: _enablement, ...withoutEnablement } = customization;
	return {
		customization: {
			...withoutEnablement,
			...(resolution.enablement.length > 0 ? { enablement: [...resolution.enablement] } : {}),
		},
		pending: false,
	};
}

function applyClientGlobal(
	service: IAgentHostCustomizationEnablementService,
	session: URI,
	target: ICustomizationEnablementTarget,
	enablement: readonly CustomizationEnablement[] | undefined,
): CustomizationEnablementResolution {
	if (enablement?.some(entry => entry.kind === CustomizationEnablementKind.Global) !== true) {
		return service.resolve(session.toString(), target);
	}
	return service.applyClientGlobalEnablement(session.toString(), target, enablement);
}

/**
 * Resolves the truthful published customization state. SDK-boundary consumers
 * must use {@link isCustomizationSdkEligible} to fail closed while pending.
 */
export function resolveCustomizationEnablement(
	service: IAgentHostCustomizationEnablementService,
	session: URI,
	customizations: readonly Customization[],
	clientChildEnablement?: ReadonlyMap<string, Readonly<Record<string, readonly CustomizationEnablement[]>>>,
	clientPlugins?: ReadonlyMap<string, ClientPluginCustomization>,
	mcpServerOwners?: ReadonlyMap<string, string>,
): IResolvedCustomizationEnablement {
	let pending = false;
	const pendingCustomizationIds = new Set<string>();
	const result = customizations.map(customization => {
		if (customization.type === CustomizationType.McpServer) {
			const owningPluginUri = mcpServerOwners?.get(customization.name);
			const isClientBundled = isClientBundledMcpServer(
				owningPluginUri === undefined ? undefined : clientChildEnablement?.get(owningPluginUri),
				customization.name,
			);
			const resolved = applyResolution(customization, service.resolve(session.toString(), targetForMcpServer(customization, owningPluginUri, isClientBundled)));
			pending ||= resolved.pending;
			if (resolved.pending) {
				pendingCustomizationIds.add(customization.id);
			}
			return resolved.customization;
		}
		if (customization.type !== CustomizationType.Plugin) {
			return customization;
		}
		const pluginResolution = applyResolution(customization, applyClientGlobal(service, session, targetForPlugin(customization), clientPlugins?.get(customization.uri)?.enablement));
		pending ||= pluginResolution.pending;
		if (pluginResolution.pending) {
			pendingCustomizationIds.add(customization.id);
		}
		let changed = pluginResolution.customization !== customization;
		const childEnablement = clientChildEnablement?.get(customization.uri);
		const children = pluginResolution.customization.children?.map(child => {
			if (child.type !== CustomizationType.McpServer) {
				return child;
			}
			const isClientBundled = isClientBundledMcpServer(childEnablement, child.name);
			const resolution = applyClientGlobal(
				service,
				session,
				targetForMcpServer(child, pluginResolution.customization.uri, isClientBundled),
				isClientBundled ? childEnablement![child.name] : undefined,
			);
			const resolved = applyResolution(child, resolution);
			pending ||= resolved.pending;
			if (resolved.pending) {
				// A plugin directory can cause the SDK to discover its child, so
				// exclude the container at the SDK handoff until it settles.
				pendingCustomizationIds.add(customization.id);
				pendingCustomizationIds.add(child.id);
			}
			changed ||= resolved.customization !== child;
			return resolved.customization;
		});
		return changed ? { ...pluginResolution.customization, children } : pluginResolution.customization;
	});
	return { customizations: result, pending, pendingCustomizationIds };
}

export function isCustomizationSdkEligible(resolved: IResolvedCustomizationEnablement, customization: Customization | ChildCustomization): boolean {
	return !resolved.pendingCustomizationIds.has(customization.id);
}

/**
 * Resolves every MCP server's SDK enablement, failing closed for an unresolved
 * decision or an ineligible containing plugin.
 */
export function getSdkMcpServerEnablement(resolved: IResolvedCustomizationEnablement): ReadonlyMap<string, boolean> {
	const result = new Map<string, boolean>();
	for (const customization of resolved.customizations) {
		if (customization.type === CustomizationType.McpServer) {
			result.set(customization.id, isCustomizationSdkEligible(resolved, customization) && isCustomizationEnabled(customization));
			continue;
		}
		const containerEnabled = isCustomizationSdkEligible(resolved, customization)
			&& (customization.type === CustomizationType.Directory ? customization.enabled : isCustomizationEnabled(customization));
		for (const child of customization.children ?? []) {
			if (child.type === CustomizationType.McpServer) {
				result.set(child.id, containerEnabled && isCustomizationSdkEligible(resolved, child) && isCustomizationEnabled(child));
			}
		}
	}
	return result;
}

/**
 * Records the client-authoritative Global decisions on a parsed plugin and its
 * discovered MCP children without touching host-owned Workspace or Session data.
 */
export function recordClientPluginEnablement(
	service: IAgentHostCustomizationEnablementService,
	session: URI,
	plugin: PluginCustomization,
	clientPlugin: ClientPluginCustomization,
): void {
	applyClientGlobal(service, session, targetForPlugin(plugin), clientPlugin.enablement);
	const childEnablement = clientPlugin.childEnablement;
	for (const child of plugin.children ?? []) {
		if (child.type === CustomizationType.McpServer) {
			const isClientBundled = isClientBundledMcpServer(childEnablement, child.name);
			applyClientGlobal(service, session, targetForMcpServer(child, plugin.uri, isClientBundled), isClientBundled ? childEnablement![child.name] : undefined);
		}
	}
}
