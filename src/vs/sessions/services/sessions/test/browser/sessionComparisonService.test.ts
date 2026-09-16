/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { hasKey } from '../../../../../base/common/types.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatService, IChatUsage } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatInteractivity, ISession, SessionStatus } from '../../common/session.js';
import { ISessionComparisonVerdict, SessionComparisonDecisionAssessment, SessionComparisonParticipantRole, SessionComparisonValidationState } from '../../common/sessionComparison.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsManagementService, NewSessionRequestOptions } from '../../common/sessionsManagement.js';
import { ISessionChangeEvent } from '../../common/sessionsProvider.js';
import { hashSessionIdForTelemetry } from '../../../../common/sessionsTelemetry.js';
import { ISessionGroup, ISessionGroupsChangeEvent, ISessionGroupsService } from '../../browser/sessionGroupsService.js';
import { SessionComparisonService } from '../../browser/sessionComparisonService.js';

suite('SessionComparisonService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createServices(storageService = disposables.add(new InMemoryStorageService()), telemetryService = new RecordingTelemetryService()) {
		const sessionsManagementService = disposables.add(new TestSessionsManagementService());
		const chatService = new TestChatService();
		const groupChanges = disposables.add(new Emitter<ISessionGroupsChangeEvent>());
		const groupsService = new class extends mock<ISessionGroupsService>() {
			readonly groupedSessionIds: string[] = [];
			readonly deletedGroupIds: string[] = [];
			override readonly onDidChange = groupChanges.event;
			override createGroup(name: string): ISessionGroup { return { id: 'group', name, createdAt: 1 }; }
			override getGroup(groupId: string): ISessionGroup | undefined {
				return this.deletedGroupIds.includes(groupId) ? undefined : { id: groupId, name: 'Comparison', createdAt: 1 };
			}
			override deleteGroup(groupId: string): void {
				this.deletedGroupIds.push(groupId);
				groupChanges.fire({ groupsChanged: true, membershipChanged: new Set() });
			}
			override addToGroup(sessionIdOrIds: string | Iterable<string>): void {
				this.groupedSessionIds.push(...(typeof sessionIdOrIds === 'string' ? [sessionIdOrIds] : sessionIdOrIds));
			}
		}();
		const service = disposables.add(new SessionComparisonService(
			sessionsManagementService,
			groupsService,
			storageService,
			new NullLogService(),
			chatService,
			telemetryService,
		));
		return { service, sessionsManagementService, groupsService, storageService, chatService, telemetryService };
	}

	test('rejects and removes comparisons with fewer than two launched attempts', async () => {
		const { service, sessionsManagementService, groupsService, storageService } = createServices();
		const deferredAttempt = new DeferredPromise<ISession | undefined>();
		sessionsManagementService.enqueuePromise(deferredAttempt.p);
		sessionsManagementService.enqueueError(new Error('provider unavailable'));

		const comparisonPromise = service.startComparison(startOptions());
		await timeout(0);
		assert.strictEqual(sessionsManagementService.createCalls.length, 2);
		deferredAttempt.complete(stubSession('attempt-one'));

		await assert.rejects(comparisonPromise, /Only 1 of 2 comparison attempts started.*Two: provider unavailable/);
		assert.deepStrictEqual({
			comparisons: service.comparisons.get(),
			deletedGroupIds: groupsService.deletedGroupIds,
			storedComparisons: JSON.parse(storageService.get('sessions.comparisons', StorageScope.PROFILE) ?? '[]'),
		}, {
			comparisons: [],
			deletedGroupIds: ['group'],
			storedComparisons: [],
		});
	});

	test('creates only the requested attempt sessions before judging', async () => {
		const { service, sessionsManagementService, groupsService } = createServices();
		sessionsManagementService.enqueue(stubSession('attempt-one'));
		sessionsManagementService.enqueue(stubSession('attempt-two'));

		const options = startOptions();
		const comparison = await service.startComparison({
			...options,
			attempts: options.attempts.map((attempt, index) => ({
				...attempt,
				harness: {
					...attempt.harness,
					modelLabel: `Model ${index + 1}`,
				},
			})),
		});

		assert.deepStrictEqual({
			requests: sessionsManagementService.createCalls.map(call => ({
				query: call.options.query,
				title: call.options.title,
			})),
			roles: comparison.participants.map(participant => participant.role),
			groupedSessionIds: groupsService.groupedSessionIds,
		}, {
			requests: [
				{ query: 'Implement the feature', title: 'One · Model 1' },
				{ query: 'Implement the feature', title: 'Two · Model 2' },
			],
			roles: [
				SessionComparisonParticipantRole.Attempt,
				SessionComparisonParticipantRole.Attempt,
			],
			groupedSessionIds: ['attempt-one', 'attempt-two'],
		});
	});

	test('starts Judge only after successful attempts are terminal', async () => {
		const { service, sessionsManagementService } = createServices();
		const firstStatus = observableValue('firstStatus', SessionStatus.InProgress);
		const secondStatus = observableValue('secondStatus', SessionStatus.InProgress);
		sessionsManagementService.enqueue(stubSession('attempt-one', firstStatus));
		sessionsManagementService.enqueue(stubSession('attempt-two', secondStatus));
		sessionsManagementService.enqueue(stubSession('judge'));

		const comparison = await service.startComparison({ ...startOptions(), permissionLevel: 'allowedTools' });
		firstStatus.set(SessionStatus.Completed, undefined);
		sessionsManagementService.fireChange();
		await timeout(0);
		assert.strictEqual(sessionsManagementService.createCalls.length, 2);

		secondStatus.set(SessionStatus.Error, undefined);
		sessionsManagementService.fireChange();
		await timeout(0);
		assert.deepStrictEqual({
			createCalls: sessionsManagementService.createCalls.length,
			judgeResource: service.getComparison(comparison.id)?.participants.find(participant => participant.role === SessionComparisonParticipantRole.Judge)?.sessionResource?.toString(),
			judgeHarness: sessionsManagementService.createCalls[2].createOptions,
			judgePrompt: {
				hasComparisonId: sessionsManagementService.createCalls[2].options.query.includes(comparison.id),
				readsComparison: sessionsManagementService.createCalls[2].options.query.includes('#readAttemptComparison'),
				completesComparison: sessionsManagementService.createCalls[2].options.query.includes('#completeAttemptComparison'),
			},
		}, {
			createCalls: 3,
			judgeResource: 'test:/judge',
			judgeHarness: {
				providerId: 'judge-provider',
				sessionTypeId: 'judge-type',
				modelId: 'judge-model',
				modelConfiguration: undefined,
				permissionLevel: 'allowedTools',
				isolationMode: 'worktree',
				branch: undefined,
				metadata: {
					'agentHost/sessionComparison': {
						id: comparison.id,
						role: 'judge',
						attemptCount: 2,
					},
				},
			},
			judgePrompt: {
				hasComparisonId: true,
				readsComparison: true,
				completesComparison: true,
			},
		});
	});

	test('snapshots whole-turn usage before starting the Judge', async () => {
		const { service, sessionsManagementService, chatService, storageService } = createServices();
		const firstStatus = observableValue('firstStatus', SessionStatus.InProgress);
		const secondStatus = observableValue('secondStatus', SessionStatus.InProgress);
		sessionsManagementService.enqueue(stubSession('attempt-one', firstStatus));
		sessionsManagementService.enqueue(stubSession('attempt-two', secondStatus));
		sessionsManagementService.enqueue(stubSession('judge'));
		chatService.setUsage(URI.parse('test-chat:/attempt-one'), [{
			kind: 'usage',
			promptTokens: 10,
			completionTokens: 2,
			modelTotals: [{ model: 'Claude', inputTokens: 30, cachedTokens: 12, outputTokens: 8 }],
		}]);

		const comparison = await service.startComparison(startOptions());
		firstStatus.set(SessionStatus.Completed, undefined);
		secondStatus.set(SessionStatus.Error, undefined);
		sessionsManagementService.fireChange();
		await timeout(0);

		const stored = JSON.parse(storageService.get('sessions.comparisons', StorageScope.PROFILE) ?? '[]');
		const expectedUsage = {
			inputTokens: 30,
			cachedTokens: 12,
			outputTokens: 8,
			models: [{ model: 'Claude', inputTokens: 30, cachedTokens: 12, outputTokens: 8 }],
			isComplete: true,
		};
		assert.deepStrictEqual({
			live: service.getComparison(comparison.id)?.participants.find(participant => participant.id === 'attempt-one')?.usage,
			stored: stored[0].participants.find((participant: { id: string }) => participant.id === 'attempt-one')?.usage,
		}, {
			live: expectedUsage,
			stored: expectedUsage,
		});
	});

	test('reports terminal usage, Judge outcomes, and the winning harness once', async () => {
		const { service, sessionsManagementService, chatService, telemetryService } = createServices();
		const firstStatus = observableValue('firstStatus', SessionStatus.InProgress);
		const secondStatus = observableValue('secondStatus', SessionStatus.InProgress);
		const judgeStatus = observableValue('judgeStatus', SessionStatus.InProgress);
		sessionsManagementService.enqueue(stubSession('attempt-one', firstStatus));
		sessionsManagementService.enqueue(stubSession('attempt-two', secondStatus));
		sessionsManagementService.enqueue(stubSession('judge', judgeStatus));
		chatService.setUsage(URI.parse('test-chat:/attempt-one'), [{
			kind: 'usage',
			promptTokens: 10,
			completionTokens: 2,
			modelTotals: [{ model: 'Claude', inputTokens: 30, cachedTokens: 12, outputTokens: 8 }],
		}]);
		chatService.setUsage(URI.parse('test-chat:/judge'), [{
			kind: 'usage',
			promptTokens: 20,
			completionTokens: 5,
			modelTotals: [{ model: 'judge-model', inputTokens: 40, cachedTokens: 4, outputTokens: 9 }],
		}]);

		const comparison = await service.startComparison(startOptions());
		firstStatus.set(SessionStatus.Completed, undefined);
		secondStatus.set(SessionStatus.Error, undefined);
		sessionsManagementService.fireChange();
		await timeout(0);
		const comparisonVerdict = verdict('attempt-two', ['attempt-one', 'attempt-two']);
		service.submitVerdict(comparison.id, comparisonVerdict);
		assert.throws(() => service.submitVerdict(comparison.id, comparisonVerdict), /already been submitted/);
		judgeStatus.set(SessionStatus.Completed, undefined);
		sessionsManagementService.fireChange();

		const attemptEvents = telemetryService.events.filter(event => event.name !== 'agents/sessionComparisonStageCompleted');
		const judgeTelemetry = telemetryService.events.find(event => event.data.stage === 'judge')?.data;
		assert.deepStrictEqual({
			attemptEvents: attemptEvents.map(event => ({
				name: event.name,
				agentSessionId: event.data.agentSessionId,
				attemptIndex: event.data.attemptIndex,
				status: event.data.status,
				recommended: event.data.recommended,
				inputTokenCount: event.data.inputTokenCount,
			})),
			judge: judgeTelemetry && {
				hasComparisonId: typeof judgeTelemetry.comparisonId === 'string',
				agentSessionId: judgeTelemetry.agentSessionId,
				stage: judgeTelemetry.stage,
				providerId: judgeTelemetry.providerId,
				agentId: judgeTelemetry.agentId,
				modelId: judgeTelemetry.modelId,
				status: judgeTelemetry.status,
				inputTokenCount: judgeTelemetry.inputTokenCount,
				cachedInputTokenCount: judgeTelemetry.cachedInputTokenCount,
				outputTokenCount: judgeTelemetry.outputTokenCount,
				usageCompleteness: judgeTelemetry.usageCompleteness,
				winningProviderId: judgeTelemetry.winningProviderId,
				winningAgentId: judgeTelemetry.winningAgentId,
				winningModelId: judgeTelemetry.winningModelId,
			},
		}, {
			attemptEvents: [
				{ name: 'agents/sessionComparisonAttemptCompleted', agentSessionId: hashSessionIdForTelemetry('attempt-one'), attemptIndex: 0, status: 'completed', recommended: undefined, inputTokenCount: 30 },
				{ name: 'agents/sessionComparisonAttemptCompleted', agentSessionId: hashSessionIdForTelemetry('attempt-two'), attemptIndex: 1, status: 'error', recommended: undefined, inputTokenCount: undefined },
				{ name: 'agents/sessionComparisonAttemptJudged', agentSessionId: hashSessionIdForTelemetry('attempt-one'), attemptIndex: 0, status: undefined, recommended: false, inputTokenCount: undefined },
				{ name: 'agents/sessionComparisonAttemptJudged', agentSessionId: hashSessionIdForTelemetry('attempt-two'), attemptIndex: 1, status: undefined, recommended: true, inputTokenCount: undefined },
			],
			judge: {
				hasComparisonId: true,
				agentSessionId: hashSessionIdForTelemetry('judge'),
				stage: 'judge',
				providerId: 'other',
				agentId: 'judge-type',
				modelId: 'judge-model',
				status: 'completed',
				inputTokenCount: 40,
				cachedInputTokenCount: 4,
				outputTokenCount: 9,
				usageCompleteness: 'complete',
				winningProviderId: 'other',
				winningAgentId: 'type-two',
				winningModelId: 'model-two',
			},
		});
	});

	test('passes provider-local models to their harnesses', async () => {
		const { service, sessionsManagementService } = createServices();
		sessionsManagementService.enqueue(stubSession('attempt-one'));
		sessionsManagementService.enqueue(stubSession('attempt-two'));

		await service.startComparison({ ...startOptions(), permissionLevel: 'allowedTools' });

		assert.deepStrictEqual(sessionsManagementService.createCalls.map(call => ({
			providerId: call.createOptions?.providerId,
			sessionTypeId: call.createOptions?.sessionTypeId,
			modelId: call.createOptions?.modelId,
			permissionLevel: call.createOptions?.permissionLevel,
			comparison: call.createOptions?.metadata?.['agentHost/sessionComparison'],
		})), [
			{
				providerId: 'provider-one',
				sessionTypeId: 'type-one',
				modelId: 'model-one',
				permissionLevel: 'allowedTools',
				comparison: { id: service.comparisons.get()[0].id, role: 'attempt', attemptIndex: 0, attemptCount: 2 },
			},
			{
				providerId: 'provider-two',
				sessionTypeId: 'type-two',
				modelId: 'model-two',
				permissionLevel: 'allowedTools',
				comparison: { id: service.comparisons.get()[0].id, role: 'attempt', attemptIndex: 1, attemptCount: 2 },
			},
		]);
	});

	test('passes independent reasoning efforts to attempts, Judge, and synthesis', async () => {
		const { service, sessionsManagementService } = createServices();
		const firstStatus = observableValue('firstStatus', SessionStatus.InProgress);
		const secondStatus = observableValue('secondStatus', SessionStatus.InProgress);
		sessionsManagementService.enqueue(stubSession('attempt-one', firstStatus));
		sessionsManagementService.enqueue(stubSession('attempt-two', secondStatus));
		sessionsManagementService.enqueue(stubSession('judge'));
		sessionsManagementService.enqueue(stubSession('synthesis'));
		const base = startOptions();
		const comparison = await service.startComparison({
			...base,
			judgeHarness: { ...base.judgeHarness, modelConfiguration: { thinkingLevel: 'max' } },
			synthesisHarness: { ...base.synthesisHarness, modelConfiguration: { thinkingLevel: 'medium' } },
			attempts: [
				{ ...base.attempts[0], harness: { ...base.attempts[0].harness, modelConfiguration: { thinkingLevel: 'high' } } },
				{ ...base.attempts[1], harness: { ...base.attempts[1].harness, modelConfiguration: { thinkingLevel: 'xhigh' } } },
			],
		});
		firstStatus.set(SessionStatus.Completed, undefined);
		secondStatus.set(SessionStatus.Completed, undefined);
		sessionsManagementService.fireChange();
		await timeout(0);
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		service.submitVerdict(comparison.id, verdict(attempts[1].id, attempts.map(attempt => attempt.id)));
		await service.synthesize(comparison.id);

		assert.deepStrictEqual(sessionsManagementService.createCalls.map(call => ({
			title: call.options.title,
			modelConfiguration: call.createOptions?.modelConfiguration,
		})), [
			{ title: 'One · High', modelConfiguration: { thinkingLevel: 'high' } },
			{ title: 'Two · Extra High', modelConfiguration: { thinkingLevel: 'xhigh' } },
			{ title: `Judge: ${comparison.title}`, modelConfiguration: { thinkingLevel: 'max' } },
			{ title: `Synthesis: ${comparison.title}`, modelConfiguration: { thinkingLevel: 'medium' } },
		]);
	});

	test('preserves unique attempt identifiers for repeated harness and model configurations', async () => {
		const { service, sessionsManagementService } = createServices();
		sessionsManagementService.enqueue(stubSession('attempt-one'));
		sessionsManagementService.enqueue(stubSession('attempt-two'));
		const harness = { providerId: 'provider', sessionTypeId: 'type', label: 'Agent', modelId: 'model' };

		const comparison = await service.startComparison({
			workspace: URI.file('/workspace'),
			prompt: 'Implement the feature',
			judgeHarness: harness,
			attempts: [
				{ id: 'first-run', harness },
				{ id: 'second-run', harness },
			],
		});

		assert.deepStrictEqual(comparison.participants
			.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt)
			.map(participant => ({ id: participant.id, harness: participant.harness })), [
			{ id: 'first-run', harness },
			{ id: 'second-run', harness },
		]);
	});

	test('restores persisted URI fields', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessions.comparisons', JSON.stringify([{
			id: 'comparison',
			groupId: 'group',
			title: 'Comparison',
			createdAt: 1,
			workspace: 'file:///workspace',
			prompt: 'Implement',
			participants: [{
				id: 'attempt',
				role: SessionComparisonParticipantRole.Attempt,
				harness: { providerId: 'provider', sessionTypeId: 'type', label: 'Harness' },
				sessionResource: 'test:/attempt',
			}],
		}]), StorageScope.PROFILE, StorageTarget.MACHINE);

		const { service } = createServices(storageService);
		const comparison = service.getComparison('comparison');
		assert.deepStrictEqual({
			workspace: comparison?.workspace.toString(),
			session: comparison?.participants[0].sessionResource?.toString(),
		}, {
			workspace: 'file:///workspace',
			session: 'test:/attempt',
		});
	});

	test('freezes attached context for attempts, Judge, synthesis, and reload', async () => {
		const { service, sessionsManagementService, storageService } = createServices();
		const firstStatus = observableValue('firstStatus', SessionStatus.InProgress);
		const secondStatus = observableValue('secondStatus', SessionStatus.InProgress);
		sessionsManagementService.enqueue(stubSession('attempt-one', firstStatus));
		sessionsManagementService.enqueue(stubSession('attempt-two', secondStatus));
		sessionsManagementService.enqueue(stubSession('judge'));
		sessionsManagementService.enqueue(stubSession('synthesis'));
		const attachment = {
			kind: 'generic' as const,
			id: 'context',
			name: 'Context',
			value: URI.file('/workspace/spec.md'),
		};

		const comparison = await service.startComparison({ ...startOptions(), attachedContext: [attachment] });
		firstStatus.set(SessionStatus.Completed, undefined);
		secondStatus.set(SessionStatus.Completed, undefined);
		sessionsManagementService.fireChange();
		await timeout(0);
		service.submitVerdict(comparison.id, verdict('attempt-two', ['attempt-one', 'attempt-two']));
		await service.synthesize(comparison.id);

		const restored = createServices(storageService).service.getComparison(comparison.id);
		assert.deepStrictEqual({
			requests: sessionsManagementService.createCalls.map(call => call.options.attachedContext?.map(entry => String(entry.value))),
			stored: service.getComparison(comparison.id)?.attachedContext?.map(entry => String(entry.value)),
			restored: restored?.attachedContext?.map(entry => String(entry.value)),
		}, {
			requests: [
				['file:///workspace/spec.md'],
				['file:///workspace/spec.md'],
				['file:///workspace/spec.md'],
				['file:///workspace/spec.md'],
			],
			stored: ['file:///workspace/spec.md'],
			restored: ['file:///workspace/spec.md'],
		});
	});

	test('uses the persisted permission level for Judge and synthesis sessions after reload', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessions.comparisons', JSON.stringify([{
			id: 'comparison',
			groupId: 'comparison-group',
			title: 'Comparison',
			createdAt: 1,
			workspace: 'file:///workspace',
			prompt: 'Implement',
			permissionLevel: 'allowedTools',
			judgeHarness: { providerId: 'judge-provider', sessionTypeId: 'judge-type', label: 'Judge', modelId: 'judge-model' },
			participants: [{
				id: 'attempt-one',
				role: SessionComparisonParticipantRole.Attempt,
				harness: { providerId: 'provider-one', sessionTypeId: 'type-one', label: 'One', modelId: 'model-one' },
				sessionResource: 'test:/attempt-one',
			}, {
				id: 'attempt-two',
				role: SessionComparisonParticipantRole.Attempt,
				harness: { providerId: 'provider-two', sessionTypeId: 'type-two', label: 'Two', modelId: 'model-two' },
				sessionResource: 'test:/attempt-two',
			}],
		}]), StorageScope.PROFILE, StorageTarget.MACHINE);
		const { service, sessionsManagementService } = createServices(storageService);
		sessionsManagementService.addSession(stubSession('attempt-one', observableValue('firstStatus', SessionStatus.Completed)));
		sessionsManagementService.addSession(stubSession('attempt-two', observableValue('secondStatus', SessionStatus.Completed)));
		sessionsManagementService.enqueue(stubSession('judge'));

		sessionsManagementService.fireChange();
		await timeout(0);
		service.submitVerdict('comparison', verdict('attempt-two', ['attempt-one', 'attempt-two']));
		sessionsManagementService.enqueue(stubSession('synthesis'));
		await service.synthesize('comparison');

		assert.deepStrictEqual(sessionsManagementService.createCalls.map(call => ({
			providerId: call.createOptions?.providerId,
			permissionLevel: call.createOptions?.permissionLevel,
		})), [
			{ providerId: 'judge-provider', permissionLevel: 'allowedTools' },
			{ providerId: 'provider-two', permissionLevel: 'allowedTools' },
		]);
	});

	test('uses each persisted permission choice for attempts, Judge, and synthesis', async () => {
		const { service, sessionsManagementService } = createServices();
		const firstStatus = observableValue('firstStatus', SessionStatus.InProgress);
		const secondStatus = observableValue('secondStatus', SessionStatus.InProgress);
		sessionsManagementService.enqueue(stubSession('attempt-one', firstStatus));
		sessionsManagementService.enqueue(stubSession('attempt-two', secondStatus));
		sessionsManagementService.enqueue(stubSession('judge'));

		const options = startOptions();
		const comparison = await service.startComparison({
			...options,
			attempts: [
				{ ...options.attempts[0], harness: { ...options.attempts[0].harness, permissionId: 'autoApprove', permissionLabel: 'Allow all' } },
				{ ...options.attempts[1], harness: { ...options.attempts[1].harness, permissionId: 'default', permissionLabel: 'Default Permissions' } },
			],
			judgeHarness: { ...options.judgeHarness, permissionId: 'bypassPermissions', permissionLabel: 'Bypass Permissions' },
			synthesisHarness: { ...options.synthesisHarness, permissionId: 'autoApprove', permissionLabel: 'Allow all' },
		});
		firstStatus.set(SessionStatus.Completed, undefined);
		secondStatus.set(SessionStatus.Completed, undefined);
		sessionsManagementService.fireChange();
		await timeout(0);
		service.submitVerdict(comparison.id, verdict('attempt-two', ['attempt-one', 'attempt-two']));
		sessionsManagementService.enqueue(stubSession('synthesis'));
		await service.synthesize(comparison.id);

		assert.deepStrictEqual(sessionsManagementService.createCalls.map(call => ({
			permissionId: call.createOptions?.permissionId,
			permissionLevel: call.createOptions?.permissionLevel,
		})), [
			{ permissionId: 'autoApprove', permissionLevel: undefined },
			{ permissionId: 'default', permissionLevel: undefined },
			{ permissionId: 'bypassPermissions', permissionLevel: undefined },
			{ permissionId: 'autoApprove', permissionLevel: undefined },
		]);
	});

	test('restores every comparison participant to its comparison group', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessions.comparisons', JSON.stringify([{
			id: 'comparison',
			groupId: 'comparison-group',
			title: 'Comparison',
			createdAt: 1,
			workspace: 'file:///workspace',
			prompt: 'Implement',
			participants: [{
				id: 'attempt',
				role: SessionComparisonParticipantRole.Attempt,
				harness: { providerId: 'provider', sessionTypeId: 'type', label: 'Harness' },
				sessionResource: 'test:/attempt',
			}, {
				id: 'judge',
				role: SessionComparisonParticipantRole.Judge,
				harness: { providerId: 'provider', sessionTypeId: 'type', label: 'Harness' },
				sessionResource: 'test:/judge',
			}],
		}]), StorageScope.PROFILE, StorageTarget.MACHINE);
		const { sessionsManagementService, groupsService } = createServices(storageService);
		sessionsManagementService.addSession(stubSession('attempt'));
		sessionsManagementService.addSession(stubSession('judge'));

		sessionsManagementService.fireChange();

		assert.deepStrictEqual(groupsService.groupedSessionIds, ['attempt', 'judge']);
	});

	test('removes a persisted comparison when its group is deleted', async () => {
		const { service, sessionsManagementService, groupsService, storageService } = createServices();
		sessionsManagementService.enqueue(stubSession('attempt-one'));
		sessionsManagementService.enqueue(stubSession('attempt-two'));
		const comparison = await service.startComparison(startOptions());

		groupsService.deleteGroup(comparison.groupId);

		assert.deepStrictEqual({
			comparisons: service.comparisons.get(),
			stored: JSON.parse(storageService.get('sessions.comparisons', StorageScope.PROFILE) ?? '[]'),
		}, {
			comparisons: [],
			stored: [],
		});
	});

	test('removes attempt numbers and permission labels from untouched generated session titles', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		storageService.store('sessions.comparisons', JSON.stringify([{
			id: 'comparison',
			groupId: 'comparison-group',
			title: 'Comparison',
			createdAt: 1,
			workspace: 'file:///workspace',
			prompt: 'Implement',
			participants: [{
				id: 'attempt-one',
				role: SessionComparisonParticipantRole.Attempt,
				harness: { providerId: 'provider', sessionTypeId: 'type', label: 'Copilot', modelLabel: 'Claude Opus 5' },
				sessionResource: 'test:/attempt-one',
			}, {
				id: 'attempt-two',
				role: SessionComparisonParticipantRole.Attempt,
				harness: { providerId: 'provider', sessionTypeId: 'type', label: 'Copilot', modelLabel: 'Auto', permissionId: 'autoApprove', permissionLabel: 'Allow all' },
				sessionResource: 'test:/attempt-two',
			}],
		}]), StorageScope.PROFILE, StorageTarget.MACHINE);
		const { sessionsManagementService } = createServices(storageService);
		sessionsManagementService.addSession({
			...stubSession('attempt-one'),
			title: constObservable('Attempt 1: Copilot · Claude Opus 5'),
		});
		sessionsManagementService.addSession({
			...stubSession('attempt-two'),
			title: constObservable('Copilot · Auto · Allow all'),
		});
		sessionsManagementService.fireChange();
		await timeout(0);

		assert.deepStrictEqual(sessionsManagementService.renameCalls, [
			{
				sessionId: 'attempt-one',
				title: 'Copilot · Claude Opus 5',
			},
			{
				sessionId: 'attempt-two',
				title: 'Copilot · Auto',
			},
		]);
	});

	test('synthesizes only after an explicit request with the configured harness', async () => {
		const { service, sessionsManagementService, chatService, telemetryService } = createServices();
		const synthesisStatus = observableValue('synthesisStatus', SessionStatus.InProgress);
		sessionsManagementService.enqueue(stubSession('attempt-one'));
		sessionsManagementService.enqueue(stubSession('attempt-two'));
		sessionsManagementService.enqueue(stubSession('synthesis', synthesisStatus));
		chatService.setUsage(URI.parse('test-chat:/synthesis'), [{
			kind: 'usage',
			promptTokens: 30,
			completionTokens: 10,
			modelTotals: [{ model: 'synthesis-model', inputTokens: 55, cachedTokens: 5, outputTokens: 13 }],
		}]);

		const comparison = await service.startComparison(startOptions());
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		service.submitVerdict(comparison.id, {
			...verdict(attempts[1].id, attempts.map(attempt => attempt.id)),
			rationale: {
				solution: 'Implements the requested behavior.',
				validation: 'Focused tests pass.',
				codeQuality: 'Uses the existing implementation pattern.',
				comparison: 'The other attempt leaves the failure unresolved.',
			},
			decisionSections: [{
				id: 'error-handling',
				title: 'Error handling',
				description: 'Choose the error representation.',
				affectedFiles: ['src/parser.ts'],
				options: attempts.map(attempt => ({ participantId: attempt.id, approach: `Use ${attempt.harness.label}` })),
				recommendedParticipantId: attempts[1].id,
			}],
		});
		service.setSynthesisPlan(comparison.id, {
			selections: [{ sectionId: 'error-handling', participantId: attempts[0].id }],
		});
		assert.strictEqual(sessionsManagementService.createCalls.length, 2);
		await service.synthesize(comparison.id);
		synthesisStatus.set(SessionStatus.Completed, undefined);
		sessionsManagementService.fireChange();

		const current = service.getComparison(comparison.id);
		const synthesisTelemetry = telemetryService.events.find(event => event.data.stage === 'synthesis')?.data;
		assert.deepStrictEqual({
			synthesisResource: current?.participants.find(participant => participant.role === SessionComparisonParticipantRole.Synthesis)?.sessionResource?.toString(),
			providerId: sessionsManagementService.createCalls[2].createOptions?.providerId,
			sessionTypeId: sessionsManagementService.createCalls[2].createOptions?.sessionTypeId,
			modelId: sessionsManagementService.createCalls[2].createOptions?.modelId,
			prompt: sessionsManagementService.createCalls[2].options.query,
			plan: current?.synthesisPlan,
			telemetry: synthesisTelemetry && {
				hasComparisonId: typeof synthesisTelemetry.comparisonId === 'string',
				agentSessionId: synthesisTelemetry.agentSessionId,
				stage: synthesisTelemetry.stage,
				providerId: synthesisTelemetry.providerId,
				agentId: synthesisTelemetry.agentId,
				modelId: synthesisTelemetry.modelId,
				status: synthesisTelemetry.status,
				inputTokenCount: synthesisTelemetry.inputTokenCount,
				cachedInputTokenCount: synthesisTelemetry.cachedInputTokenCount,
				outputTokenCount: synthesisTelemetry.outputTokenCount,
				usageCompleteness: synthesisTelemetry.usageCompleteness,
			},
		}, {
			synthesisResource: 'test:/synthesis',
			providerId: 'synthesis-provider',
			sessionTypeId: 'synthesis-type',
			modelId: 'synthesis-model',
			prompt: `Synthesize the strongest parts of comparison ${comparison.id} into a new implementation. First call #readAttemptComparison exactly once with that comparison ID. Read implementation code only from the authoritative worktrees in its manifest. If changedFilesStatus is unavailable, read the Git diff from that worktree. If the manifest includes a synthesisPlan, treat every selected section as an explicit user requirement and resolve cross-section dependencies coherently instead of copying hunks mechanically. Call get_session_context only with an exact sessionContextTarget returned by the manifest and only for rationale or validation evidence; never recover implementation code or paths from a transcript. Do not inspect another checkout, discover sessions, or guess references. Preserve correct behavior, resolve the Judge's reported conflicts, and run the relevant validation.\n\nJudge recommendation:\nSolution: Implements the requested behavior.\nValidation: Focused tests pass.\nCode quality: Uses the existing implementation pattern.\nComparison: The other attempt leaves the failure unresolved.`,
			plan: {
				selections: [{ sectionId: 'error-handling', participantId: attempts[0].id }],
			},
			telemetry: {
				hasComparisonId: true,
				agentSessionId: hashSessionIdForTelemetry('synthesis'),
				stage: 'synthesis',
				providerId: 'other',
				agentId: 'synthesis-type',
				modelId: 'synthesis-model',
				status: 'completed',
				inputTokenCount: 55,
				cachedInputTokenCount: 5,
				outputTokenCount: 13,
				usageCompleteness: 'complete',
			},
		});
	});

	test('persists synthesis selections and rejects unknown sections or approaches', async () => {
		const { service, sessionsManagementService, storageService } = createServices();
		sessionsManagementService.enqueue(stubSession('attempt-one'));
		sessionsManagementService.enqueue(stubSession('attempt-two'));
		const comparison = await service.startComparison(startOptions());
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		let invalidAssessments: string | undefined;
		try {
			service.submitVerdict(comparison.id, {
				...verdict(attempts[1].id, attempts.map(attempt => attempt.id)),
				decisionSections: [{
					id: 'tests',
					title: 'Test strategy',
					description: 'Choose the preferred coverage structure.',
					affectedFiles: ['test/parser.test.ts'],
					options: attempts.map(attempt => ({
						participantId: attempt.id,
						approach: attempt.harness.label,
						assessment: SessionComparisonDecisionAssessment.Neutral,
					})),
					recommendedParticipantId: attempts[1].id,
				}],
			});
		} catch (error) {
			invalidAssessments = error instanceof Error ? error.message : String(error);
		}
		service.submitVerdict(comparison.id, {
			...verdict(attempts[1].id, attempts.map(attempt => attempt.id)),
			decisionSections: [{
				id: 'tests',
				title: 'Test strategy',
				description: 'Choose the preferred coverage structure.',
				affectedFiles: ['test/parser.test.ts'],
				options: attempts.map(attempt => ({ participantId: attempt.id, approach: attempt.harness.label })),
				recommendedParticipantId: attempts[1].id,
			}],
		});
		service.setSynthesisPlan(comparison.id, {
			selections: [{ sectionId: 'tests', participantId: attempts[0].id }],
		});
		assert.throws(() => service.submitVerdict(comparison.id, verdict(attempts[1].id, attempts.map(attempt => attempt.id))), /already been submitted/);
		const stored = JSON.parse(storageService.get('sessions.comparisons', StorageScope.PROFILE) ?? '[]');
		const restored = createServices(storageService).service.getComparison(comparison.id)?.synthesisPlan;
		let unknownSection: string | undefined;
		let unknownAttempt: string | undefined;
		try {
			service.setSynthesisPlan(comparison.id, { selections: [{ sectionId: 'missing' }] });
		} catch (error) {
			unknownSection = error instanceof Error ? error.message : String(error);
		}
		try {
			service.setSynthesisPlan(comparison.id, { selections: [{ sectionId: 'tests', participantId: 'missing' }] });
		} catch (error) {
			unknownAttempt = error instanceof Error ? error.message : String(error);
		}

		assert.deepStrictEqual({
			live: service.getComparison(comparison.id)?.synthesisPlan,
			stored: stored[0].synthesisPlan,
			restored,
			invalidAssessments,
			unknownSection,
			unknownAttempt,
		}, {
			live: { selections: [{ sectionId: 'tests', participantId: attempts[0].id }] },
			stored: { selections: [{ sectionId: 'tests', participantId: attempts[0].id }] },
			restored: { selections: [{ sectionId: 'tests', participantId: attempts[0].id }] },
			invalidAssessments: 'The comparison verdict contains an invalid synthesis decision section.',
			unknownSection: 'The synthesis plan contains an invalid section selection.',
			unknownAttempt: 'The synthesis plan contains an invalid section selection.',
		});
	});

});

class TestSessionsManagementService extends mock<ISessionsManagementService>() implements IDisposable {
	private readonly _onDidChangeSessions = new Emitter<ISessionChangeEvent>();
	override readonly onDidChangeSessions = this._onDidChangeSessions.event;
	private readonly _results: Array<() => Promise<ISession | undefined>> = [];
	private readonly _sessions = new Map<string, ISession>();
	readonly createCalls: Array<{ folderUri: URI; options: ISendRequestOptions; createOptions?: ICreateNewSessionOptions; token?: CancellationToken }> = [];
	readonly renameCalls: Array<{ sessionId: string; title: string }> = [];

	enqueue(session: ISession): void {
		this.enqueuePromise(Promise.resolve(session));
	}

	enqueuePromise(result: Promise<ISession | undefined>): void {
		this._results.push(async () => result);
	}

	enqueueError(error: Error): void {
		this._results.push(async () => { throw error; });
	}

	override async createAndSendNewChatRequest(folderUri: URI, options: NewSessionRequestOptions, createOptions?: ICreateNewSessionOptions, token?: CancellationToken): Promise<ISession | undefined> {
		if (hasKey(options, { kind: true })) {
			throw new Error('Session comparisons must send an immediate request.');
		}
		this.createCalls.push({ folderUri, options, createOptions, token });
		const result = await this._results.shift()?.();
		if (result) {
			this._sessions.set(result.resource.toString(), result);
		}
		return result;
	}

	override getSession(resource: URI): ISession | undefined {
		return this._sessions.get(resource.toString());
	}

	addSession(session: ISession): void {
		this._sessions.set(session.resource.toString(), session);
	}

	override async renameSession(session: ISession, title: string): Promise<void> {
		this.renameCalls.push({ sessionId: session.sessionId, title });
	}

	fireChange(): void {
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [] });
	}

	dispose(): void {
		this._onDidChangeSessions.dispose();
	}
}

class TestChatService extends mock<IChatService>() {
	private readonly _usages = new Map<string, readonly IChatUsage[]>();

	setUsage(resource: URI, usages: readonly IChatUsage[]): void {
		this._usages.set(resource.toString(), usages);
	}

	override getSession(resource: URI): IChatModel | undefined {
		const usages = this._usages.get(resource.toString());
		return usages ? upcastPartial<IChatModel>({
			getRequests: () => usages.map(usage => upcastPartial<IChatRequestModel>({
				response: upcastPartial<IChatResponseModel>({ usage }),
			})),
		}) : undefined;
	}
}

class RecordingTelemetryService extends NullTelemetryServiceShape {
	readonly events: Array<{ name: string; data: Record<string, unknown> }> = [];

	override publicLog2(eventName?: string, data?: Record<string, unknown>): void {
		if (eventName) {
			this.events.push({ name: eventName, data: data ?? {} });
		}
	}
}

function stubSession(sessionId: string, status = observableValue(`${sessionId}Status`, SessionStatus.InProgress)): ISession {
	const chat = {
		resource: URI.parse(`test-chat:/${sessionId}`),
		createdAt: new Date(),
		title: constObservable(sessionId),
		updatedAt: constObservable(new Date()),
		status,
		changes: constObservable([]),
		checkpoints: constObservable(undefined),
		modelId: constObservable(undefined),
		modelSource: constObservable(undefined),
		mode: constObservable(undefined),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		interactivity: constObservable(ChatInteractivity.Full),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
	};
	return {
		sessionId,
		resource: URI.parse(`test:/${sessionId}`),
		providerId: 'provider',
		sessionType: 'type',
		icon: Codicon.vm,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable(sessionId),
		updatedAt: constObservable(new Date()),
		status,
		changesets: constObservable([]),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable([chat]),
		mainChat: constObservable(chat),
		capabilities: constObservable({ supportsMultipleChats: false }),
	};
}

function startOptions() {
	return {
		workspace: URI.file('/workspace'),
		prompt: 'Implement the feature',
		judgeHarness: { providerId: 'judge-provider', sessionTypeId: 'judge-type', label: 'Judge', modelId: 'judge-model' },
		synthesisHarness: { providerId: 'synthesis-provider', sessionTypeId: 'synthesis-type', label: 'Synthesizer', modelId: 'synthesis-model' },
		attempts: [
			{
				id: 'attempt-one',
				harness: { providerId: 'provider-one', sessionTypeId: 'type-one', label: 'One', modelId: 'model-one' },
			},
			{
				id: 'attempt-two',
				harness: { providerId: 'provider-two', sessionTypeId: 'type-two', label: 'Two', modelId: 'model-two' },
			},
		],
	};
}

function verdict(recommendedParticipantId: string, participantIds: readonly string[]): ISessionComparisonVerdict {
	return {
		recommendedParticipantId,
		explanation: 'Attempt two is stronger.',
		conflicts: [],
		attempts: participantIds.map(participantId => ({
			participantId,
			summary: 'Summary',
			validation: {
				tests: SessionComparisonValidationState.Passed,
				build: SessionComparisonValidationState.Passed,
				lint: SessionComparisonValidationState.Passed,
				diagnostics: SessionComparisonValidationState.Passed,
			},
			unresolvedIssues: [],
			notableDifferences: [],
		})),
	};
}
