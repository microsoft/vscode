/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { parseModelRouter } from '../../common/modelRouter.js';
import { modelRouterGuidanceNote, resolveModelRouterGuidance } from '../../common/modelRouterGuidance.js';
import { PolicyState } from '../../common/state/protocol/channels-root/state.js';

function model(id: string): IAgentModelInfo {
	return { provider: 'copilotcli', id, name: id.toUpperCase(), supportsVision: true, policyState: PolicyState.Enabled };
}

const router = parseModelRouter([
	'version: 1',
	'display-name: Workday',
	'description: Test.',
	'routes:',
	'  - name: feature',
	'    model: [gone, opus]',
	'    when: Building.',
	'    guidance: Plan first.',
	'  - name: notes',
	'    model: opus',
	'    when: Writing.',
	'  - model: haiku',
	'    when: Questions.',
	'    guidance: Keep it short.',
	'',
].join('\n'), 'workday.model-router.yaml').router!;

suite('modelRouterGuidance', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const models = [model('opus'), model('haiku')];

	test('resolves the guidance of the route a turn was routed to, by its name or else its model', () => {
		assert.deepStrictEqual({
			named: resolveModelRouterGuidance(router, { routeName: 'feature', chosenModel: 'opus' }, models),
			unnamed: resolveModelRouterGuidance(router, { chosenModel: 'haiku' }, models),
			noGuidance: resolveModelRouterGuidance(router, { routeName: 'notes', chosenModel: 'opus' }, models),
			// A model alone never means a named route.
			modelOfNamedRoute: resolveModelRouterGuidance(router, { chosenModel: 'opus' }, models),
			unknown: resolveModelRouterGuidance(router, { routeName: 'nope', chosenModel: 'opus' }, models),
		}, {
			named: { router: 'Workday', route: 'feature', guidance: 'Plan first.' },
			unnamed: { router: 'Workday', guidance: 'Keep it short.' },
			noGuidance: undefined,
			modelOfNamedRoute: undefined,
			unknown: undefined,
		});
	});

	test('tells the main agent the route\'s guidance, or that earlier guidance no longer holds', () => {
		const note = (lines: readonly string[]) => [
			'<model_router_guidance>',
			'This note is for the main agent of this chat only. If you were started as a subagent, ignore it.',
			...lines,
			'</model_router_guidance>',
		].join('\n');
		const holds = 'What follows holds for this message and the ones after it, and replaces any model router guidance given earlier in this chat.';
		assert.deepStrictEqual({
			named: modelRouterGuidanceNote({ router: 'Workday', route: 'feature', guidance: 'Plan first.' }),
			unnamed: modelRouterGuidanceNote({ router: 'Workday', guidance: 'Keep it short.' }),
			none: modelRouterGuidanceNote(undefined),
		}, {
			named: note(['The user\'s model router "Workday" chose its "feature" route for this chat.', holds, '', 'How the user wants the work done:', 'Plan first.']),
			unnamed: note(['The user\'s model router "Workday" chose a route for this chat.', holds, '', 'How the user wants the work done:', 'Keep it short.']),
			none: note(['The route the user\'s model router chose for this chat has no guidance. Model router guidance given earlier in this chat no longer holds.']),
		});
	});
});
