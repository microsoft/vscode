/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Mutable } from '../../../../../base/common/types.js';
import { isEqualOrParent, joinPath, relativePath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { CustomizationType, type AgentCustomization, type ChildCustomization } from '../../state/protocol/state.js';

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
	/** Ordered authored model preferences, including alternatives to the standard `model` field. */
	readonly 'vscode.models'?: readonly string[];
	/** Authored reasoning preference; omitted means inherit the selected model's configuration. */
	readonly 'vscode.reasoningEffort'?: string;
	readonly 'vscode.modelPolicy'?: 'preferred' | 'required';
	/** Guidance for the Assisted permissions judge while this agent is selected (`vscode: assisted-approval-instructions`). */
	readonly 'vscode.assistedApprovalInstructions'?: string;
	/** Authored hint shown in the empty chat input while the agent is selected (`argument-hint`). */
	readonly 'vscode.argumentHint'?: string;
	readonly 'vscode.welcomeMessage'?: string;
	/** Client-supplied file URI before host materialization, used only to recover local provenance. */
	readonly 'vscode.sourceUri'?: string;
}

/**
 * Reads the well-known {@link IAgentCustomizationMeta} keys from a custom
 * agent's `_meta` bag, dropping unknown keys and wrong-typed values.
 */
export function readAgentCustomizationMeta(agent: AgentCustomization): IAgentCustomizationMeta {
	const meta = agent._meta;
	const result: Mutable<IAgentCustomizationMeta> = {};
	const models = meta?.['vscode.models'];
	if (Array.isArray(models) && models.every((model): model is string => typeof model === 'string')) {
		result['vscode.models'] = models;
	}
	if (typeof meta?.['vscode.reasoningEffort'] === 'string') {
		result['vscode.reasoningEffort'] = meta['vscode.reasoningEffort'];
	}
	if (meta?.['vscode.modelPolicy'] === 'preferred' || meta?.['vscode.modelPolicy'] === 'required') {
		result['vscode.modelPolicy'] = meta['vscode.modelPolicy'];
	}
	if (typeof meta?.['vscode.assistedApprovalInstructions'] === 'string') {
		result['vscode.assistedApprovalInstructions'] = meta['vscode.assistedApprovalInstructions'];
	}
	if (typeof meta?.['vscode.argumentHint'] === 'string') {
		result['vscode.argumentHint'] = meta['vscode.argumentHint'];
	}
	if (typeof meta?.['vscode.welcomeMessage'] === 'string' && meta['vscode.welcomeMessage'].trim()) {
		result['vscode.welcomeMessage'] = meta['vscode.welcomeMessage'];
	}
	if (meta?.['vscode.chatMode'] === 'ask') {
		result['vscode.chatMode'] = 'ask';
	}
	if (agent.disableUserInvocation === true) {
		result.userInvocable = false;
	} else if (typeof meta?.userInvocable === 'boolean') {
		result.userInvocable = meta.userInvocable;
	}
	const sourceUri = readCustomizationSourceUri(agent);
	if (sourceUri !== undefined) {
		result['vscode.sourceUri'] = sourceUri;
	}
	return result;
}

/** Reads optional client-side provenance without changing the host-authored child URI. */
export function readCustomizationSourceUri(child: ChildCustomization): string | undefined {
	const sourceUri = child._meta?.['vscode.sourceUri'];
	if (typeof sourceUri === 'string') {
		try {
			URI.parse(sourceUri, true);
			return sourceUri;
		} catch {
			// Malformed optional provenance does not affect the child's identity.
		}
	}
	return undefined;
}

/** Records the client-side counterpart of a child parsed from a materialized plugin. */
export function withCustomizationSourceUri(child: ChildCustomization, materializedRoot: URI, sourceRoot: URI): ChildCustomization {
	if (child.type === CustomizationType.McpServer) {
		return child;
	}
	const resource = URI.parse(child.uri);
	const path = isEqualOrParent(resource, materializedRoot) ? relativePath(materializedRoot, resource) : undefined;
	return path === undefined ? child : {
		...child,
		_meta: { ...child._meta, 'vscode.sourceUri': joinPath(sourceRoot, path).toString() },
	};
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
