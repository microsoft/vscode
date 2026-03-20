/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAgentSession, IAgentSessionsModel } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAgentSessionsService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { IActiveSessionItem, ISessionsManagementService } from '../../../sessions/browser/sessionsManagementService.js';
import { ICodeReviewService, CodeReviewService, CodeReviewStateKind, getCodeReviewFilesFromSessionChanges, getCodeReviewVersion } from '../../browser/codeReviewService.js';

suite('CodeReviewService', () => {

	const store = new DisposableStore();
	let instantiationService: TestInstantiationService;
	let service: ICodeReviewService;
	let commandService: MockCommandService;
	let storageService: InMemoryStorageService;
	let agentSessionsService: MockAgentSessionsService;

	let session: URI;
	let fileA: URI;
	let fileB: URI;

	class MockCommandService implements ICommandService {
		declare readonly _serviceBrand: undefined;
		readonly onWillExecuteCommand = Event.None;
		readonly onDidExecuteCommand = Event.None;

		result: unknown = undefined;
		lastCommandId: string | undefined;
		lastArgs: unknown[] | undefined;
		executeDeferred: { resolve: (v: unknown) => void; reject: (e: unknown) => void } | undefined;

		async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T> {
			this.lastCommandId = commandId;
			this.lastArgs = args;

			if (this.executeDeferred) {
				return await new Promise<T>((resolve, reject) => {
					this.executeDeferred = { resolve: resolve as (v: unknown) => void, reject };
				});
			}

			return this.result as T;
		}

		/**
		 * Configure the mock to defer execution until manually resolved/rejected.
		 */
		deferNextExecution(): void {
			this.executeDeferred = undefined;
			const self = this;
			const originalResult = this.result;

			// Override executeCommand for next call to capture the deferred promise
			const origExecute = this.executeCommand.bind(this);
			this.executeCommand = async function <T>(commandId: string, ...args: unknown[]): Promise<T> {
				self.lastCommandId = commandId;
				self.lastArgs = args;

				return new Promise<T>((resolve, reject) => {
					self.executeDeferred = { resolve: resolve as (v: unknown) => void, reject };
				});
			} as typeof origExecute;

			// Restore after use
			this._restoreExecute = () => {
				this.executeCommand = origExecute;
				this.result = originalResult;
			};
		}

		private _restoreExecute: (() => void) | undefined;

		resolveExecution(value: unknown): void {
			this.executeDeferred?.resolve(value);
			this.executeDeferred = undefined;
			this._restoreExecute?.();
		}

		rejectExecution(error: unknown): void {
			this.executeDeferred?.reject(error);
			this.executeDeferred = undefined;
			this._restoreExecute?.();
		}
	}

	class MockAgentSessionsService {
		declare readonly _serviceBrand: undefined;

		private readonly _onDidChangeSessionArchivedState: Emitter<IAgentSession>;
		readonly onDidChangeSessionArchivedState: Event<IAgentSession>;
		private readonly _onDidChangeSessions: Emitter<void>;
		readonly model: IAgentSessionsModel;
		private readonly _sessions = new Map<string, IAgentSession>();

		constructor(disposables: DisposableStore) {
			this._onDidChangeSessionArchivedState = disposables.add(new Emitter<IAgentSession>());
			this.onDidChangeSessionArchivedState = this._onDidChangeSessionArchivedState.event;
			this._onDidChangeSessions = disposables.add(new Emitter<void>());
			this.model = {
				onWillResolve: Event.None as Event<string>,
				onDidResolve: Event.None as Event<string>,
				onDidChangeSessions: this._onDidChangeSessions.event,
				onDidChangeSessionArchivedState: this._onDidChangeSessionArchivedState.event,
				resolved: true,
				sessions: [],
				getSession: (resource: URI) => this._sessions.get(resource.toString()),
				resolve: async () => { },
			};
		}

		getSession(resource: URI): IAgentSession | undefined {
			return this._sessions.get(resource.toString());
		}

		setSession(resource: URI, changes?: readonly IChatSessionFileChange2[], archived = false): IAgentSession {
			let _archived = archived;
			const session = {
				resource,
				changes,
				isArchived: () => _archived,
				setArchived: (v: boolean) => { _archived = v; },
				isPinned: () => false,
				setPinned: () => { },
				isRead: () => true,
				setRead: () => { },
			} as unknown as IAgentSession;
			this._sessions.set(resource.toString(), session);
			return session;
		}

		updateSessionChanges(resource: URI, changes: readonly IChatSessionFileChange2[] | undefined): void {
			const session = this._sessions.get(resource.toString()) as Record<string, unknown> | undefined;
			if (session) {
				session.changes = changes;
			}
		}

		removeSession(resource: URI): void {
			this._sessions.delete(resource.toString());
		}

		fireSessionArchivedState(session: IAgentSession): void {
			this._onDidChangeSessionArchivedState.fire(session);
		}

		fireSessionsChanged(): void {
			this._onDidChangeSessions.fire();
		}
	}

	setup(() => {
		instantiationService = store.add(new TestInstantiationService());

		commandService = new MockCommandService();
		instantiationService.stub(ICommandService, commandService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IGitHubService, new class extends mock<IGitHubService>() { }());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly activeSession = observableValue<IActiveSessionItem | undefined>('test.activeSession', undefined);
		}());

		storageService = store.add(new InMemoryStorageService());
		instantiationService.stub(IStorageService, storageService);

		agentSessionsService = new MockAgentSessionsService(store);
		instantiationService.stub(IAgentSessionsService, agentSessionsService);

		service = store.add(instantiationService.createInstance(CodeReviewService));
		session = URI.parse('test://session/1');
		fileA = URI.parse('file:///a.ts');
		fileB = URI.parse('file:///b.ts');
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// --- getReviewState ---

	test('initial state is idle', () => {
		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Idle);
	});

	test('getReviewState returns the same observable for the same session', () => {
		const obs1 = service.getReviewState(session);
		const obs2 = service.getReviewState(session);
		assert.strictEqual(obs1, obs2);
	});

	test('getReviewState returns different observables for different sessions', () => {
		const session2 = URI.parse('test://session/2');
		const obs1 = service.getReviewState(session);
		const obs2 = service.getReviewState(session2);
		assert.notStrictEqual(obs1, obs2);
	});

	// --- hasReview ---

	test('hasReview returns false when no review exists', () => {
		assert.strictEqual(service.hasReview(session, 'v1'), false);
	});

	test('hasReview returns false when review is for a different version', async () => {
		commandService.result = { type: 'success', comments: [] };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		// Wait for async command to complete
		await tick();

		assert.strictEqual(service.hasReview(session, 'v1'), true);
		assert.strictEqual(service.hasReview(session, 'v2'), false);
	});

	test('hasReview returns true after successful review', async () => {
		commandService.result = { type: 'success', comments: [] };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		await tick();

		assert.strictEqual(service.hasReview(session, 'v1'), true);
	});

	// --- requestReview ---

	test('requestReview transitions to loading state', () => {
		commandService.deferNextExecution();
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Loading);
		if (state.kind === CodeReviewStateKind.Loading) {
			assert.strictEqual(state.version, 'v1');
			assert.strictEqual(state.reviewCount, 1);
		}

		// Resolve to avoid leaking
		commandService.resolveExecution({ type: 'success', comments: [] });
	});

	test('requestReview calls command with correct arguments', async () => {
		commandService.result = { type: 'success', comments: [] };
		service.requestReview(session, 'v1', [
			{ currentUri: fileA, baseUri: fileB },
			{ currentUri: fileB },
		]);

		await tick();

		assert.strictEqual(commandService.lastCommandId, 'chat.internal.codeReview.run');
		const args = commandService.lastArgs?.[0] as { files: { currentUri: URI; baseUri?: URI }[] };
		assert.strictEqual(args.files.length, 2);
		assert.strictEqual(args.files[0].currentUri.toString(), fileA.toString());
		assert.strictEqual(args.files[0].baseUri?.toString(), fileB.toString());
		assert.strictEqual(args.files[1].currentUri.toString(), fileB.toString());
		assert.strictEqual(args.files[1].baseUri, undefined);
	});

	test('requestReview with success populates comments', async () => {
		commandService.result = {
			type: 'success',
			comments: [
				{
					uri: fileA,
					range: new Range(1, 1, 5, 1),
					body: 'Bug found',
					kind: 'bug',
					severity: 'high',
				},
				{
					uri: fileB,
					range: new Range(10, 1, 15, 1),
					body: 'Style issue',
					kind: 'style',
					severity: 'low',
				},
			],
		};

		service.requestReview(session, 'v1', [{ currentUri: fileA }, { currentUri: fileB }]);
		await tick();

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Result);
		if (state.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(state.version, 'v1');
			assert.strictEqual(state.reviewCount, 1);
			assert.strictEqual(state.comments.length, 2);
			assert.strictEqual(state.comments[0].body, 'Bug found');
			assert.strictEqual(state.comments[0].kind, 'bug');
			assert.strictEqual(state.comments[0].severity, 'high');
			assert.strictEqual(state.comments[0].uri.toString(), fileA.toString());
			assert.strictEqual(state.comments[1].body, 'Style issue');
		}
	});

	test('requestReview with error transitions to error state', async () => {
		commandService.result = { type: 'error', reason: 'Auth failed' };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		await tick();

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Error);
		if (state.kind === CodeReviewStateKind.Error) {
			assert.strictEqual(state.version, 'v1');
			assert.strictEqual(state.reviewCount, 1);
			assert.strictEqual(state.reason, 'Auth failed');
		}
	});

	test('requestReview with cancelled result transitions to idle', async () => {
		commandService.result = { type: 'cancelled' };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		await tick();

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Idle);
	});

	test('requestReview with undefined result transitions to idle', async () => {
		commandService.result = undefined;
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		await tick();

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Idle);
	});

	test('requestReview with thrown error transitions to error state', async () => {
		commandService.deferNextExecution();
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		commandService.rejectExecution(new Error('Network error'));

		await tick();

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Error);
		if (state.kind === CodeReviewStateKind.Error) {
			assert.strictEqual(state.reviewCount, 1);
			assert.ok(state.reason.includes('Network error'));
		}
	});

	test('requestReview is a no-op when loading for the same version', () => {
		commandService.deferNextExecution();
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		// Attempt to request again for the same version
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		// Should still be loading (not re-triggered)
		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Loading);

		commandService.resolveExecution({ type: 'success', comments: [] });
	});

	test('requestReview is a no-op when unresolved comments exist for the same version', async () => {
		commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment' }] };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		// Attempt to request again
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		// Should still have the result
		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Result);
		if (state.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(state.comments.length, 1);
		}
	});

	test('requestReview reruns when previous result for the same version had no comments', async () => {
		commandService.result = { type: 'success', comments: [] };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		commandService.deferNextExecution();
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Loading);

		commandService.resolveExecution({ type: 'success', comments: [] });
		await tick();
	});

	test('requestReview reruns when all comments for the same version were removed', async () => {
		commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment' }] };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		const initialState = service.getReviewState(session).get();
		assert.strictEqual(initialState.kind, CodeReviewStateKind.Result);
		if (initialState.kind !== CodeReviewStateKind.Result) {
			return;
		}

		service.removeComment(session, initialState.comments[0].id);

		commandService.deferNextExecution();
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Loading);

		commandService.resolveExecution({ type: 'success', comments: [] });
		await tick();
	});

	test('requestReview is a no-op after five reviews for the same version', async () => {
		commandService.result = { type: 'success', comments: [] };

		for (let i = 0; i < 5; i++) {
			service.requestReview(session, 'v1', [{ currentUri: fileA }]);
			await tick();
		}

		const stateBefore = service.getReviewState(session).get();
		assert.strictEqual(stateBefore.kind, CodeReviewStateKind.Result);
		if (stateBefore.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(stateBefore.reviewCount, 5);
		}

		commandService.deferNextExecution();
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		const stateAfter = service.getReviewState(session).get();
		assert.strictEqual(stateAfter.kind, CodeReviewStateKind.Result);
		if (stateAfter.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(stateAfter.reviewCount, 5);
		}
	});

	test('requestReview for a new version replaces loading state', async () => {
		// Start v1 review — it will complete immediately with empty result
		commandService.result = { type: 'success', comments: [] };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		assert.strictEqual(service.hasReview(session, 'v1'), true);

		// Request v2 — since v1 is a different version, it should proceed
		commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'v2 comment' }] };
		service.requestReview(session, 'v2', [{ currentUri: fileA }]);
		await tick();

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Result);
		if (state.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(state.version, 'v2');
			assert.strictEqual(state.comments.length, 1);
			assert.strictEqual(state.comments[0].body, 'v2 comment');
		}

		// v1 is no longer valid
		assert.strictEqual(service.hasReview(session, 'v1'), false);
	});

	// --- removeComment ---

	test('removeComment removes a specific comment', async () => {
		commandService.result = {
			type: 'success',
			comments: [
				{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment1' },
				{ uri: fileA, range: new Range(5, 1, 5, 1), body: 'comment2' },
				{ uri: fileB, range: new Range(10, 1, 10, 1), body: 'comment3' },
			],
		};

		service.requestReview(session, 'v1', [{ currentUri: fileA }, { currentUri: fileB }]);
		await tick();

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Result);
		if (state.kind !== CodeReviewStateKind.Result) { return; }

		const commentToRemove = state.comments[1];
		service.removeComment(session, commentToRemove.id);

		const newState = service.getReviewState(session).get();
		assert.strictEqual(newState.kind, CodeReviewStateKind.Result);
		if (newState.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(newState.comments.length, 2);
			assert.strictEqual(newState.comments[0].body, 'comment1');
			assert.strictEqual(newState.comments[1].body, 'comment3');
		}
	});

	test('removeComment is a no-op for unknown comment id', async () => {
		commandService.result = {
			type: 'success',
			comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment1' }],
		};

		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		service.removeComment(session, 'nonexistent-id');

		const state = service.getReviewState(session).get();
		if (state.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(state.comments.length, 1);
		}
	});

	test('removeComment is a no-op when no review exists', () => {
		// Should not throw
		service.removeComment(session, 'some-id');
		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Idle);
	});

	test('removeComment is a no-op when state is not result', () => {
		commandService.deferNextExecution();
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		// State is loading — removeComment should be ignored
		service.removeComment(session, 'some-id');

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Loading);

		commandService.resolveExecution({ type: 'success', comments: [] });
	});

	test('removeComment preserves version in result', async () => {
		commandService.result = {
			type: 'success',
			comments: [
				{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment1' },
				{ uri: fileA, range: new Range(5, 1, 5, 1), body: 'comment2' },
			],
		};

		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		const state = service.getReviewState(session).get();
		if (state.kind !== CodeReviewStateKind.Result) { return; }

		service.removeComment(session, state.comments[0].id);

		const newState = service.getReviewState(session).get();
		if (newState.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(newState.version, 'v1');
		}
	});

	// --- dismissReview ---

	test('dismissReview resets to idle', async () => {
		commandService.result = { type: 'success', comments: [] };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		assert.strictEqual(service.getReviewState(session).get().kind, CodeReviewStateKind.Result);

		service.dismissReview(session);

		assert.strictEqual(service.getReviewState(session).get().kind, CodeReviewStateKind.Idle);
	});

	test('dismissReview while loading resets to idle', () => {
		commandService.deferNextExecution();
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);

		assert.strictEqual(service.getReviewState(session).get().kind, CodeReviewStateKind.Loading);

		service.dismissReview(session);

		assert.strictEqual(service.getReviewState(session).get().kind, CodeReviewStateKind.Idle);

		// Resolve the pending command — should be ignored since dismissed
		commandService.resolveExecution({ type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'late' }] });
	});

	test('dismissReview is a no-op when no data exists', () => {
		// Should not throw
		service.dismissReview(session);
	});

	test('hasReview returns false after dismissReview', async () => {
		commandService.result = { type: 'success', comments: [] };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		assert.strictEqual(service.hasReview(session, 'v1'), true);

		service.dismissReview(session);

		assert.strictEqual(service.hasReview(session, 'v1'), false);
	});

	// --- Isolation between sessions ---

	test('different sessions are independent', async () => {
		const session2 = URI.parse('test://session/2');

		commandService.result = {
			type: 'success',
			comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'session1 comment' }],
		};
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		commandService.result = {
			type: 'success',
			comments: [{ uri: fileB, range: new Range(2, 1, 2, 1), body: 'session2 comment' }],
		};
		service.requestReview(session2, 'v2', [{ currentUri: fileB }]);
		await tick();

		const state1 = service.getReviewState(session).get();
		const state2 = service.getReviewState(session2).get();

		assert.strictEqual(state1.kind, CodeReviewStateKind.Result);
		assert.strictEqual(state2.kind, CodeReviewStateKind.Result);

		if (state1.kind === CodeReviewStateKind.Result && state2.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(state1.comments[0].body, 'session1 comment');
			assert.strictEqual(state2.comments[0].body, 'session2 comment');
		}

		// Dismissing session1 doesn't affect session2
		service.dismissReview(session);
		assert.strictEqual(service.getReviewState(session).get().kind, CodeReviewStateKind.Idle);
		assert.strictEqual(service.getReviewState(session2).get().kind, CodeReviewStateKind.Result);
	});

	// --- Comment parsing ---

	test('comments with string URIs are parsed correctly', async () => {
		commandService.result = {
			type: 'success',
			comments: [
				{
					uri: 'file:///parsed.ts',
					range: new Range(1, 1, 1, 1),
					body: 'parsed comment',
				},
			],
		};

		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		const state = service.getReviewState(session).get();
		if (state.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(state.comments[0].uri.toString(), 'file:///parsed.ts');
		}
	});

	test('comments with missing optional fields get defaults', async () => {
		commandService.result = {
			type: 'success',
			comments: [
				{
					uri: fileA,
					range: new Range(1, 1, 1, 1),
					// body, kind, severity omitted
				},
			],
		};

		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		const state = service.getReviewState(session).get();
		if (state.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(state.comments[0].body, '');
			assert.strictEqual(state.comments[0].kind, '');
			assert.strictEqual(state.comments[0].severity, '');
			assert.strictEqual(state.comments[0].suggestion, undefined);
		}
	});

	test('comments normalize VS Code API style ranges', async () => {
		commandService.result = {
			type: 'success',
			comments: [
				{
					uri: fileA,
					range: {
						start: { line: 4, character: 2 },
						end: { line: 6, character: 5 },
					},
					body: 'normalized comment',
					suggestion: {
						edits: [
							{
								range: {
									start: { line: 8, character: 1 },
									end: { line: 8, character: 9 },
								},
								oldText: 'let value',
								newText: 'const value',
							},
						],
					},
				},
			],
		};

		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Result);
		if (state.kind === CodeReviewStateKind.Result) {
			assert.deepStrictEqual(state.comments[0].range, new Range(5, 3, 7, 6));
			assert.deepStrictEqual(state.comments[0].suggestion?.edits[0].range, new Range(9, 2, 9, 10));
		}
	});

	test('comments normalize serialized URIs and tuple ranges from API payloads', async () => {
		const serializedUri = JSON.parse(JSON.stringify(URI.parse('git:/c%3A/Code/vscode.worktrees/copilot-worktree-2026-03-04T14-44-38/src/vs/sessions/contrib/changesView/test/browser/codeReviewService.test.ts?%7B%22path%22%3A%22c%3A%5C%5CCode%5C%5Cvscode.worktrees%5C%5Ccopilot-worktree-2026-03-04T14-44-38%5C%5Csrc%5C%5Cvs%5C%5Csessions%5C%5Ccontrib%5C%5CchangesView%5C%5Ctest%5C%5Cbrowser%5C%5CcodeReviewService.test.ts%22%2C%22ref%22%3A%22copilot-worktree-2026-03-04T14-44-38%22%7D')));

		commandService.result = {
			type: 'success',
			comments: [
				{
					uri: serializedUri,
					range: [
						{ line: 72, character: 2 },
						{ line: 72, character: 3 },
					],
					body: 'tuple range comment',
					kind: 'bug',
					severity: 'medium',
				},
			],
		};

		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Result);
		if (state.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(state.comments[0].uri.toString(), URI.revive(serializedUri).toString());
			assert.deepStrictEqual(state.comments[0].range, new Range(73, 3, 73, 4));
		}
	});

	test('each comment gets a unique id', async () => {
		commandService.result = {
			type: 'success',
			comments: [
				{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'a' },
				{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'b' },
			],
		};

		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		const state = service.getReviewState(session).get();
		if (state.kind === CodeReviewStateKind.Result) {
			assert.notStrictEqual(state.comments[0].id, state.comments[1].id);
		}
	});

	// --- Observable reactivity ---

	test('observable fires on state transitions', async () => {
		const states: string[] = [];
		const obs = service.getReviewState(session);

		// Collect initial state
		states.push(obs.get().kind);

		commandService.deferNextExecution();
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		states.push(obs.get().kind);

		commandService.resolveExecution({ type: 'success', comments: [] });
		await tick();
		states.push(obs.get().kind);

		service.dismissReview(session);
		states.push(obs.get().kind);

		assert.deepStrictEqual(states, [
			CodeReviewStateKind.Idle,
			CodeReviewStateKind.Loading,
			CodeReviewStateKind.Result,
			CodeReviewStateKind.Idle,
		]);
	});

	// --- Storage persistence ---

	test('review results are persisted to storage', async () => {
		commandService.result = {
			type: 'success',
			comments: [{ uri: fileA, range: new Range(1, 1, 5, 1), body: 'Persisted comment', kind: 'bug', severity: 'high' }],
		};
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		const raw = storageService.get('codeReview.reviews', StorageScope.WORKSPACE);
		assert.ok(raw, 'Storage should contain review data');
		const stored = JSON.parse(raw!);
		const reviewData = stored[session.toString()];
		assert.ok(reviewData);
		assert.strictEqual(reviewData.version, 'v1');
		assert.strictEqual(reviewData.reviewCount, 1);
		assert.strictEqual(reviewData.comments.length, 1);
		assert.strictEqual(reviewData.comments[0].body, 'Persisted comment');
	});

	test('reviews are restored from storage on service creation', async () => {
		commandService.result = {
			type: 'success',
			comments: [{ uri: fileA, range: new Range(1, 1, 5, 1), body: 'Restored comment', kind: 'bug', severity: 'high' }],
		};
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		// Create a second service with the same storage
		const service2 = store.add(instantiationService.createInstance(CodeReviewService));
		const state = service2.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Result);
		if (state.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(state.version, 'v1');
			assert.strictEqual(state.reviewCount, 1);
			assert.strictEqual(state.comments.length, 1);
			assert.strictEqual(state.comments[0].body, 'Restored comment');
			assert.strictEqual(state.comments[0].uri.toString(), fileA.toString());
			assert.deepStrictEqual(state.comments[0].range, { startLineNumber: 1, startColumn: 1, endLineNumber: 5, endColumn: 1 });
		}
	});

	test('suggestions are persisted and restored correctly', async () => {
		commandService.result = {
			type: 'success',
			comments: [{
				uri: fileA,
				range: new Range(1, 1, 5, 1),
				body: 'suggestion comment',
				suggestion: {
					edits: [{
						range: new Range(2, 1, 3, 10),
						oldText: 'let x = 1;',
						newText: 'const x = 1;',
					}],
				},
			}],
		};
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		const service2 = store.add(instantiationService.createInstance(CodeReviewService));
		const state = service2.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Result);
		if (state.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(state.comments[0].suggestion?.edits.length, 1);
			assert.strictEqual(state.comments[0].suggestion?.edits[0].oldText, 'let x = 1;');
			assert.strictEqual(state.comments[0].suggestion?.edits[0].newText, 'const x = 1;');
		}
	});

	test('removeComment updates storage', async () => {
		commandService.result = {
			type: 'success',
			comments: [
				{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment1' },
				{ uri: fileA, range: new Range(5, 1, 5, 1), body: 'comment2' },
			],
		};
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		const state = service.getReviewState(session).get();
		if (state.kind !== CodeReviewStateKind.Result) { return; }

		service.removeComment(session, state.comments[0].id);

		const raw = storageService.get('codeReview.reviews', StorageScope.WORKSPACE);
		const stored = JSON.parse(raw!);
		assert.strictEqual(stored[session.toString()].comments.length, 1);
		assert.strictEqual(stored[session.toString()].comments[0].body, 'comment2');
	});

	test('dismissReview removes session from storage', async () => {
		commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'c' }] };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		assert.ok(storageService.get('codeReview.reviews', StorageScope.WORKSPACE));

		service.dismissReview(session);

		assert.strictEqual(storageService.get('codeReview.reviews', StorageScope.WORKSPACE), undefined);
	});

	test('corrupted storage is handled gracefully', () => {
		storageService.store('codeReview.reviews', 'not-valid-json{{{', StorageScope.WORKSPACE, StorageTarget.MACHINE);

		const service2 = store.add(instantiationService.createInstance(CodeReviewService));
		const state = service2.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Idle);
	});

	// --- Session lifecycle cleanup ---

	test('archived session reviews are cleaned up', async () => {
		commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment' }] };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		assert.strictEqual(service.getReviewState(session).get().kind, CodeReviewStateKind.Result);

		const mockSession = agentSessionsService.setSession(session, undefined, true);
		agentSessionsService.fireSessionArchivedState(mockSession);

		assert.strictEqual(service.getReviewState(session).get().kind, CodeReviewStateKind.Idle);
		assert.strictEqual(storageService.get('codeReview.reviews', StorageScope.WORKSPACE), undefined);
	});

	test('non-archived session change does not clean up review', async () => {
		commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment' }] };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		const mockSession = agentSessionsService.setSession(session, undefined, false);
		agentSessionsService.fireSessionArchivedState(mockSession);

		assert.strictEqual(service.getReviewState(session).get().kind, CodeReviewStateKind.Result);
	});

	test('session with changed version has review cleaned up', async () => {
		const changes: IChatSessionFileChange2[] = [
			{ uri: fileA, modifiedUri: fileA, insertions: 1, deletions: 0 },
		];
		agentSessionsService.setSession(session, changes);

		const files = getCodeReviewFilesFromSessionChanges(changes);
		const version = getCodeReviewVersion(files);

		commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'stale comment' }] };
		service.requestReview(session, version, files);
		await tick();

		assert.strictEqual(service.getReviewState(session).get().kind, CodeReviewStateKind.Result);

		const newChanges: IChatSessionFileChange2[] = [
			{ uri: fileA, modifiedUri: fileA, insertions: 1, deletions: 0 },
			{ uri: fileB, modifiedUri: fileB, insertions: 2, deletions: 0 },
		];
		agentSessionsService.updateSessionChanges(session, newChanges);
		agentSessionsService.fireSessionsChanged();

		assert.strictEqual(service.getReviewState(session).get().kind, CodeReviewStateKind.Idle);
		assert.strictEqual(storageService.get('codeReview.reviews', StorageScope.WORKSPACE), undefined);
	});

	test('session that no longer exists has review cleaned up', async () => {
		commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'orphaned comment' }] };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		assert.strictEqual(service.getReviewState(session).get().kind, CodeReviewStateKind.Result);

		agentSessionsService.fireSessionsChanged();

		assert.strictEqual(service.getReviewState(session).get().kind, CodeReviewStateKind.Idle);
	});

	test('session with no changes has review cleaned up', async () => {
		agentSessionsService.setSession(session, [
			{ uri: fileA, modifiedUri: fileA, insertions: 1, deletions: 0 },
		]);

		commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'comment' }] };
		service.requestReview(session, 'v1', [{ currentUri: fileA }]);
		await tick();

		agentSessionsService.updateSessionChanges(session, undefined);
		agentSessionsService.fireSessionsChanged();

		assert.strictEqual(service.getReviewState(session).get().kind, CodeReviewStateKind.Idle);
	});

	test('session with matching version keeps review intact', async () => {
		const changes: IChatSessionFileChange2[] = [
			{ uri: fileA, modifiedUri: fileA, insertions: 1, deletions: 0 },
		];
		agentSessionsService.setSession(session, changes);

		const files = getCodeReviewFilesFromSessionChanges(changes);
		const version = getCodeReviewVersion(files);

		commandService.result = { type: 'success', comments: [{ uri: fileA, range: new Range(1, 1, 1, 1), body: 'valid comment' }] };
		service.requestReview(session, version, files);
		await tick();

		agentSessionsService.fireSessionsChanged();

		const state = service.getReviewState(session).get();
		assert.strictEqual(state.kind, CodeReviewStateKind.Result);
		if (state.kind === CodeReviewStateKind.Result) {
			assert.strictEqual(state.comments[0].body, 'valid comment');
		}
	});
});

function tick(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}
