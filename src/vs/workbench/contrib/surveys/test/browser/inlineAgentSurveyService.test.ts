/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAssignmentFilter, IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { InlineAgentSurveyService } from '../../browser/inlineAgentSurveyService.js';
import { IInlineAgentSurveyResponseContext, InlineAgentSurveyRating, InlineAgentSurveyReason, InlineAgentSurveySurface, InlineAgentSurveyTrigger } from '../../common/inlineAgentSurveyService.js';
import { InlineAgentSurveyTreatmentName } from '../../common/inlineAgentSurveyScheduler.js';
import { Event } from '../../../../../base/common/event.js';

class CapturingTelemetryService extends NullTelemetryServiceShape {
	readonly events: { eventName: string; data: any }[] = [];
	override publicLog2(...args: any[]): void {
		this.events.push({ eventName: args[0], data: args[1] });
	}
}

class FakeAssignmentService implements IWorkbenchAssignmentService {
	_serviceBrand: undefined;
	readonly onDidRefetchAssignments = Event.None;

	constructor(private readonly treatments: Record<string, string | number | boolean | undefined>) { }

	async getCurrentExperiments(): Promise<string[] | undefined> { return []; }
	async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
		return this.treatments[name] as T | undefined;
	}
	addTelemetryAssignmentFilter(_filter: IAssignmentFilter): void { }
}

function alwaysOnTreatments(): Record<string, string | number | boolean | undefined> {
	return {
		[InlineAgentSurveyTreatmentName.enabled]: true,
		[InlineAgentSurveyTreatmentName.firstResponseProbability]: 1,
		[InlineAgentSurveyTreatmentName.matureResponseProbability]: 1,
		[InlineAgentSurveyTreatmentName.matureMinTimeMs]: 0,
		[InlineAgentSurveyTreatmentName.matureMinUserTurns]: 0,
		[InlineAgentSurveyTreatmentName.globalCooldownMs]: 0,
	};
}

function responseContext(overrides?: Partial<IInlineAgentSurveyResponseContext>): IInlineAgentSurveyResponseContext {
	return {
		chatResource: URI.parse('vscode-local-chat-session://local/abc'),
		responseId: 'response-1',
		requestId: 'request-1',
		sessionType: 'local',
		modelId: 'gpt-test',
		surface: InlineAgentSurveySurface.AgentsWindow,
		isCopilotProvider: true,
		isAgentMode: true,
		completedUserTurns: 1,
		elapsedChatTimeMs: 0,
		isLatestResponse: true,
		isSystemInitiated: false,
		isTerminalSuccess: true,
		hasVisibleOutput: true,
		isPendingInput: false,
		...overrides,
	};
}

suite('InlineAgentSurveyService', () => {

	const store = new DisposableStore();
	let storageService: IStorageService;
	let configurationService: TestConfigurationService;
	let telemetry: CapturingTelemetryService;

	function createService(treatments = alwaysOnTreatments()): InlineAgentSurveyService {
		return store.add(new InlineAgentSurveyService(storageService, configurationService, telemetry, new FakeAssignmentService(treatments)));
	}

	setup(() => {
		storageService = store.add(new InMemoryStorageService());
		configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration('telemetry.feedback.enabled', true);
		telemetry = new CapturingTelemetryService();
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('selects a survey for an eligible live completion', async () => {
		const service = createService();
		const ctx = responseContext();
		await service.evaluateResponseCompletion(ctx);

		const pending = service.getPendingSurvey(ctx.chatResource, ctx.responseId);
		assert.ok(pending);
		assert.strictEqual(pending.trigger, InlineAgentSurveyTrigger.FirstResponse);
		assert.strictEqual(pending.surface, InlineAgentSurveySurface.AgentsWindow);
		assert.strictEqual(pending.dismissed, false);
	});

	test('does not roll historical (snapshotted) responses', async () => {
		const service = createService();
		const ctx = responseContext();
		service.snapshotHistoricalResponses(ctx.chatResource, [ctx.responseId]);
		await service.evaluateResponseCompletion(ctx);
		assert.strictEqual(service.getPendingSurvey(ctx.chatResource, ctx.responseId), undefined);
	});

	test('rolls a response at most once', async () => {
		// Second evaluation with an impossible probability must not overwrite/re-roll.
		const service = createService();
		const ctx = responseContext();
		await service.evaluateResponseCompletion(ctx);
		assert.ok(service.getPendingSurvey(ctx.chatResource, ctx.responseId));

		await service.evaluateResponseCompletion(ctx);
		// Still selected, unchanged.
		assert.ok(service.getPendingSurvey(ctx.chatResource, ctx.responseId));
	});

	test('respects telemetry.feedback.enabled', async () => {
		configurationService.setUserConfiguration('telemetry.feedback.enabled', false);
		const service = createService();
		const ctx = responseContext();
		await service.evaluateResponseCompletion(ctx);
		assert.strictEqual(service.getPendingSurvey(ctx.chatResource, ctx.responseId), undefined);
	});

	test('hides persisted surveys and suppresses lifecycle telemetry when feedback is disabled', async () => {
		const service = createService();
		const ctx = responseContext();
		await service.evaluateResponseCompletion(ctx);
		assert.ok(service.getPendingSurvey(ctx.chatResource, ctx.responseId));

		configurationService.setUserConfiguration('telemetry.feedback.enabled', false);
		assert.strictEqual(service.getPendingSurvey(ctx.chatResource, ctx.responseId), undefined);

		service.recordImpression(ctx);
		service.recordDismiss(ctx);
		service.recordUndo(ctx);
		service.recordRating(ctx, InlineAgentSurveyRating.No);
		service.recordSubmission(ctx, { rating: InlineAgentSurveyRating.No, reason: InlineAgentSurveyReason.WrongResult });
		assert.deepStrictEqual(telemetry.events, []);
	});

	test('does not show when master treatment is disabled', async () => {
		const treatments = alwaysOnTreatments();
		treatments[InlineAgentSurveyTreatmentName.enabled] = undefined;
		const service = createService(treatments);
		const ctx = responseContext();
		await service.evaluateResponseCompletion(ctx);
		assert.strictEqual(service.getPendingSurvey(ctx.chatResource, ctx.responseId), undefined);
	});

	test('records one impression per chat, updating global pacing', async () => {
		const service = createService();
		const ctx = responseContext();
		await service.evaluateResponseCompletion(ctx);
		service.recordImpression(ctx);

		const impressionEvents = telemetry.events.filter(e => e.data.action === 'impression');
		assert.strictEqual(impressionEvents.length, 1);

		// A second response in the same chat must not roll (per-chat cap).
		const ctx2 = responseContext({ responseId: 'response-2', requestId: 'request-2', completedUserTurns: 2 });
		await service.evaluateResponseCompletion(ctx2);
		assert.strictEqual(service.getPendingSurvey(ctx2.chatResource, ctx2.responseId), undefined);
	});

	test('global cooldown suppresses surveys in other chats', async () => {
		const treatments = alwaysOnTreatments();
		treatments[InlineAgentSurveyTreatmentName.globalCooldownMs] = 60 * 60 * 1000;
		const service = createService(treatments);

		const ctxA = responseContext();
		await service.evaluateResponseCompletion(ctxA);
		service.recordImpression(ctxA);

		const ctxB = responseContext({ chatResource: URI.parse('vscode-local-chat-session://local/other'), responseId: 'response-b' });
		await service.evaluateResponseCompletion(ctxB);
		assert.strictEqual(service.getPendingSurvey(ctxB.chatResource, ctxB.responseId), undefined);
	});

	test('pending survey persists across a reload (new service instance)', async () => {
		const first = createService();
		const ctx = responseContext();
		await first.evaluateResponseCompletion(ctx);
		assert.ok(first.getPendingSurvey(ctx.chatResource, ctx.responseId));

		// Simulate reload: a fresh service sharing the same storage.
		const second = createService();
		const restored = second.getPendingSurvey(ctx.chatResource, ctx.responseId);
		assert.ok(restored);
		assert.strictEqual(restored.responseId, ctx.responseId);
	});

	test('submission clears pending and logs a reason', async () => {
		const service = createService();
		const ctx = responseContext();
		await service.evaluateResponseCompletion(ctx);
		service.recordImpression(ctx);
		service.recordSubmission(ctx, { rating: InlineAgentSurveyRating.Partly, reason: InlineAgentSurveyReason.TooSlow });

		assert.strictEqual(service.getPendingSurvey(ctx.chatResource, ctx.responseId), undefined);
		const submission = telemetry.events.find(e => e.data.action === 'submission');
		assert.ok(submission);
		assert.strictEqual(submission.data.rating, InlineAgentSurveyRating.Partly);
		assert.strictEqual(submission.data.reasons, '1');
		assert.strictEqual(submission.data.trigger, InlineAgentSurveyTrigger.FirstResponse);
	});

	test('persists dismiss and undo state for a pending survey', async () => {
		const service = createService();
		const ctx = responseContext();
		await service.evaluateResponseCompletion(ctx);
		service.recordImpression(ctx);
		service.recordDismiss(ctx);
		assert.strictEqual(service.getPendingSurvey(ctx.chatResource, ctx.responseId)?.dismissed, true);

		service.recordUndo(ctx);
		assert.strictEqual(service.getPendingSurvey(ctx.chatResource, ctx.responseId)?.dismissed, false);
	});

	test('ineligible responses (pending input) are not surveyed', async () => {
		const service = createService();
		const ctx = responseContext({ isPendingInput: true });
		await service.evaluateResponseCompletion(ctx);
		assert.strictEqual(service.getPendingSurvey(ctx.chatResource, ctx.responseId), undefined);
	});
});
