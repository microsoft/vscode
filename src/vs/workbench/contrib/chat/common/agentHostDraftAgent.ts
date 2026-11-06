/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { AGENT_HOST_FILE_SCHEME, getAgentPluginCacheRevision } from '../../../../platform/agentHost/common/agentPluginManager.js';
import type { IAgentHostResourceUriMapper } from '../../../../platform/agentHost/common/agentHostUri.js';
import { readClientPluginSourceUris } from '../../../../platform/agentHost/common/meta/clientPluginCustomizationMeta.js';
import { CustomizationLoadStatus, CustomizationType, type AgentCustomization, type Customization } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { getAgentHostCustomizationUri } from './agentHostSessionCustomizations.js';

/** Resolves persisted agent selections only after the tree can establish their URI ownership. */
export function resolveAgentHostDraftAgent(uri: URI, connection: { readonly clientId?: string; readonly resourceUris: IAgentHostResourceUriMapper }, customizations: readonly Customization[]): { readonly uri: URI; readonly agent?: AgentCustomization } | undefined {
	const legacy = resolveLegacyAgentSource(uri, connection, customizations);
	if (legacy !== undefined) {
		return legacy ?? undefined;
	}
	const agent = customizations.flatMap(customization => customization.children ?? [])
		.find((child): child is AgentCustomization => child.type === CustomizationType.Agent && isEqual(URI.parse(child.uri), uri));
	if (!agent && customizations.some(customization => customization.type === CustomizationType.Plugin
		&& (customization.load?.kind === CustomizationLoadStatus.Loading || customization.children === undefined && customization.load === undefined))) {
		return undefined;
	}
	const resolved = getAgentHostCustomizationUri(uri, connection, agent);
	return resolved ? { uri: resolved, agent } : undefined;
}

function resolveLegacyAgentSource(uri: URI, connection: { readonly clientId?: string; readonly resourceUris: IAgentHostResourceUriMapper }, customizations: readonly Customization[]): { readonly uri: URI; readonly agent?: AgentCustomization } | null | undefined {
	if (uri.scheme !== Schemas.file || uri.query || uri.fragment) {
		return undefined;
	}
	const parts = uri.path.split('/');
	const matches = new Map<string, { readonly uri: URI; readonly agent?: AgentCustomization }>();
	let matched = false;
	for (const customization of customizations) {
		if (customization.type !== CustomizationType.Plugin || !customization.clientId || URI.parse(customization.uri).scheme === AGENT_HOST_FILE_SCHEME) {
			continue;
		}
		const key = getAgentPluginCacheRevision(customization.uri);
		const index = parts.lastIndexOf(key);
		const relative = parts.slice(index + 2);
		if (index < 0 || !parts[index + 1] || relative[0] !== 'agents' || relative.length < 2 || relative.some(part => !part || part === '.' || part === '..')) {
			continue;
		}
		const source = readClientPluginSourceUris(customization).files[relative.join('/')];
		if (!source) {
			continue;
		}
		matched = true;
		const agent = customization.children?.find((child): child is AgentCustomization => child.type === CustomizationType.Agent && isEqual(URI.parse(child.uri), source));
		const resolved = getAgentHostCustomizationUri(source, connection, agent ?? customization);
		if (resolved) {
			matches.set(resolved.toString(), { uri: resolved, agent });
		}
	}
	return matches.size === 1 ? matches.values().next().value : matched ? null : undefined;
}
