/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IOutgoingTurn, ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { readRemoteSessionOrigin, SendRemoteMessageToolReferenceName } from '../../../common/meta/agentRemoteSessionMeta.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

const remoteSessionOriginInstruction = `<remote_session_origin>
For each delegated task from the origin, including follow-ups, send results, blockers, or questions to the exact originating chat using ${SendRemoteMessageToolReferenceName} with session "origin" before ending your turn, unless explicitly told not to report back. Final answers are not forwarded.
Load ${SendRemoteMessageToolReferenceName} with tool search if needed.
Only claim delivery after "sent" or "queued"; report failures here. Do not retry uncertain delivery.
Do not acknowledge messages with no new task or question. Continue independent work or end your turn; do not sleep or poll for replies.
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
