/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import type { Turn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { ModelSelection } from '../../../../../../platform/agentHost/common/state/protocol/state.js';

export const IAgentHostImportConversationStore = createDecorator<IAgentHostImportConversationStore>('agentHostImportConversationStore');

/**
 * A conversation being imported ("Continue in…") into a new agent-host session:
 * the translated {@link Turn}s plus the source session's selected model, so the
 * new session resumes on the same model instead of the host's default.
 */
export interface IAgentHostImportConversation {
	readonly turns: readonly Turn[];
	readonly model?: ModelSelection;
}

/**
 * Short-lived hand-off for a conversation being imported ("Continue in…") into a
 * new agent-host session. The trigger stashes the translated {@link Turn}s keyed
 * by the (untitled) session resource; the session handler consumes them once,
 * when it creates the backend session, seeding them as real editable history via
 * `IAgentCreateSessionConfig.importConversation`.
 *
 * Entries are consumed exactly once (at session creation) and are not persisted:
 * once the turns become real backend events the store has no further role.
 */
export interface IAgentHostImportConversationStore {
	readonly _serviceBrand: undefined;

	/** Stash the imported conversation for a session resource (no-op when it has no turns). */
	set(resource: URI, conversation: IAgentHostImportConversation): void;

	/** Read and remove the imported conversation for a session resource, if any. */
	take(resource: URI): IAgentHostImportConversation | undefined;

	/**
	 * Move a stashed entry from one resource to another. Used when a session
	 * graduates from its provisional (`untitled-…`) resource to the real
	 * backend resource before it has been consumed.
	 */
	rename(oldResource: URI, newResource: URI): void;
}

export class AgentHostImportConversationStore implements IAgentHostImportConversationStore {

	declare readonly _serviceBrand: undefined;

	private readonly _pending = new Map<string, IAgentHostImportConversation>();

	set(resource: URI, conversation: IAgentHostImportConversation): void {
		if (conversation.turns.length > 0) {
			this._pending.set(resource.toString(), conversation);
		}
	}

	take(resource: URI): IAgentHostImportConversation | undefined {
		const key = resource.toString();
		const conversation = this._pending.get(key);
		this._pending.delete(key);
		return conversation;
	}

	rename(oldResource: URI, newResource: URI): void {
		const conversation = this.take(oldResource);
		if (conversation) {
			this._pending.set(newResource.toString(), conversation);
		}
	}
}
