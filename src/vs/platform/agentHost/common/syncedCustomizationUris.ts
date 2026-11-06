/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqualOrParent, joinPath, relativePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { AGENT_HOST_FILE_SCHEME, AUTOMATION_ACTIVE_CLIENT_ID, type ISyncedCustomization } from './agentPluginManager.js';
import { Schemas } from '../../../base/common/network.js';
import { readClientPluginSourceUris, toCustomizationUriClientMeta, type IClientPluginSourceUris } from './meta/clientPluginCustomizationMeta.js';
import type { ChildCustomization } from './state/sessionState.js';

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

/** Publishes source identities only for files actually contained in the materialized plugin. */
export function toSourceCustomizations(children: readonly ChildCustomization[], synced: ISyncedCustomization, clientId: string): ChildCustomization[] {
	if (clientId === AUTOMATION_ACTIVE_CLIENT_ID) {
		return [...children];
	}
	const sources = readClientPluginSourceUris(synced.customization);
	return children.map(child => {
		const resource = URI.parse(child.uri);
		if (!synced.pluginDir || !isEqualOrParent(resource, synced.pluginDir, true)) {
			return child;
		}
		return {
			...child,
			uri: sourceUri(resource, synced, sources).toString(),
			_meta: { ...child._meta, ...toCustomizationUriClientMeta(clientId) },
		};
	});
}
