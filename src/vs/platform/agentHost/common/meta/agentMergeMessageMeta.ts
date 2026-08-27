/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const AGENT_MERGE_MESSAGE_META_KEY = 'vscode.chat.agentMerge';

interface IHasAgentMergeMessageMeta {
	readonly _meta?: Record<string, unknown>;
}

/**
 * Whether Agent Merge produced the message, i.e. whether the turn it starts is
 * an automated repair run rather than one a person or an agent asked for.
 *
 * Agent Merge prompts carry the protocol's `systemNotification` origin, which
 * they share with every other host-generated message, so this marker is what
 * tells them apart.
 */
export function isAgentMergeMessage(source: IHasAgentMergeMessageMeta): boolean {
	// eslint-disable-next-line local/code-no-untyped-meta-access -- sanctioned first hop into the namespaced Agent Merge slot; validated here.
	return source._meta?.[AGENT_MERGE_MESSAGE_META_KEY] === true;
}

/** Serializes the Agent Merge message marker for the open protocol bag. */
export function toAgentMergeMessageMeta(): Record<string, unknown> {
	return { [AGENT_MERGE_MESSAGE_META_KEY]: true };
}
