/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatInteractivity, ISession, SessionStatus } from '../../common/session.js';
import { getSessionComparisonFileKey, ISessionComparisonVerdict, SessionComparisonParticipantRole, SessionComparisonValidationState } from '../../common/sessionComparison.js';
import { ICreateNewSessionOptions, ISessionsManagementService, NewSessionRequestOptions } from '../../common/sessionsManagement.js';
import { ISessionChangeEvent } from '../../common/sessionsProvider.js';
import { ISessionGroup, ISessionGroupsService } from '../../browser/sessionGroupsService.js';
import { SESSION_COMPARISON_AUTO_SYNTHESIZE_SETTING, SessionComparisonService } from '../../browser/sessionComparisonService.js';

suite('SessionComparisonService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createServices(configurationService = new TestConfigurationService(), storageService = disposables.add(new InMemoryStorageService())) {
		const sessionsManagementService = disposables.add(new TestSessionsManagementService());
		const groupsService = new class extends mock<ISessionGroupsService>() {
			override readonly onDidChange = Event.None;
			override createGroup(name: string): ISessionGroup { return { id: 'group', name, createdAt: 1 }; }
			override deleteGroup(): void { }
			override addToGroup(): void { }
		}();
		const service = disposables.add(new SessionComparisonService(
			sessionsManagementService,
			groupsService,
			storageService,
			new NullLogService(),
			configurationService,
		));
		return { service, sessionsManagementService, storageService };
	}

	test('persists partial concurrent launch failures', async () => {
		const { service, sessionsManagementService } = createServices();
		const deferredAttempt = new DeferredPromise<ISession | undefined>();
		sessionsManagementService.enqueue(stubSession('coordinator'));
		sessionsManagementService.enqueuePromise(deferredAttempt.p);
		sessionsManagementService.enqueueError(new Error('provider unavailable'));

		const comparisonPromise = service.startComparison(startOptions());
		await timeout(0);
		assert.strictEqual(sessionsManagementService.createCalls.length, 3);
		deferredAttempt.complete(stubSession('attempt-one'));

		const comparison = await comparisonPromise;
		assert.deepStrictEqual(comparison.participants.map(participant => ({
			role: participant.role,
			resource: participant.sessionResource?.toString(),
			error: participant.launchError,
		})), [
			{ role: SessionComparisonParticipantRole.Coordinator, resource: 'test:/coordinator', error: undefined },
			{ role: SessionComparisonParticipantRole.Attempt, resource: 'test:/attempt-one', error: undefined },
			{ role: SessionComparisonParticipantRole.Attempt, resource: undefined, error: 'provider unavailable' },
		]);
	});

	test('starts Judge only after successful attempts are terminal', async () => {
		const { service, sessionsManagementService } = createServices();
		const firstStatus = observableValue('firstStatus', SessionStatus.InProgress);
		const secondStatus = observableValue('secondStatus', SessionStatus.InProgress);
		sessionsManagementService.enqueue(stubSession('coordinator'));
		sessionsManagementService.enqueue(stubSession('attempt-one', firstStatus));
		sessionsManagementService.enqueue(stubSession('attempt-two', secondStatus));
		sessionsManagementService.enqueue(stubSession('judge'));

		const comparison = await service.startComparison(startOptions());
		firstStatus.set(SessionStatus.Completed, undefined);
		sessionsManagementService.fireChange();
		await timeout(0);
		assert.strictEqual(sessionsManagementService.createCalls.length, 3);

		secondStatus.set(SessionStatus.Error, undefined);
		sessionsManagementService.fireChange();
		await timeout(0);
		assert.deepStrictEqual({
			createCalls: sessionsManagementService.createCalls.length,
			judgeResource: service.getComparison(comparison.id)?.participants.find(participant => participant.role === SessionComparisonParticipantRole.Judge)?.sessionResource?.toString(),
		}, {
			createCalls: 4,
			judgeResource: 'test:/judge',
		});
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

		const { service } = createServices(new TestConfigurationService(), storageService);
		const comparison = service.getComparison('comparison');
		assert.deepStrictEqual({
			workspace: comparison?.workspace.toString(),
			session: comparison?.participants[0].sessionResource?.toString(),
		}, {
			workspace: 'file:///workspace',
			session: 'test:/attempt',
		});
	});

	test('automatically synthesizes with the recommended harness', async () => {
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(SESSION_COMPARISON_AUTO_SYNTHESIZE_SETTING, true);
		const { service, sessionsManagementService } = createServices(configurationService);
		sessionsManagementService.enqueue(stubSession('coordinator'));
		sessionsManagementService.enqueue(stubSession('attempt-one'));
		sessionsManagementService.enqueue(stubSession('attempt-two'));
		sessionsManagementService.enqueue(stubSession('synthesis'));

		const comparison = await service.startComparison(startOptions());
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		service.submitVerdict(comparison.id, verdict(attempts[1].id, attempts.map(attempt => attempt.id)));
		await timeout(0);

		const current = service.getComparison(comparison.id);
		assert.deepStrictEqual({
			synthesisResource: current?.participants.find(participant => participant.role === SessionComparisonParticipantRole.Synthesis)?.sessionResource?.toString(),
			providerId: sessionsManagementService.createCalls[3].createOptions?.providerId,
			sessionTypeId: sessionsManagementService.createCalls[3].createOptions?.sessionTypeId,
		}, {
			synthesisResource: 'test:/synthesis',
			providerId: 'provider-two',
			sessionTypeId: 'type-two',
		});
	});

	test('retains attempts whose cleanup fails', async () => {
		const { service, sessionsManagementService } = createServices();
		sessionsManagementService.enqueue(stubSession('coordinator'));
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

class TestSessionsManagementService extends mock<ISessionsManagementService>() implements IDisposable {
	private readonly _onDidChangeSessions = new Emitter<ISessionChangeEvent>();
	override readonly onDidChangeSessions = this._onDidChangeSessions.event;
	private readonly _results: Array<() => Promise<ISession | undefined>> = [];
	private readonly _sessions = new Map<string, ISession>();
	readonly createCalls: Array<{ folderUri: URI; options: NewSessionRequestOptions; createOptions?: ICreateNewSessionOptions; token?: CancellationToken }> = [];
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
		harnesses: [
			{ providerId: 'provider-one', sessionTypeId: 'type-one', label: 'One', modelId: 'model-one' },
			{ providerId: 'provider-two', sessionTypeId: 'type-two', label: 'Two', modelId: 'model-two' },
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
