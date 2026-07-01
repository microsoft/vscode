/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Mutable } from '../../../../base/common/types.js';
import type { AgentCustomization } from '../state/protocol/state.js';

/**
 * Well-known typed view over a custom agent's `_meta` bag (see
 * `AgentCustomization._meta`), populated by the host's customization discovery
 * and read by the agents-window customization providers. Read it through
 * {@link readAgentCustomizationMeta} rather than indexing `_meta` directly.
 */
export interface IAgentCustomizationMeta {
	/**
	 * Whether the user may invoke this custom agent directly (e.g. from the
	 * agent picker). Absent is treated as `true` by convention — only an
	 * explicit `false` hides the agent from direct user invocation.
	 */
	readonly userInvocable?: boolean;
}

/**
 * Reads the well-known {@link IAgentCustomizationMeta} keys from a custom
 * agent's `_meta` bag, dropping unknown keys and wrong-typed values.
 */
export function readAgentCustomizationMeta(agent: AgentCustomization): IAgentCustomizationMeta {
	const meta = agent._meta;
	if (!meta) {
		return {};
	}
	const result: Mutable<IAgentCustomizationMeta> = {};
	if (typeof meta['userInvocable'] === 'boolean') {
		result.userInvocable = meta['userInvocable'];
	}
	return result;
}

/**
 * Serializes a typed {@link IAgentCustomizationMeta} into the `_meta` record,
 * dropping `undefined` entries and returning `undefined` when empty. Build a
 * custom agent's `_meta` through this so producers stay in lock-step with
 * {@link readAgentCustomizationMeta}.
 */
export function toAgentCustomizationMeta(meta: IAgentCustomizationMeta): Record<string, unknown> | undefined {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(meta)) {
		if (value !== undefined) {
			result[key] = value;
		}
	}
	return Object.keys(result).length > 0 ? result : undefined;
}
