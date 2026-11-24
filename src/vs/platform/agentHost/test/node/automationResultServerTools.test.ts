/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentHostChatContributionContext } from '../../common/agentHostChatContributionsService.js';
import { withAgentHostAutomationResult } from '../../common/meta/agentHostAutomationsMeta.js';
import { buildDefaultChatUri, MessageKind, SessionStatus } from '../../common/state/sessionState.js';
import { AutomationRunOriginKind, AutomationRunStatus, SessionOriginKind } from '../../common/state/protocol/state.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createAutomationResultServerToolGroup, reportAutomationResultToolName } from '../../node/shared/automationResultServerTools.js';
import { AutomationResultsContribution } from '../../node/chatContributions/automationResults/automationResultsContribution.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';

suite('Automation result server tools', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('adds runtime guidance only to the owning automation turn without replacing the message', () => {
		const state = disposables.add(new AgentHostStateManager(new NullLogService()));
		const session = 'mock:/automation';
		const chat = buildDefaultChatUri(session);
		const run = {
			resource: 'ahp-automation-run:/test', automation: 'ahp-automation:/test',
			origin: { kind: AutomationRunOriginKind.Manual },
			lifecycle: { status: AutomationRunStatus.Running, createdAt: '2026-01-01', startedAt: '2026-01-01' },
			sessions: [session], _meta: withAgentHostAutomationResult(undefined),
		} as const;
		state.setAutomationRunState({ ...run, sessions: [session] });
		state.createSession({
			resource: session, provider: 'mock', title: '', status: SessionStatus.Idle,
			createdAt: '2026-01-01', modifiedAt: '2026-01-01', defaultChat: chat,
			origin: { kind: SessionOriginKind.Automation, automation: run.automation, run: run.resource },
		});
		const contribution = disposables.add(new AutomationResultsContribution(upcastPartial<IAgentHostChatContributionContext>({}), state, createTestChatOwnershipService(state)));
		const turn = { session, chat, turnId: 'turn', message: { text: 'My unchanged task.', origin: { kind: MessageKind.Automation } } };
		const guidance = contribution.onOutgoingTurn(turn);
		const unrelated = contribution.onOutgoingTurn({ ...turn, message: { ...turn.message, origin: { kind: MessageKind.User } } });
		const peer = contribution.onOutgoingTurn({ ...turn, chat: 'ahp-chat:/peer' });
		state.setAutomationRunState({ ...run, sessions: [session], lifecycle: { ...run.lifecycle, status: AutomationRunStatus.Completed, completedAt: '2026-01-02' } });
		assert.deepStrictEqual({
			mentionsTool: guidance?.instructions?.[0].includes(reportAutomationResultToolName),
			beforeEnding: guidance?.instructions?.[0].includes('before ending the turn'),
			wordLimit: guidance?.instructions?.[0].includes('at most 10 words'),
			replacement: guidance?.text, prompt: turn.message.text,
			unrelated, peer, completed: contribution.onOutgoingTurn(turn),
		}, { mentionsTool: true, beforeEnding: true, wordLimit: true, replacement: undefined, prompt: 'My unchanged task.', unrelated: undefined, peer: undefined, completed: undefined });
	});

	test('validates reports and forwards only the invoking context, without ending a turn', async () => {
		const state = disposables.add(new AgentHostStateManager(new NullLogService()));
		const received: object[] = [];
		const group = createAutomationResultServerToolGroup({
			canReportResult: session => session === 'session',
			reportResult: async (context, report) => { received.push({ context, report }); },
		});
		const context = { sessionUri: 'session', chatUri: 'chat', turnId: 'turn' };
		for (const args of [null, {}, { outcome: 'success', summary: '' }, { outcome: 'unknown', summary: 'Done' }, { outcome: 'success', summary: 'Done', run: 'other' }]) {
			await assert.rejects(async () => group.execute(state, context, reportAutomationResultToolName, args), /Expected/);
		}
		await group.execute(state, context, reportAutomationResultToolName, { outcome: 'needsAttention', summary: '  Sign in to GitHub.  ' });
		assert.deepStrictEqual({
			received,
			enabled: group.isEnabledForSession(reportAutomationResultToolName, 'session'),
			unrelated: group.isEnabledForSession(reportAutomationResultToolName, 'other'),
			eager: group.definitions[0].deferLoading === false,
		}, {
			received: [{ context, report: { outcome: 'needsAttention', summary: 'Sign in to GitHub.' } }],
			enabled: true, unrelated: false, eager: false,
		});
	});

	test('accepts ten words with mixed whitespace and rejects eleven before writing', async () => {
		const state = disposables.add(new AgentHostStateManager(new NullLogService()));
		const summaries: string[] = [];
		const group = createAutomationResultServerToolGroup({
			canReportResult: () => true,
			reportResult: async (_context, report) => { summaries.push(report.summary); },
		});
		const context = { sessionUri: 'session', chatUri: 'chat', turnId: 'turn' };
		const tenWords = 'Reviewed  all\teligible\npull requests and approved three small changes.';
		await group.execute(state, context, reportAutomationResultToolName, { outcome: 'success', summary: ` ${tenWords} ` });
		await assert.rejects(() => Promise.resolve(group.execute(state, context, reportAutomationResultToolName, {
			outcome: 'success', summary: `${tenWords} Today.`,
		})), /at most 10 words/);
		assert.deepStrictEqual({
			summaries,
			toolGuidance: group.definitions[0].description?.includes('at most 10 words'),
		}, { summaries: [tenWords], toolGuidance: true });
	});
});
