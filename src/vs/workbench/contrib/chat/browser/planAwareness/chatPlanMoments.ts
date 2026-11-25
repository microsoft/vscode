/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { ChatModeKind } from '../../common/constants.js';
import { ITerminalAgent, PlanNudgeId } from '../../common/planAwareness/chatPlanAwareness.js';
import { IChatPlanAwarenessService, IPlanMoment } from './chatPlanAwarenessService.js';

/**
 * Builds the moments offered by the suggestion card: moments where Copilot can
 * take over what the user is doing. Each one leads into Copilot, prepared for it.
 */
export class ChatPlanMoments {

	constructor(
		@IChatPlanAwarenessService private readonly planAwarenessService: IChatPlanAwarenessService,
	) { }

	/** Another AI agent in the terminal reported that its usage limit was reached or is close. */
	agentUsageLimit(agent: ITerminalAgent, prompt: string | undefined, reached: boolean): IPlanMoment {
		const agentName = agent.name;
		return {
			id: PlanNudgeId.AgentUsageLimit,
			title: reached
				? localize('planAwareness.usageLimit.title', "{0} reached its usage limit", agentName)
				: localize('planAwareness.usageLimit.approachingTitle', "{0} is close to its usage limit", agentName),
			message: reached
				? prompt
					? localize('planAwareness.usageLimit.prompt', "Copilot picks up your instructions, skills, MCP servers and your prompt, so you can continue without setup.")
					: localize('planAwareness.usageLimit.message', "Copilot picks up your instructions, skills and MCP servers, so you can continue without setup.")
				: localize('planAwareness.usageLimit.approaching', "When it runs out, continue with Copilot. It picks up your instructions, skills and MCP servers, so no setup is needed."),
			showPlan: true,
			urgent: true,
			primary: {
				label: localize('planAwareness.usageLimit.continue', "Continue with Copilot"),
				run: () => this.planAwarenessService.openChat({
					mode: ChatModeKind.Agent,
					modelFamily: agent.modelFamily,
					query: prompt,
				}),
			},
		};
	}
}
