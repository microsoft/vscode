/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentModelInfo } from '../../agent.js';
import type { SessionModelInfo } from '../../state/protocol/state.js';

const metadataKey = 'vscode.modelConfiguration.defaults';

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
