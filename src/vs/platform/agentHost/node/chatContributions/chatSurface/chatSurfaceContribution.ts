/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IOutgoingTurn, ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { createEditorInlineChatInstruction, createTerminalChatInstruction } from '../../../common/meta/agentChatSurfaceMeta.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';

/** Adds guidance tailored to the chat surface that created the session. */
export class ChatSurfaceContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'chatSurface';
	readonly order = 300;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
	) {
		super();
	}

	onOutgoingTurn(turn: IOutgoingTurn): ISendContribution | undefined {
		const surface = this._stateManager.getSessionSurfaceMeta(turn.session);
		const instruction = surface?.surface === 'terminal'
			? createTerminalChatInstruction(surface)
			: surface?.surface === 'editorInline'
				? createEditorInlineChatInstruction(surface)
				: undefined;
		return instruction ? { instructions: [instruction] } : undefined;
	}
}
