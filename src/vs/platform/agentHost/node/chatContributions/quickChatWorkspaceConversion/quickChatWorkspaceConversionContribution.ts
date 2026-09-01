/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IIncomingRequest, IncomingRequestDisposition, ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { IQuickChatWorkspaceConversionService } from './quickChatWorkspaceConversionService.js';

/** Converts a scheduled Quick Chat only after its invoking turn has ended. */
export class QuickChatWorkspaceConversionContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'quickChatWorkspaceConversion';
	readonly order = 150;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IQuickChatWorkspaceConversionService private readonly _conversionService: IQuickChatWorkspaceConversionService,
	) {
		super();
	}

	onTurnEnd(turn: ITurnEnd): void {
		void this._conversionService.handleTurnEnd(turn);
	}

	onIncomingRequest(request: IIncomingRequest): IncomingRequestDisposition | undefined {
		if (!this._conversionService.isPending(request.chat)) {
			return undefined;
		}
		return {
			kind: 'reject',
			error: {
				errorType: 'workspaceConversionPending',
				message: 'Wait for the pending Quick Chat workspace conversion to finish before sending another message.',
			},
			stage: 'validation',
		};
	}
}
