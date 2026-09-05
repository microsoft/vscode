/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IAgentModelInfo } from './agent.js';
import type { SessionModelInfo } from './state/protocol/state.js';

/** Well-known source id for models provided by a user's ChatGPT subscription. */
export const CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID = 'chatgptSubscription';

/** Well-known key carrying a model's source id under its open `_meta` bag. */
export const AGENT_MODEL_SOURCE_ID_META_KEY = 'modelSourceId';

/**
 * Builds a `_meta` payload carrying a model source id, or `undefined` when the
 * producer cannot confidently identify the source.
 */
export function createAgentModelSourceMeta(sourceId: string | undefined): Record<string, unknown> | undefined {
	return sourceId !== undefined ? { [AGENT_MODEL_SOURCE_ID_META_KEY]: sourceId } : undefined;
}

/** Reads a model source id from the open `_meta` bag, ignoring invalid values. */
export function readAgentModelSourceId(model: IAgentModelInfo | SessionModelInfo): string | undefined {
	const meta = model._meta;
	if (!meta) {
		return undefined;
	}
	const value = meta[AGENT_MODEL_SOURCE_ID_META_KEY];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Well-known key carrying a model's picker-group vendor id under its open `_meta` bag. */
export const AGENT_MODEL_GROUP_ID_META_KEY = 'modelGroupId';

/**
 * Builds a `_meta` payload carrying a model's picker-group vendor id.
 *
 * A producer stamps this when a model's owning agent provider (used for session
 * routing) differs from the vendor its picker group should resolve under — e.g.
 * a Claude model is owned by the `claude` agent but groups under `copilot` or
 * `anthropic` by its transport. Keeping the group id in `_meta` leaves
 * {@link IAgentModelInfo.provider} free to stay the routing owner.
 */
export function createAgentModelGroupMeta(groupId: string): Record<string, unknown> {
	return { [AGENT_MODEL_GROUP_ID_META_KEY]: groupId };
}

/** Reads a model's picker-group vendor id from the open `_meta` bag, ignoring invalid values. */
export function readAgentModelGroupId(model: IAgentModelInfo | SessionModelInfo): string | undefined {
	const meta = model._meta;
	if (!meta) {
		return undefined;
	}
	const value = meta[AGENT_MODEL_GROUP_ID_META_KEY];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}
