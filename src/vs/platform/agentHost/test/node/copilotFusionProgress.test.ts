/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSystemNotificationKind, readAgentSystemNotificationMeta } from '../../common/meta/agentSystemNotificationMeta.js';
import { readToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { CopilotFusionProgress, isProvisionalFusionConversationEvent } from '../../node/copilot/copilotFusionProgress.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { fusionTestData as data, fusionTestEvent as event } from './copilotFusionTestEvents.js';

suite('CopilotFusionProgress', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('projects phase milestones and live activity without exposing phase content', () => {
		const progress = new CopilotFusionProgress();
		const routing = progress.accept(event('session.fusion_route_started', data.routeStarted));
		const selected = progress.accept(event('session.fusion_resolved', data.resolved));
		const started = progress.accept(event('assistant.fusion_phase_started', data.started));
		const completed = progress.accept(event('assistant.fusion_phase_completed', data.phaseCompleted));
		const final = progress.accept(event('session.fusion_completed', data.completed));
		assert.deepStrictEqual({
			routing: routing?.activity,
			selected: selected?.part?.content,
			running: started?.activity,
			phase: completed?.phase && {
				name: completed.phase.toolCall.displayName,
				status: completed.phase.toolCall.status,
				model: readToolCallMeta(completed.phase.toolCall).fusionPhase?.model,
				duration: readToolCallMeta(completed.phase.toolCall).fusionPhase?.duration,
			},
			final: final?.part?.content,
			finalActivity: final?.activity,
			finalKind: final?.part && readAgentSystemNotificationMeta(final.part).kind,
			leaksContent: JSON.stringify([selected, completed, final]).includes('PRIVATE'),
		}, {
			routing: 'Choosing a HydraFusion workflow...',
			selected: { markdown: new MarkdownString().appendText('Selected Cascade workflow').appendMarkdown('\n\nUsing Cascade: a solver will work on your request, then another model will review and fix up the result if needed.\n\n').appendText('Main pass → Review pass → Fix-up pass (if needed)').value },
			running: 'Main pass running with model-a',
			phase: { name: 'Main pass', status: 'completed', model: 'model-a', duration: 2000 },
			final: { markdown: 'HydraFusion&nbsp;workflow&nbsp;completed\n\nSelected&nbsp;response&nbsp;from&nbsp;model-a&nbsp;·&nbsp;2.3s' },
			finalActivity: undefined,
			finalKind: AgentSystemNotificationKind.FusionProgress,
			leaksContent: false,
		});
	});

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

	test('deduplicates durable milestones and ignores post-completion activity', () => {
		const progress = new CopilotFusionProgress();
		const selected = event('session.fusion_resolved', data.resolved);
		const phase = event('assistant.fusion_phase_completed', data.phaseCompleted);
		const final = event('session.fusion_completed', data.completed);
		progress.accept(selected);
		progress.accept(phase);
		progress.accept(final);
		assert.deepStrictEqual([
			progress.accept(selected), progress.accept(phase), progress.accept(final),
			progress.accept(event('assistant.fusion_phase_started', data.started)),
			progress.accept(event('assistant.fusion_phase_activity', data.activity)),
		], [undefined, undefined, undefined, undefined, undefined]);
	});

	test('only applies content-free activity to the active phase', () => {
		const progress = new CopilotFusionProgress();
		progress.accept(event('assistant.fusion_phase_started', data.started));
		const output = progress.accept(event('assistant.fusion_phase_activity', data.activity));
		const tool = progress.accept(event('assistant.fusion_phase_activity', { ...data.activity, activity: 'tool_started', toolCallId: 'opaque-id' }));
		const stale = progress.accept(event('assistant.fusion_phase_activity', { ...data.activity, phaseId: 'previous-phase' }));
		assert.deepStrictEqual({ output: output?.activity, tool: tool?.activity, stale, part: tool?.part }, {
			output: 'Main pass running with model-a',
			tool: 'Main pass: running a tool',
			stale: undefined,
			part: undefined,
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

	test('updates the model inside the same phase pill and creates a new pill for the next phase', () => {
		const progress = new CopilotFusionProgress();
		const first = progress.accept(event('assistant.fusion_phase_started', data.started))?.phase;
		const switched = progress.accept(event('assistant.fusion_phase_started', { ...data.started, model: 'replacement-model' }))?.phase;
		const review = progress.accept(event('assistant.fusion_phase_started', { ...data.started, phaseId: 'judge-1', phaseKind: 'judge', model: 'review-model', role: 'judge', conversationScope: 'review' }))?.phase;
		assert.deepStrictEqual({
			samePill: first?.toolCall.toolCallId === switched?.toolCall.toolCallId,
			firstIsNew: first?.isNew,
			switchedIsNew: switched?.isNew,
			switchedModel: switched && readToolCallMeta(switched.toolCall).fusionPhase?.model,
			nextIsNew: review?.isNew,
			nextTitle: review?.toolCall.displayName,
		}, {
			samePill: true, firstIsNew: true, switchedIsNew: false, switchedModel: 'replacement-model', nextIsNew: true, nextTitle: 'Review pass',
		});
	});

	test('ignores subagent events and allows a new turn after reset', () => {
		const progress = new CopilotFusionProgress();
		const selected = event('session.fusion_resolved', data.resolved);
		assert.strictEqual(progress.accept({ ...selected, agentId: 'subagent' }), undefined);
		progress.accept(selected);
		progress.accept(event('session.fusion_completed', data.completed));
		progress.reset();
		assert.ok(progress.accept(selected)?.part);
	});

	test('does not reopen a routing attempt after interruption', () => {
		const progress = new CopilotFusionProgress();
		progress.accept(event('session.fusion_route_started', data.routeStarted));
		const interrupted = progress.interrupt();
		assert.deepStrictEqual({
			status: interrupted?.part && readAgentSystemNotificationMeta(interrupted.part).fusionStatus,
			lateRoute: progress.accept(event('session.fusion_resolved', data.resolved)),
			latePhase: progress.accept(event('assistant.fusion_phase_started', data.started)),
		}, { status: 'cancelled', lateRoute: undefined, latePhase: undefined });
	});

	test('classifies provisional conversations but preserves committed messages and usage', () => {
		const fusion = { fusionId: 'fusion-1', syntheticModel: 'hydrafusion', policy: 'max', pattern: 'single' };
		assert.deepStrictEqual([
			isProvisionalFusionConversationEvent(event('assistant.message', { messageId: 'm1', content: 'draft', fusion }, { ephemeral: true })),
			isProvisionalFusionConversationEvent(event('assistant.message', { messageId: 'm1', content: 'final', fusion: { ...fusion, commitId: 'commit-1' } }, { ephemeral: true })),
			isProvisionalFusionConversationEvent(event('assistant.message', { messageId: 'm1', content: 'final', fusion })),
			isProvisionalFusionConversationEvent(event('tool.execution_start', { toolCallId: 't1', toolName: 'read', fusion }, { ephemeral: true })),
			isProvisionalFusionConversationEvent(event('tool.execution_complete', { toolCallId: 't1', success: true, fusion }, { ephemeral: true })),
		], [true, false, false, true, true]);
	});
});
