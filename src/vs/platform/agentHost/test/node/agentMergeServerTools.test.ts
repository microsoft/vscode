/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentMergeCIRequest, createAgentMergeServerToolGroup, parseAgentMergeCIRequest, readAgentMergeCIToolName, replyToAgentMergeReviewThreadToolName, rerunAgentMergeWorkflowToolName, type IAgentMergeToolAccessor } from '../../node/shared/agentMergeServerTools.js';
import { AgentServerToolHost } from '../../node/shared/agentServerToolHost.js';

suite('Agent Merge server tools', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const toolNames = [readAgentMergeCIToolName, replyToAgentMergeReviewThreadToolName, rerunAgentMergeWorkflowToolName];

	test('advertises tools only while the feature is enabled', () => {
		let enabled = false;
		const group = createAgentMergeServerToolGroup(new class implements IAgentMergeToolAccessor {
			isEnabled(): boolean { return enabled; }
			async readFailedCI(): Promise<string> { return ''; }
			async replyToReviewThread(): Promise<string> { return ''; }
			async rerunFailedWorkflow(): Promise<string> { return ''; }
		}());

		const whileDisabled = toolNames.filter(name => group.isEnabled(name));
		enabled = true;
		const whileEnabled = toolNames.filter(name => group.isEnabled(name));

		assert.deepStrictEqual({ whileDisabled, whileEnabled, withoutAccessor: createAgentMergeServerToolGroup().isEnabled(readAgentMergeCIToolName) }, {
			whileDisabled: [],
			whileEnabled: toolNames,
			withoutAccessor: false,
		});
	});

	test('explains deferred reruns without asking the agent to wait or retry', () => {
		const definition = createAgentMergeServerToolGroup().definitions.find(tool => tool.name === rerunAgentMergeWorkflowToolName);

		assert.deepStrictEqual({
			defersUntilFinished: definition?.description?.includes('defers the rerun until it finishes'),
			requiresCurrentAuthorization: definition?.description?.includes('CI repair remains enabled and the pull request head is unchanged'),
			continuesOtherWork: definition?.description?.includes('Continue other actionable work'),
			doesNotPoll: definition?.description?.includes('do not poll or repeat a deferred request'),
		}, {
			defersUntilFinished: true,
			requiresCurrentAuthorization: true,
			continuesOtherWork: true,
			doesNotPoll: true,
		});
	});

	test('documents summary-first diagnostics, supported continuation and true-tail completeness', () => {
		const description = createAgentMergeServerToolGroup().definitions.find(tool => tool.name === readAgentMergeCIToolName)!.description!;
		assert.deepStrictEqual([
			'Defaults to a bounded summary', 'literal search with context', 'cursor alone',
			'pull request head, workflow attempt, and job', 'real end only when complete is true',
			'download limit is terminal', 'rather than repeating the summary or using other GitHub tools',
			'Summary pages also respect cache capacity', 'Concurrent reads are queued',
		].map(clause => description.includes(clause)), Array(9).fill(true));
	});

	test('validates diagnostic mode requirements and numeric bounds before execution', () => {
		const invalid = [
			null, [], { mode: 'other' }, { mode: 'tail' }, { cursor: 'c', mode: 'range' },
			{ mode: 'range', evidenceId: 'e', startLine: 0 }, { mode: 'range', evidenceId: 'e', startLine: 1.5 },
			{ mode: 'range', evidenceId: 'e', startLine: 2, endLine: 1 }, { mode: 'range', evidenceId: 'e', endLine: 201 },
			{ mode: 'tail', evidenceId: 'e', lineCount: 201 }, { mode: 'tail', evidenceId: 'e', query: 'x' },
			{ mode: 'search', evidenceId: 'e' }, { mode: 'search', evidenceId: 'e', query: 'x', contextLines: 6 },
			{ mode: 'search', evidenceId: 'e', query: '\n' }, { mode: 'search', evidenceId: 'e', query: 'x'.repeat(201) },
			{ jobId: '' }, { runId: 'unauthorized' },
		];
		for (const input of invalid) {
			assert.throws(() => parseAgentMergeCIRequest(input), /Invalid readAgentMergeCI input/);
		}
		assert.deepStrictEqual([
			parseAgentMergeCIRequest({}),
			parseAgentMergeCIRequest({ jobId: 'job' }),
			parseAgentMergeCIRequest({ cursor: 'cursor' }),
			parseAgentMergeCIRequest({ mode: 'range', evidenceId: 'e', startLine: 10 }),
		], [
			{ mode: 'summary' }, { mode: 'summary', jobId: 'job' }, { cursor: 'cursor' },
			{ mode: 'range', evidenceId: 'e', startLine: 10, endLine: 209, startColumn: undefined },
		]);
	});

	test('distinguishes deferred, requested, unconfirmed and failed reruns in the transcript', () => {
		const group = createAgentMergeServerToolGroup();
		const message = (outcome: string, success = true) => group.getDisplay?.(rerunAgentMergeWorkflowToolName, {}, {
			success,
			text: JSON.stringify({ outcome }),
		})?.pastTenseMessage;

		assert.deepStrictEqual({
			deferred: message('deferred'),
			requested: message('succeeded'),
			unconfirmed: message('indeterminate'),
			failed: message('', false),
		}, {
			deferred: 'Deferred workflow rerun until the current attempt finishes',
			requested: 'Requested workflow rerun',
			unconfirmed: 'Could not confirm workflow rerun',
			failed: 'Failed to rerun workflow',
		});
	});

	test('resolves the owning session for a tool invoked from a peer chat', async () => {
		const sessionUri = 'copilot:/merge-session';
		const chatUri = buildChatUri(sessionUri, 'peer');
		let receivedSession: string | undefined;
		let receivedRequest: AgentMergeCIRequest | undefined;
		const stateManager = new AgentHostStateManager(new NullLogService());
		stateManager.createSession({
			resource: sessionUri,
			provider: 'copilot',
			title: 'Agent Merge',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
		});
		const host = new AgentServerToolHost(stateManager, [
			createAgentMergeServerToolGroup({
				isEnabled: () => true,
				readFailedCI: async (session, request) => {
					receivedSession = session;
					receivedRequest = request;
					return 'result';
				},
				replyToReviewThread: async () => '',
				rerunFailedWorkflow: async () => '',
			}),
		]);

		const result = await host.executeTool(chatUri, readAgentMergeCIToolName, { mode: 'search', evidenceId: 'job-evidence', query: 'failure' });

		assert.deepStrictEqual({ result, receivedSession, receivedRequest }, {
			result: 'result', receivedSession: sessionUri,
			receivedRequest: { mode: 'search', evidenceId: 'job-evidence', query: 'failure', startLine: 1, contextLines: undefined },
		});
		stateManager.dispose();
	});
});
