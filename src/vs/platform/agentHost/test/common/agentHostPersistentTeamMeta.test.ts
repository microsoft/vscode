/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentHostPersistentTeamState } from '../../common/agentHostPersistentTeam.js';
import { AgentHostPersistentTeamMetaKey, readAgentHostPersistentTeamState, toAgentHostPersistentTeamMeta } from '../../common/meta/agentHostPersistentTeamMeta.js';
import { buildChatUri, buildDefaultChatUri } from '../../common/state/sessionState.js';

suite('AgentHostPersistentTeamMeta', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const state: IAgentHostPersistentTeamState = {
		version: 2, leadChat: buildDefaultChatUri('copilotcli:/team'), enabled: true, state: 'ready',
		members: [{
			role: 'worker', chat: buildChatUri('copilotcli:/team', 'worker'), enabled: true,
			model: { id: 'worker-model', config: { thinkingLevel: 'high' } },
		}],
	};

	test('round trips current role-to-chat identity', () => {
		assert.deepStrictEqual(readAgentHostPersistentTeamState({ _meta: toAgentHostPersistentTeamMeta(state) }), state);
	});

	test('round trips task references without copying transcripts', () => {
		const withTask: IAgentHostPersistentTeamState = {
			...state, task: {
				leadTurnId: 'lead-turn', state: 'reviewing', leadPhase: 'manager', requestedLeadPhase: 'integration', reviewReminderSent: false,
				assignments: [{ role: 'worker', chat: state.members[0].chat, state: 'reported', objective: 'Implement the feature', deliverable: 'Passing tests', revision: 2, turnId: 'worker-turn', reportMessageId: 'report', delivered: true, reviewed: true, reviewFeedback: 'Verified' }],
			},
		};
		assert.deepStrictEqual(readAgentHostPersistentTeamState({ _meta: toAgentHostPersistentTeamMeta(withTask) }), withTask);
	});

	for (const [name, value] of Object.entries({
		version: { ...state, version: 1 },
		chat: { ...state, leadChat: 'not-a-chat' },
		malformedLead: { ...state, leadChat: 'ahp-chat:/invalid' },
		role: { ...state, members: [{ ...state.members[0], role: 'lead' }] },
		model: { ...state, members: [{ ...state.members[0], model: { id: 'worker', config: { thinkingLevel: [] } } }] },
		foreignChat: { ...state, members: [{ ...state.members[0], chat: buildChatUri('copilotcli:/other', 'worker') }] },
		duplicateRole: { ...state, members: [state.members[0], { ...state.members[0], chat: buildChatUri('copilotcli:/team', 'other') }] },
		duplicateChat: { ...state, members: [state.members[0], { ...state.members[0], role: 'scout' }] },
		leadAsMember: { ...state, members: [{ ...state.members[0], chat: state.leadChat }] },
		enabled: { ...state, enabled: false },
		error: { ...state, error: { message: 'missing code' } },
		taskState: { ...state, task: { leadTurnId: 'turn', state: 'unknown', assignments: [] } },
		taskPhase: { ...state, task: { leadTurnId: 'turn', state: 'working', leadPhase: 'anything', assignments: [] } },
		taskRevision: { ...state, task: { leadTurnId: 'turn', state: 'working', assignments: [{ role: 'worker', chat: state.members[0].chat, state: 'unassigned', revision: -1 }] } },
		taskDelivery: { ...state, task: { leadTurnId: 'turn', state: 'working', assignments: [{ role: 'worker', chat: state.members[0].chat, state: 'unassigned', delivered: 'yes' }] } },
		taskRole: { ...state, task: { leadTurnId: 'turn', state: 'working', assignments: [{ role: 'lead', chat: state.members[0].chat, state: 'unassigned' }] } },
		taskChat: { ...state, task: { leadTurnId: 'turn', state: 'working', assignments: [{ role: 'worker', chat: state.leadChat, state: 'unassigned' }] } },
		taskReport: { ...state, task: { leadTurnId: 'turn', state: 'reviewing', assignments: [{ role: 'worker', chat: state.members[0].chat, state: 'reported' }] } },
		taskAssignment: { ...state, task: { leadTurnId: 'turn', state: 'working', assignments: [{ role: 'worker', chat: state.members[0].chat, state: 'working' }] } },
	})) {
		test(`rejects invalid ${name}`, () => {
			assert.strictEqual(readAgentHostPersistentTeamState({ _meta: { [AgentHostPersistentTeamMetaKey]: value } }), undefined);
		});
	}

	test('keeps prototype current chat IDs without the native broker metadata', () => {
		const prototype = {
			...state, teamId: 'old-sdk', revision: 9,
			members: [
				{ ...state.members[0], memberId: 'worker-sdk', generation: 3, availability: 'active', materialization: 'ready' },
				{ ...state.members[0], chat: buildChatUri('copilotcli:/team', 'previous-worker'), availability: 'archived', enabled: false },
			],
		};
		assert.deepStrictEqual(readAgentHostPersistentTeamState({ _meta: { [AgentHostPersistentTeamMetaKey]: prototype } }), state);
	});
});
