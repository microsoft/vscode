/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ISessionFactoryRun, SessionFactoryRunStatus } from '../../../../../../platform/agentHost/common/sessionFactoryRuns.js';
import { buildDefaultChatUri, buildSubagentChatUri } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { resolveFactoryRunAgentChats } from '../../../browser/agentSessions/agentHost/agentHostFactoryRunEditor.js';
import { AgentHostFactoryRunEditorInput, AgentHostFactoryRunEditorInputSerializer } from '../../../browser/agentSessions/agentHost/agentHostFactoryRunEditorInput.js';

suite('AgentHostFactoryRunEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const backendSession = URI.parse('copilot:/session');
	const run: ISessionFactoryRun = {
		runId: 'run-1',
		factoryName: 'review-changed',
		description: '',
		status: SessionFactoryRunStatus.Running,
		revision: 1,
		createdAt: 1,
		updatedAt: 2,
		liveAgentCount: 1,
		totalSpawnedAgentCount: 3,
		usage: { activeMs: 0, subagents: 3, aiCredits: 0 },
		limits: {},
		phases: [],
		agents: [
			{ agentId: 'with-chat', toolCallId: 'with-chat', label: 'Reviewer', agentType: 'task', status: 'running', activeMs: 0 },
			{ agentId: 'without-chat', toolCallId: 'without-chat', label: 'Planner', agentType: 'task', status: 'completed', activeMs: 0 },
			{ agentId: 'legacy', label: 'Legacy', agentType: 'task', status: 'completed', activeMs: 0 },
		],
		progress: [],
	};

	test('maps only agents whose subagent chat the session lists', () => {
		const chats = [
			{ resource: buildDefaultChatUri(backendSession) },
			{ resource: buildSubagentChatUri(backendSession, 'with-chat') },
			{ resource: buildSubagentChatUri(URI.parse('copilot:/other'), 'without-chat') },
		];

		assert.deepStrictEqual([...resolveFactoryRunAgentChats(run, backendSession, chats)], [
			['with-chat', buildSubagentChatUri(backendSession, 'with-chat')],
		]);
	});

	test('round-trips the editor input through its serializer', () => {
		const sessionResource = URI.parse('agent-host-copilot:/session?x=1#chat');
		const input = store.add(new AgentHostFactoryRunEditorInput(sessionResource, 'run-1', 'review-changed'));
		const serializer = new AgentHostFactoryRunEditorInputSerializer();
		const restored = serializer.deserialize(undefined!, serializer.serialize(input)!);
		if (restored) {
			store.add(restored);
		}

		assert.deepStrictEqual({
			canSerialize: serializer.canSerialize(input),
			matches: restored ? input.matches(restored) : undefined,
			name: restored?.getName(),
			resource: restored?.resource?.toString(),
			malformed: serializer.deserialize(undefined!, '{"runId":1}'),
		}, {
			canSerialize: true,
			matches: true,
			name: 'review-changed',
			resource: AgentHostFactoryRunEditorInput.buildResource(sessionResource, 'run-1').toString(),
			malformed: undefined,
		});
	});
});
