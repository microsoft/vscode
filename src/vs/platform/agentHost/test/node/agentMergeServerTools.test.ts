/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildChatUri, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createAgentMergeServerToolGroup, readAgentMergeCIToolName, replyToAgentMergeReviewThreadToolName, rerunAgentMergeWorkflowToolName, type IAgentMergeToolAccessor } from '../../node/shared/agentMergeServerTools.js';
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
				readFailedCI: async session => {
					receivedSession = session;
					return 'result';
				},
				replyToReviewThread: async () => '',
				rerunFailedWorkflow: async () => '',
			}),
		]);

		const result = await host.executeTool(chatUri, readAgentMergeCIToolName, {});

		assert.deepStrictEqual({ result, receivedSession }, { result: 'result', receivedSession: sessionUri });
		stateManager.dispose();
	});
});
