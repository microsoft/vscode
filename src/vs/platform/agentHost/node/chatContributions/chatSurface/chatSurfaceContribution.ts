/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createEditorInlineChatInstruction, createTerminalChatInstruction } from '../../../common/meta/agentChatSurfaceMeta.js';
import { AgentHostChatContributionRegistry, IAgentHostChatContribution, IAgentHostChatContributionContext, IOutgoingTurn, ISendContribution } from '../chatContribution.js';

/** Adds guidance tailored to the chat surface that created the session. */
class ChatSurfaceContribution extends Disposable implements IAgentHostChatContribution {

	readonly id = 'chatSurface';
	readonly order = 300;

	constructor(private readonly _context: IAgentHostChatContributionContext) {
		super();
	}

	contributeSend(turn: IOutgoingTurn): ISendContribution | undefined {
		const surface = this._context.getSessionSurfaceMeta(turn.session);
		const instruction = surface?.surface === 'terminal'
			? createTerminalChatInstruction(surface)
			: surface?.surface === 'editorInline'
				? createEditorInlineChatInstruction(surface)
				: undefined;
		return instruction ? { instructions: [instruction] } : undefined;
	}
}

AgentHostChatContributionRegistry.register(ChatSurfaceContribution);
