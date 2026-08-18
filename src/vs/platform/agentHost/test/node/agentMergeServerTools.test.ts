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
