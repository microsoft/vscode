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
 * Narrow read/write seam over the host-owned prompt-cache slot of a session's
 * `_meta`.
 *
 * A provider that tracks prompt-cache warmth (today: Copilot) needs exactly two
 * operations against host state — read the last persisted value on resume, and
 * persist a new one when the model or cache expiry changes. This seam exposes
 * only those two, so the provider does not have to inject the whole
 * {@link AgentHostStateManager} for them.
 */
export interface IAgentHostPromptCache {
	readonly _serviceBrand: undefined;

	/**
	 * The persisted prompt-cache state for `session`, or `undefined` when the
	 * session is unknown or has never recorded one.
	 */
	read(session: URI): ISessionPromptCacheState | undefined;

	/**
	 * Persists `promptCache` for `session` and returns the effective state.
	 *
	 * The persisted metadata — not any caller-held value — is authoritative:
	 * several live provider sessions can share one session URI, so the write
	 * re-reads the current value first, returns it unchanged when it already
	 * matches, and otherwise merges the new value into the session's existing
	 * `_meta` rather than replacing the bag.
	 *
	 * Returns the state that is in effect after the call, so a caller can keep
	 * its own cached copy in sync without a follow-up {@link read}. When the
	 * session is unknown to the host, nothing is persisted and `promptCache` is
	 * returned unchanged.
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
