/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { type IAgentHostChatContribution, type IAgentHostChatContributionContext, type IOutgoingTurn } from '../../../common/agentHostChatContributionsService.js';
import { MessageKind, readSessionExternal } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { AgentSessionRegistry, IAgentSessionRegistry } from '../../agentSessionRegistry.js';

export class ExternalSessionAdoptionContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'externalSessionAdoption';
	readonly order = 60;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentSessionRegistry private readonly _sessionRegistry: AgentSessionRegistry,
	) {
		super();
	}

	async onOutgoingTurn(turn: IOutgoingTurn): Promise<undefined> {
		if (turn.message.origin.kind === MessageKind.User && readSessionExternal(this._stateManager.getSessionState(turn.session)?._meta)) {
			await this._sessionRegistry.adoptExternalSession(URI.parse(turn.session));
		}
		return undefined;
	}
}
