/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { readAgentSystemNotificationMeta } from '../../common/meta/agentSystemNotificationMeta.js';
import { readToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { CopilotFusionProgress } from '../../node/copilot/copilotFusionProgress.js';
import { fusionTestData as data, fusionTestEvent as event } from './copilotFusionTestEvents.js';

suite('CopilotFusionProgress', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('explains each pattern without promising task-specific actions or requiring a phase plan', () => {
		const descriptions = [
			['single', 'Using Single: one solver will work on your request.'],
			['cascade', 'Using Cascade: a solver will work on your request, then another model will review and fix up the result if needed.'],
			['critique', 'Using Critique: a solver will draft a result, another model will critique it, and the original solver will revise it if needed.'],
		] as const;
		for (const [pattern, description] of descriptions) {
			const progress = new CopilotFusionProgress();
			const result = progress.accept(event('session.fusion_resolved', { ...data.resolved, pattern, phasePlan: undefined }));
			assert.ok(JSON.stringify(result?.part?.content).includes(description));
		}
	});

	test('uses CLI phase labels consistently for live and replayed phases', () => {
		for (const [phaseKind, pattern, label] of [
			['repair', 'cascade', 'Fix-up pass'],
			['draft', 'critique', 'First pass'],
			['draft', 'single', 'Main pass'],
		] as const) {
			const live = new CopilotFusionProgress();
			const replay = new CopilotFusionProgress();
			replay.accept(event('session.fusion_resolved', { ...data.resolved, pattern }));
			assert.deepStrictEqual({
				live: live.accept(event('assistant.fusion_phase_started', { ...data.started, phaseKind, pattern }))?.phase?.toolCall.displayName,
				replay: replay.accept(event('assistant.fusion_phase_completed', { ...data.phaseCompleted, phaseKind }))?.phase?.toolCall.displayName,
			}, { live: label, replay: label });
		}
	});

	test('keeps raw model identifiers in phase metadata rather than activity or completion details', () => {
		const progress = new CopilotFusionProgress();
		const started = progress.accept(event('assistant.fusion_phase_started', data.started));
		const phase = progress.accept(event('assistant.fusion_phase_completed', data.phaseCompleted));
		const completed = progress.accept(event('session.fusion_completed', data.completed));
		assert.deepStrictEqual({
			activity: started?.activity,
			progress: started?.phase && readToolCallMeta(started.phase.toolCall).progressMessage,
			model: phase?.phase && readToolCallMeta(phase.phase.toolCall).fusionPhase?.model,
			phaseContent: phase?.phase?.toolCall.status === 'completed' ? phase.phase.toolCall.content : undefined,
			completedContent: completed?.part?.content,
		}, {
			activity: 'Main pass running',
			progress: 'Main pass running',
			model: 'model-a',
			phaseContent: [{ type: 'text', text: 'Main&nbsp;pass&nbsp;completed\n\nDuration:&nbsp;2s' }],
			completedContent: { markdown: 'HydraFusion&nbsp;workflow&nbsp;completed\n\nDuration:&nbsp;2.3s' },
		});
	});

	test('handles failures, cancellation, and interruption without success icons', () => {
		const progress = new CopilotFusionProgress();
		progress.accept(event('session.fusion_route_started', data.routeStarted));
		const failedRoute = progress.accept(event('session.fusion_route_failed', data.routeFailed));
		progress.reset();
		progress.accept(event('assistant.fusion_phase_started', data.started));
		const failedPhase = progress.accept(event('assistant.fusion_phase_failed', data.phaseFailed));
		const degraded = progress.accept(event('session.fusion_completed', { ...data.completed, outcome: 'degraded', degradedReason: 'phase_failed' }));
		progress.reset();
		progress.accept(event('assistant.fusion_phase_started', data.started));
		const interrupted = progress.interrupt();
		assert.deepStrictEqual({
			statuses: [
				failedRoute?.part && readAgentSystemNotificationMeta(failedRoute.part).fusionStatus,
				failedPhase?.phase && readToolCallMeta(failedPhase.phase.toolCall).fusionPhase?.status,
				degraded?.part && readAgentSystemNotificationMeta(degraded.part).fusionStatus,
				interrupted?.phase && readToolCallMeta(interrupted.phase.toolCall).fusionPhase?.status,
			],
			failedRouteActivity: failedRoute?.activity,
			failedPhaseActivity: failedPhase?.activity,
			leaksDetail: JSON.stringify(failedPhase).includes('PRIVATE'),
			secondInterrupt: progress.interrupt(),
		}, {
			statuses: ['degraded', 'failed', 'degraded', 'cancelled'],
			failedRouteActivity: undefined,
			failedPhaseActivity: undefined,
			leaksDetail: false,
			secondInterrupt: undefined,
		});
	});

	test('persists historical interruption duration from the first phase start and resets timing for the next turn', () => {
		const progress = new CopilotFusionProgress();
		const startedAt = '2020-01-01T12:00:00.000Z';
		progress.accept(event('assistant.fusion_phase_started', data.started, { timestamp: startedAt }));
		progress.accept(event('assistant.fusion_phase_started', { ...data.started, model: 'replacement-model' }, { timestamp: '2020-01-01T12:00:02.000Z' }));
		const interrupted = progress.interrupt('2020-01-01T12:00:05.250Z');
		const duplicate = progress.interrupt('2020-01-01T12:00:10.000Z');
		const lateCompletion = progress.accept(event('assistant.fusion_phase_completed', data.phaseCompleted));
		progress.reset();
		progress.accept(event('assistant.fusion_phase_started', data.started, { timestamp: '2020-01-01T13:00:00.000Z' }));
		const next = progress.interrupt('2020-01-01T13:00:01.000Z');
		assert.deepStrictEqual({
			phase: interrupted?.phase && readToolCallMeta(interrupted.phase.toolCall).fusionPhase,
			duplicate,
			lateCompletion,
			nextDuration: next?.phase && readToolCallMeta(next.phase.toolCall).fusionPhase?.duration,
		}, {
			phase: { fusionId: data.started.fusionId, phaseId: data.started.phaseId, model: 'replacement-model', status: 'cancelled', startedAt: Date.parse(startedAt), duration: 5250 },
			duplicate: undefined,
			lateCompletion: undefined,
			nextDuration: 1000,
		});
	});

	test('uses current time for missing or invalid interruption timestamps and clamps clock skew', () => runWithFakedTimers({ startTime: 10000 }, async () => {
		const durations = [undefined, 'invalid', '1970-01-01T00:00:07.000Z'].map(timestamp => {
			const progress = new CopilotFusionProgress();
			progress.accept(event('assistant.fusion_phase_started', data.started, { timestamp: '1970-01-01T00:00:08.000Z' }));
			const interrupted = progress.interrupt(timestamp);
			return interrupted?.phase && readToolCallMeta(interrupted.phase.toolCall).fusionPhase?.duration;
		});
		assert.deepStrictEqual(durations, [2000, 2000, 0]);
	}));

	test('does not replace SDK terminal durations or interrupt completed workflows', () => {
		const terminalEvents = [
			event('assistant.fusion_phase_completed', { ...data.phaseCompleted, durationMs: 1500 }),
			event('assistant.fusion_phase_failed', { ...data.phaseFailed, durationMs: 1500 }),
			event('assistant.fusion_phase_failed', { ...data.phaseFailed, status: 'cancelled', durationMs: 1500 }),
		];
		assert.deepStrictEqual(terminalEvents.map(terminalEvent => {
			const progress = new CopilotFusionProgress();
			progress.accept(event('assistant.fusion_phase_started', data.started));
			const terminal = progress.accept(terminalEvent);
			const interrupted = progress.interrupt('2030-01-01T00:00:00.000Z');
			const completed = new CopilotFusionProgress();
			completed.accept(event('assistant.fusion_phase_started', data.started));
			completed.accept(terminalEvent);
			completed.accept(event('session.fusion_completed', data.completed));
			return {
				duration: terminal?.phase && readToolCallMeta(terminal.phase.toolCall).fusionPhase?.duration,
				interruptedPhase: interrupted?.phase,
				completedInterruption: completed.interrupt('2030-01-01T00:00:00.000Z'),
			};
		}), terminalEvents.map(() => ({
			duration: 1500, interruptedPhase: undefined, completedInterruption: undefined,
		})));
	});

});
