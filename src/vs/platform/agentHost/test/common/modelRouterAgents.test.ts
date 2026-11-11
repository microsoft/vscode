/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { parseModelRouter } from '../../common/modelRouter.js';
import { installedModelRouterAgentPlan, modelRouterBriefing, modelRouterRoleWarnings, resolveModelRouterAgentPlan } from '../../common/modelRouterAgents.js';
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
	'  docs:',
	'    agent: Doc Writer',
	'    effort: high',
	'  explore:',
	'    description: Has the name of an agent every chat has.',
	'  spare:',
	'    description: Never used.',
	'playbooks:',
	'  feature:',
	'    when: Building.',
	'    main: opus',
	'    uses: [reviewer, tester, docs, explore]',
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

	const models = [model('opus'), model('haiku'), model('gpt')];
	const reserved = new Set(['explore']);

	test('resolves a playbook\'s plan, and none for a playbook that brings nothing', () => {
		assert.deepStrictEqual({
			feature: resolveModelRouterAgentPlan(router, 'feature', models, reserved),
			notes: resolveModelRouterAgentPlan(router, 'notes', models),
			// "No plan" is one value, so that plans can be compared by identity.
			quick: resolveModelRouterAgentPlan(router, 'quick', models),
			unknown: resolveModelRouterAgentPlan(router, 'nope', models),
			disabled: { ...resolveModelRouterAgentPlan(router, 'feature', [model('gpt', PolicyState.Disabled)], reserved), guidance: undefined },
		}, {
			feature: {
				router: 'Workday',
				playbook: 'feature',
				guidance: 'Plan first.',
				agents: [
					// An effort is checked against the role's own model, which here has no effort setting.
					{ name: 'reviewer', description: 'Reviews a change.', model: 'gpt', modelName: 'GPT' },
					// A role that names no model keeps its custom agent's, and gets the effort as written.
					{ name: 'docs', description: '', agent: 'Doc Writer', effort: 'high' },
				],
				// A role that names models runs on one of them or not at all, and no role takes a built-in agent's name.
				leftOut: [{ name: 'tester', reason: 'models' }, { name: 'explore', reason: 'name' }],
			},
			notes: { router: 'Workday', playbook: 'notes', guidance: 'Keep it short.', agents: [] },
			quick: undefined,
			unknown: undefined,
			// A model the organization turned off is not available either.
			disabled: {
				router: 'Workday', playbook: 'feature', guidance: undefined,
				agents: [{ name: 'docs', description: '', agent: 'Doc Writer', effort: 'high' }],
				leftOut: [{ name: 'reviewer', reason: 'models' }, { name: 'tester', reason: 'models' }, { name: 'explore', reason: 'name' }],
			},
		});
	});

	test('warns about roles that are left out on this account, and unused roles', () => {
		assert.deepStrictEqual(modelRouterRoleWarnings(router, [model('gpt')], reserved), [
			'Role `tester` (gone) is left out of chats: none of its models are available on this account.',
			'Role `explore` is left out of chats: an agent with that name is built in. Give the role another name.',
			'Role `spare` is not used by any playbook.',
		]);
	});

	test('a chat keeps only the agents its first session really got', () => {
		const plan = resolveModelRouterAgentPlan(router, 'feature', models, reserved)!;
		const installed = (...names: string[]) => names.map(agentType => ({ agentType, description: '' }));
		const reviewerOnly = installedModelRouterAgentPlan(plan, installed('reviewer'));
		assert.deepStrictEqual({
			// Plans are compared by identity, so a plan that was installed whole stays the same object.
			whole: installedModelRouterAgentPlan(plan, installed('reviewer', 'docs')) === plan,
			reviewerOnly: { agents: reviewerOnly?.agents.map(agent => agent.name), guidance: reviewerOnly?.guidance },
			guidanceOnly: installedModelRouterAgentPlan(plan, [])?.agents,
			nothing: installedModelRouterAgentPlan({ ...plan, guidance: undefined }, []),
		}, {
			whole: true,
			reviewerOnly: { agents: ['reviewer'], guidance: 'Plan first.' },
			guidanceOnly: [],
			nothing: undefined,
		});
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
