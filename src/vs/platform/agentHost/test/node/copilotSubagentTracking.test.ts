/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentTelemetryContext } from '../../common/agent.js';
import { CopilotSubagentTracking } from '../../node/copilot/copilotSubagentTracking.js';

suite('CopilotSubagentTracking', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const originalContext = { copilotSku: 'sku-a', copilotTrackingId: 'account-a' };
	const replacementContext = { copilotSku: 'sku-b', copilotTrackingId: 'account-b' };
	const rootTurn = { id: 'root-a', telemetryContext: originalContext };

	test('keeps identity and account attribution while active-turn ownership changes', () => {
		const tracking = store.add(new CopilotSubagentTracking());
		tracking.start({ toolCallId: 'task', agentId: 'agent', displayName: 'Explorer', parentToolCallId: undefined, rootTurn });
		const initiallyActive = tracking.hasActiveAgents;
		const firstCompletion = tracking.deactivate('agent');
		tracking.endTurn('task');
		const completed = {
			active: tracking.hasActiveAgents, hasRoot: tracking.hasRootTurn('task'),
			tool: tracking.getToolCallId('agent'), agent: tracking.getAgentId('task'),
			name: tracking.getDisplayName('agent'), context: tracking.getAccountContext('task'),
		};
		const secondCompletion = tracking.deactivate('agent');
		const resumed = tracking.resume('agent', 'root-b');
		tracking.observeRootTurn('task', 'root-c');
		const duplicateResume = tracking.resume('agent', 'root-c');
		assert.deepStrictEqual({
			initiallyActive, firstCompletion, secondCompletion, completed, resumed, duplicateResume,
			active: [...tracking.activeAgentIds],
			originalOwner: tracking.belongsToRootTurn('task', 'root-a'),
			newOwner: tracking.belongsToRootTurn('task', 'root-b'),
			context: tracking.getAccountContext('task'),
		}, {
			initiallyActive: true, firstCompletion: true, secondCompletion: false,
			completed: { active: false, hasRoot: false, tool: 'task', agent: 'agent', name: 'Explorer', context: originalContext },
			resumed: 'task', duplicateResume: undefined, active: ['agent'],
			originalOwner: false, newOwner: true, context: originalContext,
		});
	});

	test('a duplicate start updates routing and display without replacing captured context', () => {
		const tracking = store.add(new CopilotSubagentTracking());
		tracking.start({ toolCallId: 'task', agentId: undefined, displayName: '', parentToolCallId: undefined, rootTurn });
		tracking.endTurn('task');
		tracking.start({
			toolCallId: 'task', agentId: 'agent', displayName: 'Named child', parentToolCallId: undefined,
			rootTurn: { id: 'root-b', telemetryContext: replacementContext },
		});
		assert.deepStrictEqual({
			active: tracking.isActive('agent'), tool: tracking.getToolCallId('agent'), name: tracking.getDisplayName('agent'),
			newOwner: tracking.belongsToRootTurn('task', 'root-b'), context: tracking.getAccountContext('task'),
		}, { active: true, tool: 'task', name: 'Named child', newOwner: true, context: originalContext });
	});

	test('captures unavailable attribution once without adopting a later root account', () => {
		const tracking = store.add(new CopilotSubagentTracking());
		tracking.start({ toolCallId: 'task', agentId: 'agent', displayName: 'Child', parentToolCallId: undefined, rootTurn: undefined });
		tracking.start({ toolCallId: 'task', agentId: 'agent', displayName: 'Child', parentToolCallId: undefined, rootTurn });
		assert.deepStrictEqual({
			context: tracking.getAccountContext('task'), owner: tracking.belongsToRootTurn('task', 'root-a'),
		}, { context: undefined, owner: true });
	});

	test('nested children inherit original parent attribution, not active-root accounting', () => {
		const tracking = store.add(new CopilotSubagentTracking());
		tracking.start({ toolCallId: 'parent', agentId: 'parent-agent', displayName: 'Parent', parentToolCallId: undefined, rootTurn });
		tracking.deactivate('parent-agent');
		tracking.endTurn('parent');
		tracking.resume('parent-agent', 'root-b');
		for (const parentToolCallId of ['parent', 'unknown-parent']) {
			tracking.start({
				toolCallId: `child-of-${parentToolCallId}`, agentId: undefined, displayName: 'Child', parentToolCallId,
				rootTurn: { id: 'root-b', telemetryContext: replacementContext },
			});
		}
		assert.deepStrictEqual({
			childContext: tracking.getAccountContext('child-of-parent'),
			missingParentContext: tracking.getAccountContext('child-of-unknown-parent'),
			childOwner: tracking.belongsToRootTurn('child-of-parent', 'root-b'),
		}, { childContext: originalContext, missingParentContext: undefined, childOwner: true });
	});

	test('retains guarded readers instead of snapshotting account values', () => {
		const tracking = store.add(new CopilotSubagentTracking());
		let available = false;
		let valid = true;
		const context: IAgentTelemetryContext = {
			get copilotSku() { return available && valid ? 'sku-a' : undefined; },
			get copilotTrackingId() { return available && valid ? 'account-a' : undefined; },
		};
		tracking.start({ toolCallId: 'task', agentId: 'agent', displayName: 'Child', parentToolCallId: undefined, rootTurn: { id: 'root', telemetryContext: context } });
		const captured = tracking.getAccountContext('task');
		const pending = { ...captured };
		available = true;
		const discovered = { ...captured };
		valid = false;
		tracking.deactivate('agent');
		tracking.endTurn('task');
		tracking.resume('agent', 'replacement');
		assert.deepStrictEqual({ pending, discovered, invalidated: { ...tracking.getAccountContext('task') } }, {
			pending: { copilotSku: undefined, copilotTrackingId: undefined },
			discovered: originalContext,
			invalidated: { copilotSku: undefined, copilotTrackingId: undefined },
		});
	});

	test('early usage ownership does not capture account context or create SDK identity', () => {
		const tracking = store.add(new CopilotSubagentTracking());
		tracking.observeRootTurn('task', 'observed-root');
		tracking.observeRootTurn('task', 'different-root');
		const observed = {
			owner: tracking.belongsToRootTurn('task', 'observed-root'), context: tracking.getAccountContext('task'),
			active: tracking.hasActiveAgents, agent: tracking.getAgentId('task'),
		};
		tracking.endTurn('task');
		tracking.start({ toolCallId: 'task', agentId: undefined, displayName: 'Taskless', parentToolCallId: undefined, rootTurn });
		assert.deepStrictEqual({
			observed, startedOwner: tracking.belongsToRootTurn('task', rootTurn.id), context: tracking.getAccountContext('task'),
			active: tracking.hasActiveAgents,
		}, {
			observed: { owner: true, context: undefined, active: false, agent: undefined },
			startedOwner: true, context: originalContext, active: false,
		});
	});

	test('history and discovery labels never establish routing or overwrite a live name', () => {
		const tracking = store.add(new CopilotSubagentTracking());
		tracking.seedDisplayName('agent', 'History');
		tracking.seedDisplayName('agent', 'Discovery');
		const discovered = { name: tracking.getDisplayName('agent'), tool: tracking.getToolCallId('agent'), resumed: tracking.resume('agent', 'root') };
		tracking.start({ toolCallId: 'task', agentId: 'agent', displayName: 'Live', parentToolCallId: undefined, rootTurn });
		tracking.seedDisplayName('agent', 'Later discovery');
		tracking.seedDisplayName('blank', '   ');
		tracking.seedDisplayName('blank', 'Recovered label');
		assert.deepStrictEqual({ discovered, live: tracking.getDisplayName('agent'), blank: tracking.getDisplayName('blank') }, {
			discovered: { name: 'History', tool: undefined, resumed: undefined }, live: 'Live', blank: 'Recovered label',
		});
	});

	test('allows abort to deactivate every active agent during iteration', () => {
		const tracking = store.add(new CopilotSubagentTracking());
		for (const id of ['one', 'two', 'three']) {
			tracking.start({ toolCallId: id, agentId: id, displayName: id, parentToolCallId: undefined, rootTurn });
		}
		for (const id of tracking.activeAgentIds) {
			tracking.deactivate(id);
			tracking.endTurn(id);
		}
		assert.deepStrictEqual({
			active: tracking.hasActiveAgents, agents: [...tracking.activeAgentIds],
			owners: ['one', 'two', 'three'].map(id => tracking.hasRootTurn(id)),
			contexts: ['one', 'two', 'three'].map(id => tracking.getAccountContext(id)),
		}, { active: false, agents: [], owners: [false, false, false], contexts: [originalContext, originalContext, originalContext] });
	});

	test('resuming without a root leaves accounting unowned and disposal clears retained state', () => {
		const tracking = store.add(new CopilotSubagentTracking());
		tracking.start({ toolCallId: 'task', agentId: 'agent', displayName: 'Child', parentToolCallId: undefined, rootTurn });
		tracking.deactivate('agent');
		tracking.endTurn('task');
		tracking.resume('agent', undefined);
		const resumed = { active: tracking.isActive('agent'), owned: tracking.hasRootTurn('task'), context: tracking.getAccountContext('task') };
		tracking.dispose();
		assert.deepStrictEqual({
			resumed, active: tracking.hasActiveAgents, agents: [...tracking.activeAgentIds], owned: tracking.hasRootTurn('task'),
			context: tracking.getAccountContext('task'), tool: tracking.getToolCallId('agent'), agent: tracking.getAgentId('task'), name: tracking.getDisplayName('agent'),
		}, {
			resumed: { active: true, owned: false, context: originalContext }, active: false, agents: [], owned: false,
			context: undefined, tool: undefined, agent: undefined, name: undefined,
		});
	});
});
