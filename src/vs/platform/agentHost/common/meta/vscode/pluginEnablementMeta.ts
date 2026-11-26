/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';

const key = 'vscode.pluginEnablement';

export interface IRuntimePluginEnablement {
	readonly provider: string;
	readonly plugin: string;
	readonly globalEnabled: boolean;
	readonly effectiveEnabled?: boolean;
	/** Null inherits global state; absent means the host cannot report repository intent. */
	readonly repositoryEnabled?: boolean | null;
	readonly repositorySupported: boolean;
	readonly managedDesiredEnabled?: boolean;
	/** Host-owned installed-content revision, independent of activation. */
	readonly contentRevision?: string;
}

export function readRuntimePluginEnablement(customization: { readonly _meta?: Record<string, unknown> }): IRuntimePluginEnablement | undefined {
	const metadata = customization._meta?.[key];
	if (!isObject(metadata)) {
		return undefined;
	}
	const value = metadata as Record<string, unknown>;
	if (typeof value.provider !== 'string' || !value.provider || typeof value.plugin !== 'string' || !value.plugin
		|| typeof value.globalEnabled !== 'boolean' || typeof value.repositorySupported !== 'boolean'
		|| value.effectiveEnabled !== undefined && typeof value.effectiveEnabled !== 'boolean'
		|| value.repositoryEnabled !== undefined && value.repositoryEnabled !== null && typeof value.repositoryEnabled !== 'boolean'
		|| value.managedDesiredEnabled !== undefined && typeof value.managedDesiredEnabled !== 'boolean'
		|| value.contentRevision !== undefined && typeof value.contentRevision !== 'string') {
		return undefined;
	}
	return {
		provider: value.provider,
		plugin: value.plugin,
		globalEnabled: value.globalEnabled,
		effectiveEnabled: value.effectiveEnabled,
		...(value.repositoryEnabled === undefined ? {} : { repositoryEnabled: value.repositoryEnabled }),
		repositorySupported: value.repositorySupported,
		managedDesiredEnabled: value.managedDesiredEnabled,
		...(value.contentRevision === undefined ? {} : { contentRevision: value.contentRevision }),
	};
}

export function withRuntimePluginEnablement(meta: Record<string, unknown> | undefined, enablement: IRuntimePluginEnablement): Record<string, unknown> {
	return { ...meta, [key]: enablement };
}
