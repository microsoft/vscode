/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readAgentSystemNotificationMeta } from '../../common/meta/agentSystemNotificationMeta.js';
import { readToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { ResponsePartKind, type ResponsePart } from '../../common/state/sessionState.js';
import { FusionReplayState } from '../../node/copilot/copilotFusionReplay.js';
import { fusionTestData as data, fusionTestEvent as event } from './copilotFusionTestEvents.js';

suite('FusionReplayState', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const active = { requestActive: true, hasTurn: true };
	const idle = { requestActive: false, hasTurn: true };

	function statuses(parts: readonly ResponsePart[]) {
		return parts.map(part => part.kind === ResponsePartKind.SystemNotification
			? readAgentSystemNotificationMeta(part).fusionStatus
			: part.kind === ResponsePartKind.ToolCall ? readToolCallMeta(part.toolCall).fusionPhase?.status : undefined);
	}

	for (const hasTurn of [false, true]) {
		test(`buffers early routing for its next turn ${hasTurn ? 'after an old turn' : 'before the first turn'}`, () => {
			const replay = new FusionReplayState();
			const previous: ResponsePart[] = [];
			const next: ResponsePart[] = [];
			replay.observe(event('session.fusion_route_started', data.routeStarted), { requestActive: false, hasTurn });
			replay.observe(event('session.fusion_resolved', data.resolved), { requestActive: false, hasTurn });
			replay.observe(event('assistant.fusion_phase_started', data.started), { requestActive: false, hasTurn });
			const early = replay.drain(previous);
			replay.beginTurn('next');
			const firstDrain = replay.drain(next);
			replay.observe(event('session.fusion_resolved', data.resolved), active);
			const duplicateDrain = replay.drain(next);
			replay.observe(event('assistant.fusion_phase_completed', data.phaseCompleted), active);
			replay.drain(next);
			assert.deepStrictEqual({
				early,
				firstDrain,
				duplicateDrain,
				previous: statuses(previous),
				next: statuses(next),
			}, { early: false, firstDrain: true, duplicateDrain: false, previous: [], next: ['selected', 'succeeded'] });
		});
	}

	test('retains attempt and workflow ownership across interruption and a new turn', () => {
		const replay = new FusionReplayState([
			event('user.message', { content: 'First', turnId: data.resolved.turnId }, { id: 'first' }),
			event('user.message', { content: 'Next', turnId: 'sdk-next' }, { id: 'next' }),
		]);
		const first: ResponsePart[] = [];
		const next: ResponsePart[] = [];
		replay.beginTurn('first');
		replay.observe(event('session.fusion_route_started', data.routeStarted), active);
		replay.observe(event('session.fusion_resolved', data.resolved), active);
		replay.interrupt();
		replay.drain(first);
		replay.beginTurn('next');
		replay.observe(event('session.fusion_route_failed', data.routeFailed), active);
		replay.observe(event('assistant.fusion_phase_failed', data.phaseFailed), active);
		replay.observe(event('session.fusion_completed', data.completed), active);
		const lateDrain = replay.drain(next);
		replay.observe(event('session.fusion_resolved', { ...data.resolved, fusionId: 'fusion-2', turnId: 'sdk-next' }), active);
		replay.drain(next);
		assert.deepStrictEqual({ first: statuses(first), next: statuses(next), lateDrain }, {
			first: ['selected', 'cancelled'], next: ['selected'], lateDrain: false,
		});
	});

	test('ephemeral events establish ownership without becoming durable parts', () => {
		const replay = new FusionReplayState();
		const first: ResponsePart[] = [];
		const next: ResponsePart[] = [];
		replay.beginTurn('first');
		replay.observe(event('session.fusion_route_started', data.routeStarted), active);
		replay.observe(event('assistant.fusion_phase_started', data.started), active);
		const ephemeralDrain = replay.drain(first);
		replay.beginTurn('next');
		replay.observe(event('session.fusion_route_failed', data.routeFailed), active);
		replay.observe(event('assistant.fusion_phase_completed', data.phaseCompleted), active);
		replay.observe(event('session.fusion_completed', data.completed), active);
		assert.deepStrictEqual({ ephemeralDrain, lateDrain: replay.drain(next), first, next }, {
			ephemeralDrain: false, lateDrain: false, first: [], next: [],
		});
	});

	test('subagent events cannot claim root workflow ownership or reset root interruption', () => {
		const replay = new FusionReplayState([
			event('user.message', { content: 'First' }, { id: 'first' }),
			event('user.message', { content: 'Next', turnId: 'sdk-next' }, { id: 'next' }),
		]);
		const parts: ResponsePart[] = [];
		const agent = { agentId: 'child' };
		replay.observe(event('session.fusion_route_started', data.routeStarted), { requestActive: false, hasTurn: false });
		replay.observe(event('session.fusion_route_failed', data.routeFailed), { requestActive: false, hasTurn: false });
		replay.beginTurn('first');
		replay.observe(event('session.fusion_resolved', data.resolved, agent), active);
		replay.interrupt();
		replay.drain(parts);
		replay.observe(event('session.fusion_resolved', { ...data.resolved, fusionId: 'child-fusion' }, agent), idle);
		replay.observe(event('session.fusion_completed', data.completed), idle);
		replay.drain(parts);
		replay.beginTurn('next');
		replay.observe(event('session.fusion_resolved', { ...data.resolved, fusionId: 'child-fusion', turnId: 'sdk-next' }), active);
		replay.drain(parts);
		assert.deepStrictEqual(statuses(parts), ['degraded', 'cancelled', 'selected']);
	});

	test('interrupts a pending routing fallback without appending it to the previous turn', () => {
		const replay = new FusionReplayState();
		const previous: ResponsePart[] = [];
		const next: ResponsePart[] = [];
		replay.observe(event('session.fusion_route_failed', data.routeFailed), idle);
		replay.interrupt();
		replay.interrupt();
		const early = replay.drain(previous);
		replay.beginTurn('next');
		replay.drain(next);
		replay.observe(event('session.fusion_completed', data.completed), active);
		assert.deepStrictEqual({ early, previous, next: statuses(next), late: replay.drain(next) }, {
			early: false, previous: [], next: ['degraded', 'cancelled'], late: false,
		});
	});

	test('deduplicates repeated phase completion without interrupting a completed workflow', () => {
		const replay = new FusionReplayState();
		const parts: ResponsePart[] = [];
		replay.beginTurn('first');
		replay.observe(event('assistant.fusion_phase_completed', data.phaseCompleted), active);
		replay.drain(parts);
		replay.observe(event('assistant.fusion_phase_completed', data.phaseCompleted), active);
		replay.observe(event('session.fusion_completed', data.completed), active);
		replay.drain(parts);
		replay.interrupt();
		assert.deepStrictEqual({ statuses: statuses(parts), interrupted: replay.drain(parts) }, {
			statuses: ['succeeded', 'completed'], interrupted: false,
		});
	});

	test('does not guess ownership when an SDK turn id is shared by two requests', () => {
		const replay = new FusionReplayState([
			event('user.message', { content: 'First', turnId: data.resolved.turnId }, { id: 'first' }),
			event('user.message', { content: 'Next', turnId: data.resolved.turnId }, { id: 'next' }),
		]);
		const first: ResponsePart[] = [];
		const next: ResponsePart[] = [];
		replay.beginTurn('first');
		replay.observe(event('session.fusion_resolved', data.resolved), active);
		replay.interrupt();
		replay.drain(first);
		replay.beginTurn('next');
		replay.observe(event('session.fusion_resolved', { ...data.resolved, fusionId: 'unowned-fusion' }), active);
		replay.observe(event('assistant.fusion_phase_completed', { ...data.phaseCompleted, fusionId: 'unowned-fusion' }), active);
		assert.deepStrictEqual({ first: statuses(first), drained: replay.drain(next), next }, {
			first: ['selected', 'cancelled'], drained: false, next: [],
		});
	});

	test('an active request is not proof of ownership after cancellation', () => {
		const replay = new FusionReplayState([
			event('user.message', { content: 'First' }, { id: 'first' }),
			event('user.message', { content: 'Second' }, { id: 'second' }),
			event('user.message', { content: 'Third', turnId: 'sdk-third' }, { id: 'third' }),
		]);
		const unowned: ResponsePart[] = [];
		const owned: ResponsePart[] = [];
		replay.beginTurn('first');
		replay.interrupt();
		replay.beginTurn('second');
		replay.observe(event('session.fusion_resolved', data.resolved), active);
		replay.observe(event('assistant.fusion_phase_completed', data.phaseCompleted), active);
		const unownedDrained = replay.drain(unowned);
		replay.beginTurn('third');
		replay.observe(event('session.fusion_resolved', { ...data.resolved, fusionId: 'fusion-third', turnId: 'sdk-third' }), active);
		const ownedDrained = replay.drain(owned);

		assert.deepStrictEqual({ unownedDrained, unowned, ownedDrained, owned: statuses(owned) }, {
			unownedDrained: false, unowned: [], ownedDrained: true, owned: ['selected'],
		});
	});
});
