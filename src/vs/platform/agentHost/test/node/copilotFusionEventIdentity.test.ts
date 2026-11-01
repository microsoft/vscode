/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CopilotFusionRequestCorrelation, isRemoteSteeredUserMessage, isSyntheticUserMessage } from '../../node/copilot/copilotFusionEventIdentity.js';
import { fusionTestData as data, fusionTestEvent as event } from './copilotFusionTestEvents.js';

suite('isSyntheticUserMessage', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies user.message sources', () => {
		const cases = [
			{ name: 'no source', source: undefined, agentId: undefined },
			{ name: 'user', source: 'user', agentId: undefined },
			{ name: 'remote control', source: 'command-a023a7ea-d4b5-48b9-b600-9cf7d83a2f28', agentId: undefined },
			{ name: 'remote control (uppercase)', source: 'COMMAND-1', agentId: undefined },
			{ name: 'skill', source: 'skill', agentId: undefined },
			{ name: 'inter-agent', source: 'agent-parent', agentId: 'worker' },
			{ name: 'subagent skill', source: 'skill-testing', agentId: 'worker' },
			{ name: 'command source on a subagent', source: 'command-1', agentId: 'worker' },
		];
		assert.deepStrictEqual(cases.map(({ name, source, agentId }) => {
			const e = event('user.message', { content: 'Prompt', ...(source ? { source } : {}) }, agentId ? { agentId } : undefined);
			return { name, synthetic: isSyntheticUserMessage(e), remote: isRemoteSteeredUserMessage(e) };
		}), [
			{ name: 'no source', synthetic: false, remote: false },
			{ name: 'user', synthetic: false, remote: false },
			{ name: 'remote control', synthetic: false, remote: true },
			{ name: 'remote control (uppercase)', synthetic: false, remote: true },
			{ name: 'skill', synthetic: true, remote: false },
			{ name: 'inter-agent', synthetic: false, remote: false },
			{ name: 'subagent skill', synthetic: true, remote: false },
			{ name: 'command source on a subagent', synthetic: true, remote: false },
		]);
	});

	test('ignores other event types', () => {
		assert.strictEqual(isSyntheticUserMessage(event('assistant.message', { messageId: 'm', content: 'Reply' })), false);
		assert.strictEqual(isRemoteSteeredUserMessage(event('assistant.message', { messageId: 'm', content: 'Reply' })), false);
	});
});

suite('CopilotFusionRequestCorrelation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('follows durable preparation events without propagating across the user echo', () => {
		const correlation = new CopilotFusionRequestCorrelation();
		correlation.observe(event('session.fusion_resolved', data.resolved, { id: 'route' }));
		correlation.observe(event('session.info', { infoType: 'test', message: 'Preparing' }, { id: 'info', parentId: 'route' }));
		const echo = event('user.message', { content: 'Request', turnId: '0' }, { id: 'user', parentId: 'info' });
		correlation.observe(echo);
		assert.deepStrictEqual({
			beforeEcho: correlation.getPrecedingResolution(echo),
			afterEcho: correlation.getPrecedingResolution(event('user.message', { content: 'Next request' }, { parentId: 'user' })),
		}, {
			beforeEcho: { fusionId: data.resolved.fusionId, turnId: data.resolved.turnId },
			afterEcho: undefined,
		});
	});

	for (const boundary of [
		event('abort', { reason: 'user_initiated' }),
		event('session.idle', {}, { ephemeral: true }),
		event('session.fusion_completed', data.completed),
	]) {
		test(`does not recover abandoned routing across ${boundary.type}`, () => {
			const correlation = new CopilotFusionRequestCorrelation();
			correlation.observe(event('session.fusion_resolved', data.resolved, { id: 'route' }));
			correlation.observe(boundary);
			assert.strictEqual(correlation.getPrecedingResolution(event('user.message', { content: 'Next request' }, { parentId: 'route' })), undefined);
		});
	}

	test('does not substitute a subagent resolution for the root resolution', () => {
		const correlation = new CopilotFusionRequestCorrelation();
		correlation.observe(event('session.fusion_resolved', data.resolved, { id: 'root-route' }));
		correlation.observe(event('session.fusion_resolved', { ...data.resolved, fusionId: 'child-fusion', turnId: 'child-turn' }, { id: 'child-route', parentId: 'root-route', agentId: 'child' }));
		correlation.observe(event('user.message', { content: 'Synthetic context', source: 'agent' }, { id: 'synthetic', parentId: 'child-route' }));
		assert.deepStrictEqual(
			correlation.getPrecedingResolution(event('user.message', { content: 'Request' }, { parentId: 'synthetic' })),
			{ fusionId: data.resolved.fusionId, turnId: data.resolved.turnId },
		);
	});

	test('a late workflow completion does not discard a newer route', () => {
		const correlation = new CopilotFusionRequestCorrelation();
		correlation.observe(event('session.fusion_resolved', data.resolved, { id: 'old-route' }));
		correlation.observe(event('session.fusion_resolved', { ...data.resolved, fusionId: 'new-fusion', turnId: 'new-turn' }, { id: 'new-route' }));
		correlation.observe(event('session.fusion_completed', data.completed, { id: 'old-completion', parentId: 'new-route' }));
		assert.deepStrictEqual({
			old: correlation.getPrecedingResolution(event('user.message', { content: 'Old request' }, { parentId: 'old-route' })),
			current: correlation.getPrecedingResolution(event('user.message', { content: 'Request' }, { parentId: 'old-completion' })),
		}, {
			old: undefined,
			current: { fusionId: 'new-fusion', turnId: 'new-turn' },
		});
	});

	test('bounds retained ancestry without losing an advancing durable chain', () => {
		const correlation = new CopilotFusionRequestCorrelation();
		correlation.observe(event('session.fusion_resolved', data.resolved, { id: 'route' }));
		let parentId = 'route';
		for (let index = 0; index < 1024; index++) {
			const id = `info-${index}`;
			correlation.observe(event('session.info', { infoType: 'test', message: 'Preparing' }, { id, parentId }));
			parentId = id;
		}
		assert.deepStrictEqual({
			old: correlation.getPrecedingResolution(event('user.message', { content: 'Old request' }, { parentId: 'route' })),
			current: correlation.getPrecedingResolution(event('user.message', { content: 'Request' }, { parentId })),
		}, {
			old: undefined,
			current: { fusionId: data.resolved.fusionId, turnId: data.resolved.turnId },
		});
	});
});
