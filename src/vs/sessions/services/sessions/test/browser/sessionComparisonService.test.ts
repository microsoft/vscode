/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { hasKey } from '../../../../../base/common/types.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IChatService, IChatUsage } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatModel, IChatRequestModel, IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatInteractivity, ISession, SessionStatus } from '../../common/session.js';
import { getSessionComparisonFileKey, ISessionComparisonVerdict, SessionComparisonParticipantRole, SessionComparisonValidationState } from '../../common/sessionComparison.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsManagementService, NewSessionRequestOptions } from '../../common/sessionsManagement.js';
import { ISessionChangeEvent } from '../../common/sessionsProvider.js';
import { ISessionGroup, ISessionGroupsService } from '../../browser/sessionGroupsService.js';
import { SessionComparisonService } from '../../browser/sessionComparisonService.js';

suite('SessionComparisonService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createServices(storageService = disposables.add(new InMemoryStorageService()), telemetryService = new RecordingTelemetryService()) {
		const sessionsManagementService = disposables.add(new TestSessionsManagementService());
		const chatService = new TestChatService();
		const fileService = new TestJudgePromptFileService();
		const groupsService = new class extends mock<ISessionGroupsService>() {
			readonly groupedSessionIds: string[] = [];
			override readonly onDidChange = Event.None;
			override createGroup(name: string): ISessionGroup { return { id: 'group', name, createdAt: 1 }; }
			override deleteGroup(): void { }
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
			fileService,
		));
		return { service, sessionsManagementService, groupsService, storageService, chatService, telemetryService, fileService };
	}

	test('persists partial concurrent launch failures', async () => {
		const { service, sessionsManagementService } = createServices();
		const deferredAttempt = new DeferredPromise<ISession | undefined>();
		sessionsManagementService.enqueuePromise(deferredAttempt.p);
		sessionsManagementService.enqueueError(new Error('provider unavailable'));

		const comparisonPromise = service.startComparison(startOptions());
		await timeout(0);
		assert.strictEqual(sessionsManagementService.createCalls.length, 2);
		deferredAttempt.complete(stubSession('attempt-one'));

		const comparison = await comparisonPromise;
		assert.deepStrictEqual(comparison.participants.map(participant => ({
			role: participant.role,
			resource: participant.sessionResource?.toString(),
			error: participant.launchError,
		})), [
			{ role: SessionComparisonParticipantRole.Attempt, resource: 'test:/attempt-one', error: undefined },
			{ role: SessionComparisonParticipantRole.Attempt, resource: undefined, error: 'provider unavailable' },
		]);
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
				{ query: 'Implement the feature', title: 'Attempt 1: One · Model 1' },
				{ query: 'Implement the feature', title: 'Attempt 2: Two · Model 2' },
			],
			roles: [
				SessionComparisonParticipantRole.Attempt,
				SessionComparisonParticipantRole.Attempt,
			],
			groupedSessionIds: ['attempt-one', 'attempt-two'],
		});
	});

	test('starts Judge only after successful attempts are terminal', async () => {
		const { service, sessionsManagementService, fileService } = createServices();
		const firstStatus = observableValue('firstStatus', SessionStatus.InProgress);
		const secondStatus = observableValue('secondStatus', SessionStatus.InProgress);
		sessionsManagementService.enqueue(stubSession('attempt-one', firstStatus));
		sessionsManagementService.enqueue(stubSession('attempt-two', secondStatus));
		sessionsManagementService.enqueue(stubSession('judge'));

		const comparison = await service.startComparison(startOptions());
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
			judgePrompt: sessionsManagementService.createCalls[2].options.query,
			readJudgePromptResource: fileService.lastReadResource?.path.endsWith('/vs/sessions/prompts/judge.md'),
		}, {
			createCalls: 3,
			judgeResource: 'test:/judge',
			judgeHarness: {
				providerId: 'judge-provider',
				sessionTypeId: 'judge-type',
				modelId: 'judge-model',
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
			judgePrompt: getTestJudgePrompt(comparison.id),
			readJudgePromptResource: true,
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

		test('reports terminal usage and Judge outcomes once per attempt', async () => {
			const { service, sessionsManagementService, chatService, telemetryService } = createServices();
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
			const comparisonVerdict = verdict('attempt-two', ['attempt-one', 'attempt-two']);
			service.submitVerdict(comparison.id, comparisonVerdict);
			service.submitVerdict(comparison.id, comparisonVerdict);

			assert.deepStrictEqual(telemetryService.events.map(event => ({
				name: event.name,
				attemptIndex: event.data.attemptIndex,
				status: event.data.status,
				recommended: event.data.recommended,
				inputTokenCount: event.data.inputTokenCount,
			})), [
				{ name: 'agents/sessionComparisonAttemptCompleted', attemptIndex: 0, status: 'completed', recommended: undefined, inputTokenCount: 30 },
				{ name: 'agents/sessionComparisonAttemptCompleted', attemptIndex: 1, status: 'error', recommended: undefined, inputTokenCount: undefined },
				{ name: 'agents/sessionComparisonAttemptJudged', attemptIndex: 0, status: undefined, recommended: false, inputTokenCount: undefined },
				{ name: 'agents/sessionComparisonAttemptJudged', attemptIndex: 1, status: undefined, recommended: true, inputTokenCount: undefined },
			]);
		});
	});

	test('passes provider-local models to their harnesses', async () => {
		const { service, sessionsManagementService } = createServices();
		sessionsManagementService.enqueue(stubSession('attempt-one'));
		sessionsManagementService.enqueue(stubSession('attempt-two'));

		await service.startComparison(startOptions());

		assert.deepStrictEqual(sessionsManagementService.createCalls.map(call => ({
			providerId: call.createOptions?.providerId,
			sessionTypeId: call.createOptions?.sessionTypeId,
			modelId: call.createOptions?.modelId,
			comparison: call.createOptions?.metadata?.['agentHost/sessionComparison'],
		})), [
			{
				providerId: 'provider-one',
				sessionTypeId: 'type-one',
				modelId: 'model-one',
				comparison: { id: service.comparisons.get()[0].id, role: 'attempt', attemptIndex: 0, attemptCount: 2 },
			},
			{
				providerId: 'provider-two',
				sessionTypeId: 'type-two',
				modelId: 'model-two',
				comparison: { id: service.comparisons.get()[0].id, role: 'attempt', attemptIndex: 1, attemptCount: 2 },
			},
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

	test('synthesizes only after an explicit request with the recommended harness', async () => {
		const { service, sessionsManagementService } = createServices();
		sessionsManagementService.enqueue(stubSession('attempt-one'));
		sessionsManagementService.enqueue(stubSession('attempt-two'));
		sessionsManagementService.enqueue(stubSession('synthesis'));

		const comparison = await service.startComparison(startOptions());
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		service.submitVerdict(comparison.id, {
			...verdict(attempts[1].id, attempts.map(attempt => attempt.id)),
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

		const current = service.getComparison(comparison.id);
		assert.deepStrictEqual({
			synthesisResource: current?.participants.find(participant => participant.role === SessionComparisonParticipantRole.Synthesis)?.sessionResource?.toString(),
			providerId: sessionsManagementService.createCalls[2].createOptions?.providerId,
			sessionTypeId: sessionsManagementService.createCalls[2].createOptions?.sessionTypeId,
			modelId: sessionsManagementService.createCalls[2].createOptions?.modelId,
			prompt: sessionsManagementService.createCalls[2].options.query,
			plan: current?.synthesisPlan,
		}, {
			synthesisResource: 'test:/synthesis',
			providerId: 'provider-two',
			sessionTypeId: 'type-two',
			modelId: 'model-two',
			prompt: `Synthesize the strongest parts of comparison ${comparison.id} into a new implementation. First call #readAttemptComparison exactly once with that comparison ID. Read implementation code only from the authoritative worktrees in its manifest. If changedFilesStatus is unavailable, read the Git diff from that worktree. If the manifest includes a synthesisPlan, treat every selected section as an explicit user requirement and resolve cross-section dependencies coherently instead of copying hunks mechanically. Call get_session_context only with an exact sessionContextTarget returned by the manifest and only for rationale or validation evidence; never recover implementation code or paths from a transcript. Do not inspect another checkout, discover sessions, or guess references. Preserve correct behavior, resolve the Judge's reported conflicts, and run the relevant validation.\n\nJudge recommendation:\nAttempt two is stronger.`,
			plan: {
				selections: [{ sectionId: 'error-handling', participantId: attempts[0].id }],
			},
		});
	});

	test('persists synthesis selections and rejects unknown sections or approaches', async () => {
		const { service, sessionsManagementService, storageService } = createServices();
		sessionsManagementService.enqueue(stubSession('attempt-one'));
		sessionsManagementService.enqueue(stubSession('attempt-two'));
		const comparison = await service.startComparison(startOptions());
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
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
			unknownSection,
			unknownAttempt,
		}, {
			live: { selections: [{ sectionId: 'tests', participantId: attempts[0].id }] },
			stored: { selections: [{ sectionId: 'tests', participantId: attempts[0].id }] },
			restored: { selections: [{ sectionId: 'tests', participantId: attempts[0].id }] },
			unknownSection: 'The synthesis plan contains an invalid section selection.',
			unknownAttempt: 'The synthesis plan contains an invalid section selection.',
		});
	});

	test('retains attempts whose cleanup fails', async () => {
		const { service, sessionsManagementService } = createServices();
		sessionsManagementService.enqueue(stubSession('attempt-one'));
		sessionsManagementService.enqueue(stubSession('attempt-two'));
		const comparison = await service.startComparison(startOptions());
		sessionsManagementService.deleteFailureSessionId = 'attempt-two';

		const failures = await service.discardOriginalAttempts(comparison.id);
		assert.deepStrictEqual({
			failures,
			remainingAttempts: service.getComparison(comparison.id)?.participants
				.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt)
				.map(participant => participant.sessionResource?.toString()),
		}, {
			failures: ['cleanup failed'],
			remainingAttempts: ['test:/attempt-two'],
		});
	});

	test('normalizes changed files across isolated worktrees', () => {
		const firstFolder = {
			root: URI.file('/repository'),
			workingDirectory: URI.file('/worktrees/first'),
			name: 'repository',
			description: undefined,
		};
		const secondFolder = {
			root: URI.file('/repository'),
			workingDirectory: URI.file('/worktrees/second'),
			name: 'repository',
			description: undefined,
		};
		assert.deepStrictEqual({
			first: getSessionComparisonFileKey(URI.file('/worktrees/first/src/file.ts'), [firstFolder]),
			second: getSessionComparisonFileKey(URI.file('/worktrees/second/src/file.ts'), [secondFolder]),
			external: getSessionComparisonFileKey(URI.file('/tmp/file.ts'), [firstFolder]),
		}, {
			first: 'src/file.ts',
			second: 'src/file.ts',
			external: 'file:///tmp/file.ts',
		});
	});
});

const TEST_JUDGE_PROMPT_TEMPLATE = 'Follow the Judge instructions for comparison {{comparisonId}}.';

function getTestJudgePrompt(comparisonId: string): string {
	return TEST_JUDGE_PROMPT_TEMPLATE.replace('{{comparisonId}}', comparisonId);
}

class TestJudgePromptFileService extends mock<IFileService>() {
	lastReadResource: URI | undefined;

	override async readFile(resource: URI): Promise<IFileContent> {
		this.lastReadResource = resource;
		return {
			resource,
			name: 'judge.md',
			mtime: 0,
			ctime: 0,
			etag: '',
			size: TEST_JUDGE_PROMPT_TEMPLATE.length,
			readonly: true,
			locked: false,
			executable: false,
			value: VSBuffer.fromString(TEST_JUDGE_PROMPT_TEMPLATE),
		};
	}
}

class TestSessionsManagementService extends mock<ISessionsManagementService>() implements IDisposable {
	private readonly _onDidChangeSessions = new Emitter<ISessionChangeEvent>();
	override readonly onDidChangeSessions = this._onDidChangeSessions.event;
	private readonly _results: Array<() => Promise<ISession | undefined>> = [];
	private readonly _sessions = new Map<string, ISession>();
	readonly createCalls: Array<{ folderUri: URI; options: ISendRequestOptions; createOptions?: ICreateNewSessionOptions; token?: CancellationToken }> = [];
	deleteFailureSessionId: string | undefined;

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

	override async deleteSession(session: ISession): Promise<void> {
		if (session.sessionId === this.deleteFailureSessionId) {
			throw new Error('cleanup failed');
		}
		this._sessions.delete(session.resource.toString());
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
