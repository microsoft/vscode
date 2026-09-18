/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IOutgoingTurn, ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { readRemoteSessionOrigin, SendRemoteMessageToolReferenceName } from '../../../common/meta/agentRemoteSessionMeta.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

const remoteSessionOriginInstruction = `<remote_session_origin>
This session was delegated by another session. Your normal final answer stays in this remote chat and is not forwarded to the origin.
For work assigned by the origin, including follow-up tasks, you must call ${SendRemoteMessageToolReferenceName} with session "origin" before ending your turn. Send the requested results, with enough detail for the exact originating chat to answer its user. This is required even if the task does not explicitly ask for a reply, unless explicitly instructed not to report back.
If blocked or needing clarification, send the blocker or question instead of silently finishing.
Only claim delivery after the tool confirms "sent" or "queued". If the tool is unavailable or delivery fails, report the failure in this chat; do not claim that the origin was notified.
Do not send acknowledgement-only replies to messages that contain no new task or question. Delivery is asynchronous; continue independent work rather than polling for replies, or end your turn if there is nothing else to do. Do not sleep while waiting for a reply. The coordinating Agents window must remain connected. Do not retry uncertain delivery automatically.
</remote_session_origin>`;

/** Keeps remote reply guidance available without modifying the task or transcript. */
export class RemoteSessionOriginContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'remoteSessionOrigin';
	readonly order = 350;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	onOutgoingTurn(turn: IOutgoingTurn): ISendContribution | undefined {
		const state = this._stateManager.getSessionState(turn.session);
		if (!readRemoteSessionOrigin(state)
			|| !state?.activeClients.some(client => client.tools.some(tool => tool.name === SendRemoteMessageToolReferenceName))) {
			return undefined;
		}
		return { instructions: [remoteSessionOriginInstruction] };
	}
}
