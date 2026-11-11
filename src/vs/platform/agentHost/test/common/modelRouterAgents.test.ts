/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { parseModelRouter } from '../../common/modelRouter.js';
import { modelRouterBriefing, modelRouterRoleWarnings, resolveModelRouterAgentPlan } from '../../common/modelRouterAgents.js';
import { PolicyState } from '../../common/state/protocol/channels-root/state.js';

function model(id: string, policyState = PolicyState.Enabled): IAgentModelInfo {
	return { provider: 'copilotcli', id, name: id.toUpperCase(), supportsVision: true, policyState };
}

const router = parseModelRouter([
	'version: 1',
	'display-name: Workday',
	'description: Test.',
	'roles:',
	'  reviewer:',
	'    description: Reviews a change.',
	'    model: [gone, gpt]',
	'    effort: high',
	'  tester:',
	'    agent: Test Writer',
	'    model: gone',
	'    effort: high',
	'  spare:',
	'    description: Never used.',
	'playbooks:',
	'  feature:',
	'    when: Building.',
	'    main: opus',
	'    uses: [reviewer, tester]',
	'    guidance: Plan first.',
	'  notes:',
	'    when: Writing.',
	'    main: opus',
	'    guidance: Keep it short.',
	'  quick:',
	'    when: Questions.',
	'    main: haiku',
	'',
].join('\n'), 'workday.model-router.yaml').router!;

suite('modelRouterAgents', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves a playbook\'s plan, and none for a playbook that brings nothing', () => {
		const models = [model('opus'), model('haiku'), model('gpt')];
		assert.deepStrictEqual({
			feature: resolveModelRouterAgentPlan(router, 'feature', models),
			notes: resolveModelRouterAgentPlan(router, 'notes', models),
			// "No plan" is one value, so that plans can be compared by identity.
			quick: resolveModelRouterAgentPlan(router, 'quick', models),
			unknown: resolveModelRouterAgentPlan(router, 'nope', models),
			disabled: resolveModelRouterAgentPlan(router, 'feature', [model('gpt', PolicyState.Disabled)])?.agents[0],
		}, {
			feature: {
				router: 'Workday',
				playbook: 'feature',
				guidance: 'Plan first.',
				agents: [
					// An effort is checked against the role's own model, which here has no effort setting.
					{ name: 'reviewer', description: 'Reviews a change.', model: 'gpt', modelName: 'GPT' },
					// An agent that keeps its custom agent's model gets the effort as written.
					{ name: 'tester', description: '', agent: 'Test Writer', effort: 'high' },
				],
			},
			notes: { router: 'Workday', playbook: 'notes', guidance: 'Keep it short.', agents: [] },
			quick: undefined,
			unknown: undefined,
			disabled: { name: 'reviewer', description: 'Reviews a change.', effort: 'high' },
		});
	});

	test('warns about roles without a model on this account, and unused roles', () => {
		assert.deepStrictEqual(modelRouterRoleWarnings(router, [model('gpt')]), [
			'Role `tester` (gone) runs on its agent\'s model, else the chat\'s: none of its models are available on this account.',
			'Role `spare` is not used by any playbook.',
		]);
	});

	test('briefs the main agent about the agents the session has, by the name that starts each', () => {
		const plan = resolveModelRouterAgentPlan(router, 'feature', [model('gpt')])!;
		assert.deepStrictEqual({
			// The tester's custom agent was not found at launch, so it is not mentioned.
			withAgents: modelRouterBriefing(plan, [{ agentType: 'reviewer', description: 'Reviews\n a change.' }, { agentType: 'docs', description: '' }]),
			guidanceOnly: modelRouterBriefing(plan, []),
			nothing: modelRouterBriefing({ ...plan, guidance: undefined }, []),
		}, {
			withAgents: [
				'<model_router_playbook>',
				'This note is for the main agent of this chat only. If you were started as a subagent, ignore it.',
				'The user\'s model router "Workday" chose its "feature" playbook for this chat.',
				'',
				'How the user wants the work done:',
				'Plan first.',
				'',
				'Agents you can start with the task tool, by passing the name as its agent_type:',
				'- `reviewer`: Reviews a change.',
				'- `docs`',
				'',
				'Start one of these agents whenever the guidance or the work calls for it. Each already runs on the model the user chose for it, so do not pass a model when you start one.',
				'</model_router_playbook>',
			].join('\n'),
			guidanceOnly: [
				'<model_router_playbook>',
				'This note is for the main agent of this chat only. If you were started as a subagent, ignore it.',
				'The user\'s model router "Workday" chose its "feature" playbook for this chat.',
				'',
				'How the user wants the work done:',
				'Plan first.',
				'</model_router_playbook>',
			].join('\n'),
			nothing: undefined,
		});
	});
});
