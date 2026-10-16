/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAgentHostChatContributionContext, IOutgoingTurn } from '../../common/agentHostChatContributionsService.js';
import { createAgentThreadDelegationMeta } from '../../common/meta/agentThreadDelegationMeta.js';
import { MessageKind } from '../../common/state/sessionState.js';
import { ThreadDelegationContribution } from '../../node/chatContributions/threadDelegation/threadDelegationContribution.js';

suite('ThreadDelegationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('instructs the primary to delegate to every @everyone participant', () => {
		const contribution = disposables.add(new ThreadDelegationContribution(upcastPartial<IAgentHostChatContributionContext>({})));
		const metadata = createAgentThreadDelegationMeta({
			threadId: 'thread-1',
			threadName: 'Release helper',
			primaryParticipantId: 'primary',
			participants: [
				{ id: 'primary', name: 'Coordinator', mention: '@Coordinator', agentUri: 'file:///agents/coordinator.agent.md', primary: true },
				{ id: 'reviewer', name: 'Reviewer', mention: '@Reviewer', agentUri: 'file:///agents/reviewer.agent.md', primary: false },
				{ id: 'researcher', name: 'Researcher', mention: '@Researcher', agentUri: 'file:///agents/researcher.agent.md', primary: false },
			],
			threads: [{ id: 'thread-2', name: 'Design partner', mention: '@Design-partner', sessionResource: 'agent-host-copilot:/thread-2' }],
		});
		const turn = upcastPartial<IOutgoingTurn>({
			message: {
				text: '@everyone review this release',
				origin: { kind: MessageKind.User },
				_meta: metadata,
			},
		});

		const text = contribution.onOutgoingTurn(turn)?.text ?? '';

		assert.deepStrictEqual({
			preservesUserText: text.startsWith('@everyone review this release'),
			fansOutWithoutCap: text.includes('delegates exactly once to every listed participant; do not impose a participant-count limit'),
			participants: ['@Coordinator', '@Reviewer', '@Researcher'].filter(mention => text.includes(mention)),
			targetThread: text.includes('@Design-partner: Design partner; send_message session: agent-host-copilot:/thread-2'),
			directFallback: text.includes('perform the work directly and clearly state that the primary handled it directly'),
		}, {
			preservesUserText: true,
			fansOutWithoutCap: true,
			participants: ['@Coordinator', '@Reviewer', '@Researcher'],
			targetThread: true,
			directFallback: true,
		});
	});
});
