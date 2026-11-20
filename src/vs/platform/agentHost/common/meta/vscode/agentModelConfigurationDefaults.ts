/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentModelInfo } from '../../agent.js';
import type { SessionModelInfo } from '../../state/protocol/state.js';
import { isObject } from '../../../../../base/common/types.js';

const metadataKey = 'vscode.modelConfiguration.defaults';
const managedMetadataKey = 'vscode.modelConfiguration.managedDefaults';

export interface IAgentManagedModelDefaults {
	readonly model: boolean;
	readonly keys: readonly string[];
}

export function withAgentManagedModelDefaults(meta: Record<string, unknown> | undefined, defaults: IAgentManagedModelDefaults): Record<string, unknown> {
	return { ...meta, [managedMetadataKey]: defaults };
}

export function readAgentManagedModelDefaults(model: IAgentModelInfo | SessionModelInfo): IAgentManagedModelDefaults | undefined {
	const value = model._meta?.[managedMetadataKey];
	if (!isObject(value)) {
		return undefined;
	}
	const fields: { model?: unknown; keys?: unknown } = value;
	if (typeof fields.model !== 'boolean' || !Array.isArray(fields.keys)
		|| !fields.keys.every((key): key is string => typeof key === 'string' && Object.hasOwn(model.configSchema?.properties ?? {}, key))) {
		return undefined;
	}
	return { model: fields.model, keys: [...new Set(fields.keys)] };
}

/** Marks options whose displayed defaults must remain distinguishable from user selections. */
export function withAgentModelConfigurationDefaults(meta: Record<string, unknown> | undefined, keys: readonly string[]): Record<string, unknown> {
	return { ...meta, [metadataKey]: [...keys] };
}

export function readAgentModelConfigurationDefaults(model: IAgentModelInfo | SessionModelInfo): readonly string[] | undefined {
	const keys = model._meta?.[metadataKey];
	if (!Array.isArray(keys) || !keys.every((key): key is string => typeof key === 'string' && Object.hasOwn(model.configSchema?.properties ?? {}, key))) {
		return undefined;
	}
	return [...new Set(keys)];
}
