/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual, isEqualOrParent, joinPath, relativePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { AGENT_HOST_FILE_SCHEME, AUTOMATION_ACTIVE_CLIENT_ID, type ISyncedCustomization } from './agentPluginManager.js';
import { Schemas } from '../../../base/common/network.js';
import { readClientPluginSourceUris, readCustomizationUriClientIds, toCustomizationUriClientIdsMeta, toCustomizationUriClientMeta, type IClientPluginSourceUris } from './meta/clientPluginCustomizationMeta.js';
import { CustomizationType, type ChildCustomization, type Customization } from './state/sessionState.js';
import { parsePlugin, type IParsedPlugin } from '../../agentPlugins/common/pluginParsers.js';
import { IFileService } from '../../files/common/files.js';

/** Parses materialized content once, retaining local paths only for SDK operations. */
export async function parseSyncedPlugin(synced: ISyncedCustomization, clientId: string, fileService: IFileService, workspaceRoot: URI | undefined, userHome: URI, options?: { readonly deduplicateAgentsByName?: boolean }): Promise<IParsedPlugin> {
	const pluginDir = synced.pluginDir;
	if (!pluginDir) {
		throw new Error(`Plugin '${synced.customization.uri}' has not been materialized`);
	}
	const parsed = await parsePlugin(pluginDir, fileService, workspaceRoot, userHome, pluginDir, options);
	if (clientId === AUTOMATION_ACTIVE_CLIENT_ID) {
		return parsed;
	}
	const sources = readClientPluginSourceUris(synced.customization);
	const project = <T extends { readonly uri: URI; readonly customization: ChildCustomization }>(resource: T): T => {
		if (!isEqualOrParent(resource.uri, pluginDir, true)) {
			return resource;
		}
		return {
			...resource,
			uri: sourceUri(resource.uri, synced, sources),
			materializedUri: resource.uri,
			customization: {
				...resource.customization,
				uri: sourceUri(URI.parse(resource.customization.uri), synced, sources).toString(),
				_meta: { ...resource.customization._meta, ...toCustomizationUriClientMeta(clientId) },
			},
		};
	};
	return {
		...parsed,
		agents: parsed.agents.map(project),
		skills: parsed.skills.map(project),
		instructions: parsed.instructions.map(project),
		hooks: parsed.hooks.map(project),
		mcpServers: parsed.mcpServers.map(project),
	};
}

/** Resolves a materialized file to its source identity, without exposing the cache location. */
export function getCustomizationSourceUri(resource: URI, synced: ISyncedCustomization): URI {
	return sourceUri(resource, synced, readClientPluginSourceUris(synced.customization));
}

function sourceUri(resource: URI, synced: ISyncedCustomization, sources: IClientPluginSourceUris): URI {
	if (synced.customization.clientId === AUTOMATION_ACTIVE_CLIENT_ID) {
		return resource;
	}
	const path = synced.pluginDir && isEqualOrParent(resource, synced.pluginDir, true) ? relativePath(synced.pluginDir, resource) : undefined;
	if (path === undefined) {
		return resource;
	}
	let root = sources.root ?? URI.parse(synced.customization.uri);
	if (root.scheme === AGENT_HOST_FILE_SCHEME) {
		root = root.with({ scheme: Schemas.file });
	}
	const source = Object.hasOwn(sources.files, path) ? sources.files[path] : joinPath(root, path);
	return resource.fragment ? source.with({ fragment: resource.fragment }) : source;
}

/** Retains explicit source ownership when runtime deduplication chooses another client's copy. */
export function withClientCustomizationUriOwners<T extends Customization>(customization: T, contributions: readonly Customization[]): T {
	if (customization.type !== CustomizationType.Plugin || !customization.clientId || customization.clientId === AUTOMATION_ACTIVE_CLIENT_ID) {
		return customization;
	}
	const peers = contributions.filter(peer => peer.type === CustomizationType.Plugin && peer.clientId !== AUTOMATION_ACTIVE_CLIENT_ID
		&& isEqual(URI.parse(peer.uri), URI.parse(customization.uri)));
	const root = readClientPluginSourceUris(customization).root ?? URI.parse(customization.uri);
	const rootOwners = peers.flatMap(peer => peer.type === CustomizationType.Plugin && peer.clientId
		&& isEqual(readClientPluginSourceUris(peer).root ?? URI.parse(peer.uri), root) ? [peer.clientId] : []);
	if (new Set(rootOwners).size < 2) {
		return customization;
	}
	return {
		...customization,
		_meta: { ...customization._meta, ...toCustomizationUriClientIdsMeta(rootOwners) },
		children: customization.children?.map(child => {
			const owners = peers.flatMap(peer => (peer.children ?? []).filter(candidate => candidate.type === child.type
				&& isEqual(URI.parse(candidate.uri), URI.parse(child.uri))).flatMap(readCustomizationUriClientIds));
			return new Set(owners).size > 1 ? { ...child, _meta: { ...child._meta, ...toCustomizationUriClientIdsMeta(owners) } } : child;
		}),
	};
}
