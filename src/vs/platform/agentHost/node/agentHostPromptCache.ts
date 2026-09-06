/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { readSessionPromptCacheState, withSessionPromptCacheState, type ISessionPromptCacheState } from '../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';

export const IAgentHostPromptCache = createDecorator<IAgentHostPromptCache>('agentHostPromptCache');

/**
 * Read/write seam over the host-owned prompt-cache slot of a session's `_meta`,
 * so a provider tracking prompt-cache warmth need not inject the whole
 * {@link AgentHostStateManager}.
 */
export interface IAgentHostPromptCache {
	readonly _serviceBrand: undefined;

	/** Persisted prompt-cache state for `session`, or `undefined` if unknown/unset. */
	read(session: URI): ISessionPromptCacheState | undefined;

	/**
	 * Persists `promptCache` for `session` and returns the effective state.
	 * Persisted metadata is authoritative since multiple live provider sessions
	 * can share one session URI: re-reads current value, no-ops if unchanged,
	 * otherwise merges into existing `_meta`. No-ops (returning `promptCache`
	 * unchanged) if the session is unknown to the host.
	 */
	write(session: URI, promptCache: ISessionPromptCacheState | undefined): ISessionPromptCacheState | undefined;
}

export class AgentHostPromptCache implements IAgentHostPromptCache {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) { }

	read(session: URI): ISessionPromptCacheState | undefined {
		return readSessionPromptCacheState(this._stateManager.getSessionSummary(session.toString())?._meta);
	}

	write(session: URI, promptCache: ISessionPromptCacheState | undefined): ISessionPromptCacheState | undefined {
		const sessionKey = session.toString();
		const currentSummary = this._stateManager.getSessionSummary(sessionKey);
		if (!currentSummary) {
			return promptCache;
		}
		const currentMeta = currentSummary._meta;
		const current = readSessionPromptCacheState(currentMeta);
		if (current?.modelId === promptCache?.modelId && current?.cacheExpiresAt === promptCache?.cacheExpiresAt) {
			return current;
		}
		this._stateManager.setSessionMeta(sessionKey, withSessionPromptCacheState(currentMeta, promptCache));
		return promptCache;
	}
}
