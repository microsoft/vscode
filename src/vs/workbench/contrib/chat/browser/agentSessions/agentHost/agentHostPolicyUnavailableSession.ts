/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agent.js';
import { getAgentHostChatId } from '../../../../../../platform/agentHost/common/agentHostChatIdentity.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentHostSavedChat } from '../../../../../../platform/agentHost/common/agentHostSavedChat.js';
import { IAgentConnection, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IChatSession, IChatSessionContentProvider } from '../../../common/chatSessionsService.js';
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, ChatModeKind } from '../../../common/constants.js';
import { ISerializableChatModelInputState } from '../../../common/model/chatModel.js';
import { messageAttachmentsToVariableData, turnsToHistory } from './stateToProgressAdapter.js';

/** Reads saved conversation data without subscribing to the disabled agent's live channels. */
export async function readAgentHostSavedChat(resource: URI, connection: IAgentConnection, connections: IAgentHostConnectionsService, token: CancellationToken): Promise<IAgentHostSavedChat> {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	if ((resource.scheme !== 'agent-host-claude' && resource.scheme !== 'agent-host-codex') || !connection.readSavedChat) {
		throw new Error(localize('agentHost.savedHistoryUnavailable', "This agent host cannot read saved conversation history."));
	}
	const query = resource.query.split('&').filter(part => !part.startsWith(`${CHAT_SUBAGENT_RESOURCE_QUERY_PARAM}=`)).join('&');
	const parent = resource.with({ query, fragment: '' });
	let metadata: IAgentSessionMetadata | undefined;
	for (const candidate of await raceCancellationError(connection.listSessions(), token)) {
		const advertised = connections.registerSessionResource(candidate.session, undefined, candidate.provider);
		if (isEqual(advertised, parent)) {
			metadata = candidate;
		}
	}
	if (!metadata) {
		throw new Error(localize('agentHost.savedSessionMissing', "The saved conversation could not be found."));
	}
	const explicitChat = new URLSearchParams(resource.query).get(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM);
	const chat = explicitChat ? URI.parse(explicitChat, true) : resource.fragment
		? metadata.chats?.find(candidate => getAgentHostChatId(candidate.chat) === resource.fragment)?.chat
		: undefined;
	if (resource.fragment && !chat) {
		throw new Error(localize('agentHost.savedChatMissing', "This chat is no longer in the saved conversation."));
	}
	const saved = await raceCancellationError(connection.readSavedChat(metadata.session, chat), token);
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
	if (!isEqual(saved.session, metadata.session) || (chat && !isEqual(saved.chat, chat)) || resource.scheme !== `agent-host-${saved.provider}`) {
		throw new Error(localize('agentHost.savedChatMismatch', "The saved history belongs to a different conversation."));
	}
	return saved;
}

/** Restores portable draft content, without copying a disabled agent's model or permissions. */
export function savedChatDraftInput(saved: IAgentHostSavedChat): ISerializableChatModelInputState | undefined {
	return saved.draft ? {
		inputText: saved.draft.text,
		attachments: messageAttachmentsToVariableData(saved.draft.attachments, '', saved.draft.text)?.variables ?? [],
		selections: [],
		mode: { id: 'agent', kind: ChatModeKind.Agent },
		selectedModel: undefined,
		contrib: {},
	} : undefined;
}

export class PolicyUnavailableAgentHostContentProvider implements IChatSessionContentProvider {
	constructor(
		@IAgentHostService private readonly _connection: IAgentHostService,
		@IAgentHostConnectionsService private readonly _connections: IAgentHostConnectionsService,
	) { }

	async provideChatSessionContent(resource: URI, token: CancellationToken): Promise<IChatSession> {
		const saved = await readAgentHostSavedChat(resource, this._connection, this._connections, token);
		return new PolicyUnavailableAgentHostSession(resource, saved, this._connection);
	}
}

class PolicyUnavailableAgentHostSession extends Disposable implements IChatSession {
	readonly history: IChatSession['history'];
	readonly title: string;
	readonly transferredState: IChatSession['transferredState'];
	readonly isReadOnly = constObservable(true);
	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	constructor(readonly sessionResource: URI, saved: IAgentHostSavedChat, connection: IAgentConnection) {
		super();
		this.history = turnsToHistory(saved.session, saved.turns, sessionResource.scheme, '', undefined, undefined, undefined, connection.resourceUris);
		this.title = saved.title;
		this.transferredState = { editingSession: undefined, inputState: savedChatDraftInput(saved) };
	}

	override dispose(): void {
		this._onWillDispose.fire();
		super.dispose();
	}
}
