/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/virtualScheduling/index.js';
import { readAgentSystemNotificationMeta } from '../../common/meta/agentSystemNotificationMeta.js';
import { readToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { CopilotFusionProgress, formatFusionReviewContent } from '../../node/copilot/copilotFusionProgress.js';
import { fusionMainPassTestData as mainPass, fusionTestData as data, fusionTestEvent as event } from './copilotFusionTestEvents.js';

suite('CopilotFusionProgress', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('names the HydraFusion model without the SDK workflow hint or the phase plan', () => {
		const result = new CopilotFusionProgress().accept(event('session.fusion_resolved', data.resolved));
		const content = JSON.stringify(result?.part?.content);
		assert.deepStrictEqual({
			hint: content.includes(data.resolved.hint),
			plan: content.includes('→'),
			model: result?.part && readAgentSystemNotificationMeta(result.part).fusionModel,
		}, { hint: false, plan: false, model: 'hydrafusion' });
	});

	test('streaming Single clears routing activity and keeps Fusion attribution and completion', () => {
		const progress = new CopilotFusionProgress();
		const routing = progress.accept(event('session.fusion_route_started', data.routeStarted));
		const resolved = progress.accept(event('session.fusion_resolved', { ...data.resolved, pattern: 'single', phasePlan: [] }));
		const completed = progress.accept(event('session.fusion_completed', {
			...data.completed, pattern: 'single', phaseCount: 0, finalSourcePhaseId: null, outcome: 'degraded',
		}));
		assert.deepStrictEqual({
			routing: routing?.activity,
			activity: resolved?.activity,
			selection: resolved?.part && readAgentSystemNotificationMeta(resolved.part).fusionStatus,
			model: resolved?.part && readAgentSystemNotificationMeta(resolved.part).fusionModel,
			completion: completed?.part && readAgentSystemNotificationMeta(completed.part).fusionStatus,
		}, {
			routing: 'Choosing a Copilot Fusion workflow...',
			activity: undefined,
			selection: 'selected',
			model: 'hydrafusion',
			completion: 'degraded',
		});
	});

	test('keeps preparing activity for staged Single and other Fusion patterns', () => {
		const legacySingle = event('session.fusion_resolved', { ...data.resolved, pattern: 'single' });
		Reflect.deleteProperty(legacySingle.data, 'phasePlan');
		const routes = [
			legacySingle,
			event('session.fusion_resolved', { ...data.resolved, pattern: 'single', phasePlan: data.resolved.phasePlan.slice(0, 1) }),
			event('session.fusion_resolved', { ...data.resolved, pattern: 'cascade', phasePlan: [] }),
			event('session.fusion_resolved', { ...data.resolved, pattern: 'critique', phasePlan: [] }),
		];
		assert.deepStrictEqual(routes.map(route => new CopilotFusionProgress().accept(route)?.activity), [
			'Preparing the Single workflow...',
			'Preparing the Single workflow...',
			'Preparing the Cascade workflow...',
			'Preparing the Critique workflow...',
		]);
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
		const degraded = new CopilotFusionProgress().accept(event('session.fusion_completed', { ...data.completed, outcome: 'degraded' }));
		assert.deepStrictEqual({
			activity: started?.activity,
			progress: started?.phase && readToolCallMeta(started.phase.toolCall).progressMessage,
			model: phase?.phase && readToolCallMeta(phase.phase.toolCall).fusionPhase?.model,
			phaseContent: phase?.phase?.toolCall.status === 'completed' ? phase.phase.toolCall.content : undefined,
			completedPart: completed?.part,
			degradedContent: degraded?.part?.content,
		}, {
			activity: 'Fix-up pass running',
			progress: 'Fix-up pass running',
			model: 'model-a',
			phaseContent: [{ type: 'text', text: 'Fix-up&nbsp;pass&nbsp;completed\n\nDuration:&nbsp;2s' }],
			completedPart: undefined,
			degradedContent: { markdown: 'Copilot&nbsp;Fusion&nbsp;workflow&nbsp;completed&nbsp;with&nbsp;a&nbsp;fallback' },
		});
	});

	test('keeps an abnormal ending as a degraded row without a duration', () => {
		const ended = new CopilotFusionProgress().accept(event('session.fusion_completed', { ...data.completed, outcome: 'failed' }));
		assert.deepStrictEqual({
			content: ended?.part?.content,
			status: ended?.part && readAgentSystemNotificationMeta(ended.part).fusionStatus,
		}, {
			content: { markdown: 'Copilot&nbsp;Fusion&nbsp;workflow&nbsp;ended:&nbsp;failed' },
			status: 'degraded',
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

	test('milestones name the HydraFusion model the runtime routed with, including interruptions', () => {
		const fusionModel = (update: ReturnType<CopilotFusionProgress['accept']>) => update?.part && readAgentSystemNotificationMeta(update.part).fusionModel;
		const progress = new CopilotFusionProgress();
		progress.accept(event('session.fusion_route_started', { ...data.routeStarted, syntheticModel: 'hydrafusion-max' }));
		const routing = fusionModel(progress.interrupt());
		progress.reset();
		const selected = fusionModel(progress.accept(event('session.fusion_resolved', { ...data.resolved, syntheticModel: 'hydrafusion-max' })));
		const afterRouting = fusionModel(progress.interrupt());
		assert.deepStrictEqual({ routing, selected, afterRouting }, { routing: 'hydrafusion-max', selected: 'hydrafusion-max', afterRouting: 'hydrafusion-max' });
	});

	test('names the model of the pass that writes into the chat once per change, live and replayed', () => {
		const named = (update: ReturnType<CopilotFusionProgress['accept']>, part = update?.passModel) => part && {
			status: readAgentSystemNotificationMeta(part).fusionStatus,
			model: readAgentSystemNotificationMeta(part).fusionPassModel,
			content: part.content,
		};
		const live = new CopilotFusionProgress();
		const resolved = live.accept(event('session.fusion_resolved', data.resolved));
		const plannedModel = live.accept(event('assistant.fusion_phase_started', mainPass.started));
		const review = live.accept(event('assistant.fusion_phase_started', { ...data.started, phaseId: 'phase-2', phaseKind: 'judge', model: 'model-b' }));
		const otherModel = live.accept(event('assistant.fusion_phase_started', { ...mainPass.started, phaseId: 'phase-3', model: 'model-c' }));
		const otherModelCompleted = live.accept(event('assistant.fusion_phase_completed', { ...mainPass.phaseCompleted, phaseId: 'phase-3', model: 'model-c' }));
		live.reset();
		const followUp = live.accept(event('assistant.fusion_phase_started', { ...data.started, phaseKind: 'follow_up' }));
		const replayed = new CopilotFusionProgress().accept(event('assistant.fusion_phase_completed', { ...data.phaseCompleted, phaseKind: 'follow_up' }));
		const failedRouting = new CopilotFusionProgress();
		const routeFailed = failedRouting.accept(event('session.fusion_route_failed', data.routeFailed));
		const fallback = failedRouting.accept(event('assistant.fusion_phase_started', mainPass.started));
		assert.deepStrictEqual({
			resolved: named(resolved, resolved?.part),
			plannedModel: named(plannedModel),
			review: named(review),
			otherModel: named(otherModel),
			otherModelCompleted: named(otherModelCompleted),
			followUp: named(followUp),
			replayed: named(replayed),
			routeFailed: named(routeFailed, routeFailed?.part),
			fallback: named(fallback),
		}, {
			resolved: { status: 'selected', model: 'model-a', content: { markdown: 'Selected&nbsp;Cascade&nbsp;workflow' } },
			plannedModel: undefined,
			review: undefined,
			otherModel: { status: 'selected', model: 'model-c', content: { markdown: 'Main&nbsp;pass&nbsp;started' } },
			otherModelCompleted: undefined,
			followUp: { status: 'selected', model: 'model-a', content: { markdown: 'Follow-up&nbsp;pass&nbsp;started' } },
			replayed: { status: 'selected', model: 'model-a', content: { markdown: 'Follow-up&nbsp;pass&nbsp;started' } },
			routeFailed: { status: 'degraded', model: 'model-a', content: { markdown: 'Copilot&nbsp;Fusion&nbsp;routing&nbsp;failed;&nbsp;continuing&nbsp;with&nbsp;model-a' } },
			fallback: undefined,
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

	test('renders critic and judge output as readable markdown and keeps unstructured text', () => {
		assert.deepStrictEqual({
			approved: formatFusionReviewContent(JSON.stringify({ assessment: 'approve', feedback: 'All 13 tests pass.', defect: null })),
			revise: formatFusionReviewContent(JSON.stringify({ assessment: 'revise', feedback: 'Negative input is accepted.', defect: { target: 'parseDuration', evidence: '"-5s" returns -5000' } })),
			judge: formatFusionReviewContent(JSON.stringify({ score: 3, rationale: 'Missing edge cases.' })),
			text: formatFusionReviewContent('Looks right to me.'),
			array: formatFusionReviewContent('[1, 2]'),
			empty: formatFusionReviewContent('  '),
		}, {
			approved: '**Approved**\n\nAll 13 tests pass.',
			revise: '**Changes requested**\n\nNegative input is accepted.\n\n**Issue:** parseDuration — "-5s" returns -5000',
			judge: '**Score: 3/5**\n\nMissing edge cases.',
			text: 'Looks right to me.',
			array: '[1, 2]',
			empty: undefined,
		});
	});

});
