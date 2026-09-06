/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { AgentHostMarkdownPlanRichLinksEnabledConfigKey, platformRootSchema } from '../../../common/agentHostSchema.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IOutgoingTurn, ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { buildOpenSessionLinkForChatResource } from '../../../common/openSessionLink.js';
import { IAgentConfigurationService } from '../../agentConfigurationService.js';

function createMarkdownPlanRichLinksInstruction(chat: IOutgoingTurn['chat']): string {
	const currentChatLink = buildOpenSessionLinkForChatResource(chat);
	return [
		'<rich_plan_markdown>',
		'When creating or editing a Markdown plan document, use these formats when the exact target is known:',
		'- Use canonical HTTPS links for GitHub issues and pull requests.',
		'- Use `commit://<sha>` for commits in the current Git repository.',
		'- Preserve exact `agent-host-session://...` links returned by session and chat tools when referring to sessions, chats, or subagents. Do not construct these links yourself.',
		...(currentChatLink ? [`- Link to the current chat as [Current chat](${currentChatLink}).`] : []),
		'- Use `- [ ] :running: Description` for a task that is actively running, `- [ ]` for a pending task, and `- [x]` for a completed task.',
		'- Keep link labels meaningful so the document remains readable without rich rendering.',
		'</rich_plan_markdown>',
	].join('\n');
}

/** Adds Markdown plan rich-link guidance when the feature is enabled. */
export class MarkdownPlanRichLinksContribution extends Disposable implements IAgentHostChatContribution {

	static readonly id = 'markdownPlanRichLinks';
	// Send contributions reserve 100-400 for the original host-instruction sequence.
	readonly order = 100;

	constructor(
		protected readonly _context: IAgentHostChatContributionContext,
		@IAgentConfigurationService private readonly _agentConfigService: IAgentConfigurationService,
	) {
		super();
	}

	onOutgoingTurn(turn: IOutgoingTurn): ISendContribution | undefined {
		return this._agentConfigService.getRootValue(platformRootSchema, AgentHostMarkdownPlanRichLinksEnabledConfigKey)
			? { instructions: [createMarkdownPlanRichLinksInstruction(turn.chat)] }
			: undefined;
	}
}
