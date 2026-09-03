/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IIncomingRequest, IncomingRequestDisposition, ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { ISessionWorkspaceConversionService } from './sessionWorkspaceConversionService.js';

/** Finalizes requested workspace conversions after a turn and blocks new turns while conversion is pending. */
export class SessionWorkspaceConversionContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'sessionWorkspaceConversion';
	readonly order = 150;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@ISessionWorkspaceConversionService private readonly _conversionService: ISessionWorkspaceConversionService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		if (turn.reason.kind === 'success') {
			void this._conversionService.updateSessionWorkspace(turn.channel, turn.turnId);
		} else {
			this._conversionService.cancel(turn.channel, turn.turnId);
		}
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		if (!this._conversionService.isPending(request.chat)) {
			return undefined;
		}
		return {
			kind: 'reject',
			error: {
				errorType: 'workspaceConversionPending',
				message: localize('agentHost.workspaceConversionPending', "Wait for workspace setup to finish before sending another message."),
			},
			stage: 'validation',
		};
	}
}
