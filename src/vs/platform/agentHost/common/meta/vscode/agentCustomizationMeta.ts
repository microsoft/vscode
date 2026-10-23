/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Mutable } from '../../../../../base/common/types.js';
import type { AgentCustomization } from '../../state/protocol/state.js';

/**
 * Well-known typed view over a custom agent's `_meta` bag (see
 * `AgentCustomization._meta`), populated by the host's customization discovery
 * and read by the agents-window customization providers. Read it through
 * {@link readAgentCustomizationMeta} rather than indexing `_meta` directly.
 */
export interface IAgentCustomizationMeta {
	/** Identifies a host-provided read-only Ask mode independently of its name or URI. */
	readonly 'vscode.chatMode'?: 'ask';
	/**
	 * Whether the user may invoke this custom agent directly (e.g. from the
	 * agent picker). Absent is treated as `true` by convention — only an
	 * explicit `false` hides the agent from direct user invocation.
	 */
	readonly userInvocable?: boolean;
	/** VS Code extension: ordered model preferences from the agent file's frontmatter `model`; the first available one applies. */
	readonly 'vscode.models'?: readonly string[];
	/** VS Code extension: the agent file's frontmatter `reasoning-effort`. */
	readonly 'vscode.reasoningEffort'?: string;
}

/**
 * Reads the well-known {@link IAgentCustomizationMeta} keys from a custom
 * agent's `_meta` bag, dropping unknown keys and wrong-typed values.
 */
export function readAgentCustomizationMeta(agent: AgentCustomization): IAgentCustomizationMeta {
	const meta = agent._meta;
	const result: Mutable<IAgentCustomizationMeta> = {};
	if (meta?.['vscode.chatMode'] === 'ask') {
		result['vscode.chatMode'] = 'ask';
	}
	if (agent.disableUserInvocation === true) {
		result.userInvocable = false;
	} else if (typeof meta?.userInvocable === 'boolean') {
		result.userInvocable = meta.userInvocable;
	}
	const models = meta?.['vscode.models'];
	if (Array.isArray(models) && models.length > 0 && models.every(model => typeof model === 'string' && model.length > 0)) {
		result['vscode.models'] = models;
	}
	const reasoningEffort = meta?.['vscode.reasoningEffort'];
	if (typeof reasoningEffort === 'string' && reasoningEffort) {
		result['vscode.reasoningEffort'] = reasoningEffort;
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
