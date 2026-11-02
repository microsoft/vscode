/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';

const key = 'vscode.customizationDiscovery';

export interface ICustomizationDiscoveryMeta {
	readonly source: string;
	readonly sourceLabel?: string;
	readonly hookType?: string;
	readonly defaultEnabled?: boolean;
	readonly sourceId?: string;
	readonly pluginId?: string;
}

export function readCustomizationDiscoveryMeta(customization: { readonly _meta?: Record<string, unknown> }): ICustomizationDiscoveryMeta | undefined {
	const value = customization._meta?.[key];
	if (!isObject(value)) {
		return undefined;
	}
	const data = value as Record<string, unknown>;
	if (typeof data.source !== 'string') {
		return undefined;
	}
	return {
		source: data.source,
		sourceLabel: typeof data.sourceLabel === 'string' ? data.sourceLabel : undefined,
		hookType: typeof data.hookType === 'string' ? data.hookType : undefined,
		defaultEnabled: typeof data.defaultEnabled === 'boolean' ? data.defaultEnabled : undefined,
		sourceId: typeof data.sourceId === 'string' ? data.sourceId : undefined,
		pluginId: typeof data.pluginId === 'string' ? data.pluginId : undefined,
	};
}

export function withCustomizationDiscoveryMeta(meta: Record<string, unknown> | undefined, discovery: ICustomizationDiscoveryMeta | undefined): Record<string, unknown> {
	const result = { ...meta };
	if (discovery === undefined) {
		delete result[key];
	} else {
		result[key] = discovery;
	}
	return result;
}
