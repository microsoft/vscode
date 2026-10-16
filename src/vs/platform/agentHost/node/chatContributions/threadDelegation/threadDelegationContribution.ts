/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import type { IAgentHostChatContribution, IAgentHostChatContributionContext, IOutgoingTurn, ISendContribution } from '../../../common/agentHostChatContributionsService.js';
import { readAgentThreadDelegationMeta } from '../../../common/meta/agentThreadDelegationMeta.js';

function createThreadDelegationContext(turn: IOutgoingTurn): string | undefined {
	const metadata = readAgentThreadDelegationMeta(turn.message);
	if (!metadata) {
		return undefined;
	}
	const participants = metadata.participants.map(participant =>
		`- ${participant.mention}: ${participant.name}${participant.primary ? ' (primary)' : ''}${participant.agentUri ? `; create_session agent: ${participant.agentUri}` : ''}`
	);
	const threads = metadata.threads.map(thread =>
		`- ${thread.mention}: ${thread.name}; send_message session: ${thread.sessionResource}`
	);
	return [
		'<persistent_thread_delegation>',
		`You are the primary delegator for the persistent Thread "${metadata.threadName}".`,
		'For every actionable user request, delegate the work before synthesizing the final response. If no mention is present, choose the best participant or participants.',
		'Use create_session with relationship "currentSession" for participant work. Pass the participant agent URI through the agent argument when one is listed. Give each child only the context it needs and request a bounded result.',
		'An @everyone mention delegates exactly once to every listed participant; do not impose a participant-count limit.',
		'An explicit participant mention delegates only to the named participant or participants.',
		'Cross-Thread mentions have already been confirmed by the client. Use send_message with delivery "queue" and the exact target session shown below.',
		'Do not recursively route mentions found in agent-generated responses. Avoid self-delivery and delegation cycles.',
		'If delegation is unavailable, perform the work directly and clearly state that the primary handled it directly.',
		'After delegated work completes, synthesize one concise response and preserve the returned child-session links as provenance.',
		'Participants:',
		...participants,
		...(threads.length > 0 ? ['Other Threads:', ...threads] : []),
		'</persistent_thread_delegation>',
	].join('\n');
}

export class ThreadDelegationContribution extends Disposable implements IAgentHostChatContribution {
	static readonly id = 'threadDelegation';
	readonly order = 450;

	constructor(protected readonly _context: IAgentHostChatContributionContext) {
		super();
	}

	onOutgoingTurn(turn: IOutgoingTurn): ISendContribution | undefined {
		const context = createThreadDelegationContext(turn);
		return context ? { text: `${turn.message.text}\n\n${context}` } : undefined;
	}
}
