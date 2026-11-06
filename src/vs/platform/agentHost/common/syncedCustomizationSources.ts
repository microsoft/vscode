/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqualOrParent, joinPath, relativePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { AGENT_HOST_FILE_SCHEME, type ISyncedCustomization } from './agentPluginManager.js';
import { toCustomizationSourceMeta } from './meta/customizationSourceMeta.js';
import type { ChildCustomization } from './state/sessionState.js';

/** Annotates synced children with client-side positions, preserving their host-readable identities. */
export function withSyncedCustomizationSources(children: readonly ChildCustomization[], synced: ISyncedCustomization): ChildCustomization[] {
	const sourceRoot = URI.parse(synced.customization.uri);
	const hostRoot = synced.pluginDir && URI.parse(synced.pluginDir.toString());
	if (!hostRoot || sourceRoot.scheme === AGENT_HOST_FILE_SCHEME) {
		return [...children];
	}
	return children.map(child => {
		const resource = URI.parse(child.uri);
		const path = isEqualOrParent(resource, hostRoot, true) ? relativePath(hostRoot, resource) : undefined;
		if (path === undefined) {
			return child;
		}
		const source = joinPath(sourceRoot, path).with({ fragment: resource.fragment });
		return { ...child, _meta: { ...child._meta, ...toCustomizationSourceMeta(source) } };
	});
}
