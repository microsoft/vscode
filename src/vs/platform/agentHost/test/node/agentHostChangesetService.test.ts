/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agentService.js';
import { buildBranchChangesetUri, buildDefaultChangesetCatalog, buildSessionChangesetUri, buildTurnChangesetUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { ActionEnvelope, ActionType } from '../../common/state/sessionActions.js';
import { ChangesetStatus, SessionStatus, withSessionGitState, type Changeset } from '../../common/state/sessionState.js';
import { AgentHostChangesetService } from '../../node/agentHostChangesetService.js';
import { IAgentHostChangesetSubscriptionService } from '../../common/agentHostChangesetSubscriptionService.js';
import { IAgentHostChangesetOperationService } from '../../common/agentHostChangesetOperationService.js';
import { NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { NULL_REVIEW_SERVICE } from '../../common/agentHostReviewService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { createNoopGitService, createNullSessionDataService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { META_CHECKPOINT_WORKING_DIR } from '../../node/agentHostCheckpointService.js';

/**
 * Builds a test subscription service backed by a mutable set of subscribed
 * changeset URIs, so service tests can simulate subscribe / unsubscribe
 * without wiring up the coordinator.
 */
function createSubscriptionService(...changesets: string[]): IAgentHostChangesetSubscriptionService & { readonly subscriptions: Set<string> } {
	const subscriptions = new Set(changesets);
	return {
		_serviceBrand: undefined,
		subscriptions,
		getSessionSubscriptions: () => subscriptions,
		addSubscription: (_session, changeset) => { subscriptions.add(changeset); },
		removeSubscription: (_session, changeset) => { subscriptions.delete(changeset); },
		clearSessionSubscriptions: () => { subscriptions.clear(); },
	};
}

/**
 * Builds a no-op changeset operation service for tests. It advertises no
 * operations, which mirrors the default behaviour of a session without any
 * operation contributions.
 */
function createOperationService(): IAgentHostChangesetOperationService {
	return {
		_serviceBrand: undefined,
		registerContribution: () => toDisposable(() => { }),
		updateOperations: () => { },
		getOperations: () => undefined,
		invokeChangesetOperation: async () => { throw new Error('not implemented'); },
		dispose: () => { },
	};
}

suite.skip('AgentHostChangesetService', () => {

	const disposables = new DisposableStore();
	let stateManager: AgentHostStateManager;
	let changesetService: AgentHostChangesetService;

	const sessionUri = AgentSession.uri('mock', 'session-1');

	function setupSession(workingDirectory?: string): void {
		stateManager.createSession({
			resource: sessionUri.toString(),
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			project: { uri: 'file:///test-project', displayName: 'Test Project' },
			workingDirectories: workingDirectory ? [workingDirectory] : undefined,
		});
		stateManager.setSessionChangesets(sessionUri.toString(), buildDefaultChangesetCatalog(sessionUri.toString()));
		stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady, });
	}

	setup(() => {
		stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		changesetService = disposables.add(new AgentHostChangesetService(
			stateManager,
			new NullLogService(),
			createNullSessionDataService(),
			createNoopGitService(),
			NULL_CHECKPOINT_SERVICE,
			disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
			createOperationService(),
			createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())),
			NULL_REVIEW_SERVICE,
		));
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('registerStaticChangesets makes the two static changeset URIs subscribable with computing status', () => {
		const sessionStr = sessionUri.toString();
		setupSession();

		// Catalogue is seeded by setupSession (mirrors what `_buildInitialSummary`
		// does in production) — sanity check before exercising registration.
		assert.deepStrictEqual(stateManager.getSessionState(sessionStr)?.changesets, [
			{ label: 'Branch Changes', uriTemplate: `${sessionStr}/changeset/session`, changeKind: 'session' },
			{ label: 'Uncommitted Changes', uriTemplate: `${sessionStr}/changeset/uncommitted`, description: 'Show uncommitted changes in this session', changeKind: 'uncommitted' },
		]);

		changesetService.registerStaticChangesets(sessionStr);

		// Both static changeset URIs are now registered and subscribable
		// with `computing` snapshots so a client that subscribes before
		// the first compute pass sees a valid state.
		for (const id of ['uncommitted', 'session']) {
			const snapshot = stateManager.getSnapshot(`${sessionStr}/changeset/${id}`);
			assert.ok(snapshot, `expected ${id} changeset URI to be subscribable`);
			assert.strictEqual((snapshot.state as { status: string }).status, 'computing');
		}

		// Registration must not mutate the seeded catalogue.
		assert.deepStrictEqual(stateManager.getSessionState(sessionStr)?.changesets, [
			{ label: 'Branch Changes', uriTemplate: `${sessionStr}/changeset/session`, changeKind: 'session' },
			{ label: 'Uncommitted Changes', uriTemplate: `${sessionStr}/changeset/uncommitted`, description: 'Show uncommitted changes in this session', changeKind: 'uncommitted' },
		]);
	});

	test('registerStaticChangesets is idempotent across repeated calls', () => {
		const sessionStr = sessionUri.toString();
		setupSession();

		changesetService.registerStaticChangesets(sessionStr);
		changesetService.registerStaticChangesets(sessionStr);
		changesetService.registerStaticChangesets(sessionStr);

		const changesets = stateManager.getSessionState(sessionStr)?.changesets;
		assert.strictEqual(changesets?.length, 5, 'expected the three default catalogue entries');
	});

	test('restoreStaticChangeset publishes files in Ready and refreshes catalogue counts', () => {
		const sessionStr = sessionUri.toString();
		setupSession();

		const diffs = [
			{
				after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } },
				diff: { added: 5, removed: 2 },
			},
			{
				after: { uri: 'file:///wd/b.ts', content: { uri: 'file:///wd/b.ts' } },
				diff: { added: 1, removed: 0 },
			},
		];

		changesetService.restoreStaticChangeset(sessionStr, 'session', diffs);

		const changesetUri = `${sessionStr}/changeset/session`;
		const snapshot = stateManager.getSnapshot(changesetUri);
		assert.ok(snapshot, 'expected the changeset URI to be subscribable');
		const state = snapshot.state as { status: string; files: Array<{ id: string }> };
		assert.strictEqual(state.status, 'ready');
		assert.deepStrictEqual(state.files.map(f => f.id), ['file:///wd/a.ts', 'file:///wd/b.ts']);

		const catalogue = stateManager.getSessionState(sessionStr)?.changesets;
		assert.deepStrictEqual(catalogue, [
			{
				label: 'Branch Changes',
				uriTemplate: changesetUri,
				changeKind: 'session',
			},
			{
				label: 'Uncommitted Changes',
				uriTemplate: `${sessionStr}/changeset/uncommitted`,
				description: 'Show uncommitted changes in this session',
				changeKind: 'uncommitted',
			},
		]);
	});

	test('restoreStaticChangeset catalogue counts only emitted unique files', () => {
		const sessionStr = sessionUri.toString();
		setupSession();

		const diffs = [
			{
				after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } },
				diff: { added: 100, removed: 50 },
			},
			{
				diff: { added: 20, removed: 10 },
			},
			{
				after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } },
				diff: { added: 3, removed: 1 },
			},
			{
				after: { uri: 'file:///wd/b.ts', content: { uri: 'file:///wd/b.ts' } },
				diff: { added: 1, removed: 0 },
			},
		];

		changesetService.restoreStaticChangeset(sessionStr, 'session', diffs);

		const changesetUri = `${sessionStr}/changeset/session`;
		const snapshot = stateManager.getSnapshot(changesetUri);
		const state = snapshot?.state as { files: Array<{ id: string; edit: { diff?: { added?: number; removed?: number } } }> } | undefined;
		const catalogue = stateManager.getSessionState(sessionStr)?.changesets;
		assert.deepStrictEqual({
			files: state?.files.map(f => ({ id: f.id, diff: f.edit.diff })),
			catalogue,
		}, {
			files: [
				{ id: 'file:///wd/a.ts', diff: { added: 3, removed: 1 } },
				{ id: 'file:///wd/b.ts', diff: { added: 1, removed: 0 } },
			],
			catalogue: [
				{
					label: 'Branch Changes',
					uriTemplate: changesetUri,
					changeKind: 'session',
				},
				{
					label: 'Uncommitted Changes',
					uriTemplate: `${sessionStr}/changeset/uncommitted`,
					description: 'Show uncommitted changes in this session',
					changeKind: 'uncommitted',
				},
			],
		});
	});

	test('restoreStaticChangeset works without a live session state (seeds the changeset for unopened sessions)', () => {
		const sessionStr = sessionUri.toString();
		// Note: setupSession is intentionally NOT called.

		const diffs = [
			{
				after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } },
				diff: { added: 1, removed: 0 },
			},
		];
		changesetService.restoreStaticChangeset(sessionStr, 'session', diffs);

		// Session state still doesn't exist — only the changeset
		// state is registered so a client subscription resolves.
		assert.strictEqual(stateManager.getSessionState(sessionStr), undefined);
		const snapshot = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
		assert.ok(snapshot, 'expected the changeset URI to be subscribable even without a session state');
		const state = snapshot.state as { status: string; files: Array<{ id: string }> };
		assert.strictEqual(state.status, 'ready');
		assert.deepStrictEqual(state.files.map(f => f.id), ['file:///wd/a.ts']);
	});

	suite('session diff computation', () => {

		test('git-driven path is preferred when a git service is provided and the working dir is a git work tree', async () => {
			const sessionDb = new SessionDatabase(':memory:');
			disposables.add(toDisposable(() => sessionDb.close()));
			const sessionDataService = createSessionDataService(sessionDb);
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));

			const gitDiffs = [{
				after: { uri: 'file:///wd/new.ts', content: { uri: 'file:///wd/new.ts' } },
				diff: { added: 1, removed: 0 },
			}];
			const computeCalls: { workingDirectory: string; sessionUri: string; baseBranch: string | undefined }[] = [];
			const stubGit = {
				computeSessionFileDiffs: async (wd: URI, opts: { sessionUri: string; baseBranch?: string }) => {
					computeCalls.push({ workingDirectory: wd.toString(), sessionUri: opts.sessionUri, baseBranch: opts.baseBranch });
					return gitDiffs;
				},
			} as unknown as IAgentHostGitService;

			const localChangesets = disposables.add(new AgentHostChangesetService(
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE, disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())), createOperationService(), createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())), NULL_REVIEW_SERVICE));

			localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				workingDirectories: ['file:///wd'],
			});
			await sessionDb.setMetadata('agentHost.diffBaseBranch', 'main');

			const envelopes: ActionEnvelope[] = [];
			disposables.add(localStateManager.onDidEmitEnvelope(e => {
				envelopes.push(e);
			}));

			// Trigger a turn-complete (which fires the immediate diff path).
			// The uncommitted subscription makes on-turn-complete compute that
			// slot alongside the session-wide one.
			localChangesets.onTurnComplete(sessionUri.toString(), 'turn-1');

			// Turn-complete recomputes both the uncommitted and the
			// session-wide changesets via the per-key sequencer; wait
			// deterministically until both git calls have been observed
			// rather than racing on the first dispatched envelope.
			for (let i = 0; i < 200 && computeCalls.length < 2; i++) {
				await timeout(2);
			}

			// Turn-complete recomputes both the uncommitted (no
			// `baseBranch`) and the session-wide (with `baseBranch`)
			// changesets in parallel; assert both ran with the right
			// options regardless of order.
			const sortedCalls = [...computeCalls].sort((a, b) =>
				(a.baseBranch ?? '') < (b.baseBranch ?? '') ? -1 : 1);
			assert.deepStrictEqual(sortedCalls, [
				{ workingDirectory: 'file:///wd', sessionUri: sessionUri.toString(), baseBranch: undefined },
				{ workingDirectory: 'file:///wd', sessionUri: sessionUri.toString(), baseBranch: 'main' },
			]);
			// Each compute pass lands as a single `changeset/contentChanged`
			// envelope carrying the full file list. Walk the captured stream
			// and reconstruct the per-changeset file lists to assert each
			// matches the git service output.
			const contentChanges = envelopes
				.filter(e => e.action.type === ActionType.ChangesetContentChanged) as Array<{ channel: string; action: { files: Array<{ edit: unknown }> } }>;
			const sessionContent = contentChanges.filter(e => e.channel === `${sessionUri.toString()}/changeset/session`);
			const uncommittedContent = contentChanges.filter(e => e.channel === `${sessionUri.toString()}/changeset/uncommitted`);
			assert.deepStrictEqual(sessionContent.at(-1)?.action.files.map(f => f.edit), gitDiffs);
			assert.deepStrictEqual(uncommittedContent.at(-1)?.action.files.map(f => f.edit), gitDiffs);

			// The compute pass also persists the file list under the
			// legacy `'diffs'` slot so it survives restarts. The write
			// is fire-and-forget through the metadata sequencer; poll
			// briefly until it lands.
			let persisted: string | undefined;
			for (let i = 0; i < 50 && !persisted; i++) {
				await timeout(2);
				persisted = await sessionDb.getMetadata('diffs');
			}
			assert.ok(persisted, 'expected the compute pass to persist diffs to the session DB');
			assert.deepStrictEqual(JSON.parse(persisted), gitDiffs);
		});

		test('session changeset falls back to _meta.git base branch when persisted diff base is absent', async () => {
			const sessionDb = new SessionDatabase(':memory:');
			disposables.add(toDisposable(() => sessionDb.close()));
			const sessionDataService = createSessionDataService(sessionDb);
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const computeCalls: { baseBranch: string | undefined }[] = [];
			const stubGit = {
				computeSessionFileDiffs: async (_wd: URI, opts: { sessionUri: string; baseBranch?: string }) => {
					computeCalls.push({ baseBranch: opts.baseBranch });
					return [];
				},
			} as unknown as IAgentHostGitService;
			const localChangesets = disposables.add(new AgentHostChangesetService(
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE, disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())), createOperationService(), createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())), NULL_REVIEW_SERVICE));
			const sessionStr = sessionUri.toString();

			localStateManager.createSession({
				resource: sessionStr,
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				workingDirectories: ['file:///wd'],
			});
			localStateManager.setSessionMeta(sessionStr, withSessionGitState(undefined, { baseBranchName: 'main' }));

			localChangesets.refreshSessionChangeset(sessionStr);
			for (let i = 0; i < 50 && computeCalls.length === 0; i++) {
				await timeout(2);
			}

			assert.deepStrictEqual(computeCalls, [{ baseBranch: 'main' }]);
		});

		test('session changeset keeps persisted diff base ahead of _meta.git base branch', async () => {
			const sessionDb = new SessionDatabase(':memory:');
			disposables.add(toDisposable(() => sessionDb.close()));
			await sessionDb.setMetadata('agentHost.diffBaseBranch', 'release');
			const sessionDataService = createSessionDataService(sessionDb);
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const computeCalls: { baseBranch: string | undefined }[] = [];
			const stubGit = {
				computeSessionFileDiffs: async (_wd: URI, opts: { sessionUri: string; baseBranch?: string }) => {
					computeCalls.push({ baseBranch: opts.baseBranch });
					return [];
				},
			} as unknown as IAgentHostGitService;
			const localChangesets = disposables.add(new AgentHostChangesetService(
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE, disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())), createOperationService(), createSubscriptionService(), NULL_REVIEW_SERVICE));
			const sessionStr = sessionUri.toString();

			localStateManager.createSession({
				resource: sessionStr,
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				workingDirectories: ['file:///wd'],
			});
			localStateManager.setSessionMeta(sessionStr, withSessionGitState(undefined, { baseBranchName: 'main' }));

			localChangesets.refreshSessionChangeset(sessionStr);
			for (let i = 0; i < 50 && computeCalls.length === 0; i++) {
				await timeout(2);
			}

			assert.deepStrictEqual(computeCalls, [{ baseBranch: 'release' }]);
		});

		test('falls back to the edit-tracker aggregator when the git service returns undefined', async () => {
			const sessionDb = new SessionDatabase(':memory:');
			disposables.add(toDisposable(() => sessionDb.close()));
			const sessionDataService = createSessionDataService(sessionDb);
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));

			const stubGit = {
				computeSessionFileDiffs: async () => undefined,
			} as unknown as IAgentHostGitService;

			const localChangesets = disposables.add(new AgentHostChangesetService(
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE, disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())), createOperationService(), createSubscriptionService(), NULL_REVIEW_SERVICE));

			localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				workingDirectories: ['file:///wd'],
			});

			const envelopes: ActionEnvelope[] = [];
			let resolveDiffs: (() => void) | undefined;
			const diffsEmitted = new Promise<void>(r => { resolveDiffs = r; });
			disposables.add(localStateManager.onDidEmitEnvelope(e => {
				envelopes.push(e);
				if (e.action.type === ActionType.ChangesetStatusChanged) {
					resolveDiffs?.();
				}
			}));

			localChangesets.onTurnComplete(sessionUri.toString(), 'turn-1');

			await diffsEmitted;

			// With no recorded edits, the edit-tracker aggregator returns an
			// empty array — the single `changeset/contentChanged` envelope
			// carries an empty file list. The important assertion is that we
			// still ran the producer through to a `changeset/statusChanged →
			// ready` envelope, which proves the fallback path executed without
			// throwing.
			const contentChanges = envelopes
				.map(e => e.action)
				.filter(a => a.type === ActionType.ChangesetContentChanged) as Array<{ files: unknown[] }>;
			assert.deepStrictEqual(contentChanges.map(a => a.files), [[]]);
			const statusAction = envelopes
				.map(e => e.action)
				.find(a => a.type === ActionType.ChangesetStatusChanged);
			assert.ok(statusAction, 'expected a changeset/statusChanged envelope from the fallback path');
		});
	});

	suite('computeUncommittedChangeset', () => {

		test('happy path: git returns diffs, state goes Ready with files, nothing persisted to the DB', async () => {
			const sessionDb = new SessionDatabase(':memory:');
			disposables.add(toDisposable(() => sessionDb.close()));
			const sessionDataService = createSessionDataService(sessionDb);
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));

			const gitDiffs = [
				{ after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } }, diff: { added: 1, removed: 0 } },
				{ after: { uri: 'file:///wd/b.ts', content: { uri: 'file:///wd/b.ts' } }, diff: { added: 2, removed: 1 } },
			];
			const stubGit = {
				computeSessionFileDiffs: async () => gitDiffs,
			} as unknown as IAgentHostGitService;

			const localChangesets = disposables.add(new AgentHostChangesetService(
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE, disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())), createOperationService(), createSubscriptionService(), NULL_REVIEW_SERVICE));

			const sessionStr = sessionUri.toString();
			localStateManager.createSession({
				resource: sessionStr,
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				workingDirectories: ['file:///wd'],
			});

			await localChangesets.computeUncommittedChangeset(sessionStr);

			const uncommittedUri = `${sessionStr}/changeset/uncommitted`;
			const snapshot = localStateManager.getSnapshot(uncommittedUri);
			const state = snapshot?.state as { status: string; files: Array<{ id: string }> } | undefined;
			assert.deepStrictEqual({
				status: state?.status,
				files: state?.files.map(f => f.id).sort(),
				persistedUncommitted: await sessionDb.getMetadata('agentHost.changeset.uncommitted'),
			}, {
				status: ChangesetStatus.Ready,
				files: ['file:///wd/a.ts', 'file:///wd/b.ts'],
				persistedUncommitted: undefined,
			});
		});

		test('no working directory: state goes Error with computeFailed', async () => {
			const sessionStr = sessionUri.toString();
			setupSession();

			await changesetService.computeUncommittedChangeset(sessionStr);

			const uncommittedUri = `${sessionStr}/changeset/uncommitted`;
			const snapshot = stateManager.getSnapshot(uncommittedUri);
			const state = snapshot?.state as { status: string; error?: { errorType: string } } | undefined;
			assert.deepStrictEqual({
				status: state?.status,
				errorType: state?.error?.errorType,
			}, {
				status: ChangesetStatus.Error,
				errorType: 'computeFailed',
			});
		});

		test('git returns undefined (not a git work tree): state goes Error with computeFailed', async () => {
			const sessionStr = sessionUri.toString();
			setupSession('file:///wd');

			// Shared `changesetService` uses createNoopGitService() whose
			// computeSessionFileDiffs returns undefined — exactly the
			// "not a git work tree" signal we want to exercise.
			await changesetService.computeUncommittedChangeset(sessionStr);

			const uncommittedUri = `${sessionStr}/changeset/uncommitted`;
			const snapshot = stateManager.getSnapshot(uncommittedUri);
			const state = snapshot?.state as { status: string; error?: { errorType: string } } | undefined;
			assert.deepStrictEqual({
				status: state?.status,
				errorType: state?.error?.errorType,
			}, {
				status: ChangesetStatus.Error,
				errorType: 'computeFailed',
			});
		});

		test('git throws: state goes Error with original message', async () => {
			const stubGit = {
				computeSessionFileDiffs: async () => { throw new Error('git command failed'); },
			} as unknown as IAgentHostGitService;
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const localChangesets = disposables.add(new AgentHostChangesetService(
				localStateManager, new NullLogService(), createNullSessionDataService(), stubGit, NULL_CHECKPOINT_SERVICE, disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())), createOperationService(), createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())), NULL_REVIEW_SERVICE));

			const sessionStr = sessionUri.toString();
			localStateManager.createSession({
				resource: sessionStr,
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				workingDirectories: ['file:///wd'],
			});

			await localChangesets.computeUncommittedChangeset(sessionStr);

			const uncommittedUri = `${sessionStr}/changeset/uncommitted`;
			const snapshot = localStateManager.getSnapshot(uncommittedUri);
			const state = snapshot?.state as { status: string; error?: { errorType: string; message: string } } | undefined;
			assert.deepStrictEqual({
				status: state?.status,
				errorType: state?.error?.errorType,
				message: state?.error?.message,
			}, {
				status: ChangesetStatus.Error,
				errorType: 'computeFailed',
				message: 'git command failed',
			});
		});
	});

	suite('deferred refresh (working directory unknown)', () => {

		function createDeferringService(subscriptions: Iterable<string> = []): { service: AgentHostChangesetService; localStateManager: AgentHostStateManager; computes: string[]; subscriptions: Set<string> } {
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const computes: string[] = [];
			const stubGit = {
				computeSessionFileDiffs: async () => { computes.push('session'); return []; },
				computeUncommittedFileDiffs: async () => { computes.push('uncommitted'); return []; },
			} as unknown as IAgentHostGitService;
			const subscriptionService = createSubscriptionService(...subscriptions);
			const service = disposables.add(new AgentHostChangesetService(
				localStateManager,
				new NullLogService(),
				createNullSessionDataService(),
				stubGit,
				NULL_CHECKPOINT_SERVICE,
				disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
				createOperationService(),
				subscriptionService,
				NULL_REVIEW_SERVICE,
			));
			return { service, localStateManager, computes, subscriptions: subscriptionService.subscriptions };
		}

		function createSessionState(localStateManager: AgentHostStateManager, workingDirectory?: string): string {
			const sessionStr = sessionUri.toString();
			localStateManager.createSession({
				resource: sessionStr,
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				workingDirectories: workingDirectory ? [workingDirectory] : undefined,
			});
			localStateManager.setSessionChangesets(sessionStr, buildDefaultChangesetCatalog(sessionStr));
			return sessionStr;
		}

		test('refreshSessionChangeset / refreshBranchChangeset defer until the working directory is known, then drain the subscribed changesets', async () => {
			const sessionStr = sessionUri.toString();
			const { service, localStateManager, computes } = createDeferringService([
				buildBranchChangesetUri(sessionStr),
				buildSessionChangesetUri(sessionStr),
			]);
			createSessionState(localStateManager, undefined);

			service.refreshBranchChangeset(sessionStr);
			service.refreshSessionChangeset(sessionStr);
			await timeout(0);
			assert.deepStrictEqual(computes, [], 'nothing computed while the working directory is unknown');

			const summary = localStateManager.getSessionSummary(sessionStr)!;
			localStateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: ['file:///wd'] });
			service.onWorkingDirectoryAvailable(sessionStr);
			await timeout(0);
			assert.deepStrictEqual(computes.sort(), ['session', 'session']);
		});

		test('computeUncommittedChangeset defers until the working directory is known, then drains', async () => {
			const sessionStr = sessionUri.toString();
			const { service, localStateManager, computes } = createDeferringService([buildUncommittedChangesetUri(sessionStr)]);
			createSessionState(localStateManager, undefined);

			await service.computeUncommittedChangeset(sessionStr);
			assert.deepStrictEqual(computes, [], 'uncommitted compute deferred while the working directory is unknown');

			const summary = localStateManager.getSessionSummary(sessionStr)!;
			localStateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: ['file:///wd'] });
			service.onWorkingDirectoryAvailable(sessionStr);
			await timeout(0);
			assert.deepStrictEqual(computes, ['uncommitted']);
		});

		test('a changeset unsubscribed before materialization is naturally skipped on drain', async () => {
			const sessionStr = sessionUri.toString();
			const { service, localStateManager, computes, subscriptions } = createDeferringService([buildSessionChangesetUri(sessionStr)]);
			createSessionState(localStateManager, undefined);

			service.refreshSessionChangeset(sessionStr);
			// Last subscriber leaves before the working directory is known.
			subscriptions.delete(buildSessionChangesetUri(sessionStr));

			const summary = localStateManager.getSessionSummary(sessionStr)!;
			localStateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: ['file:///wd'] });
			service.onWorkingDirectoryAvailable(sessionStr);
			await timeout(0);
			assert.deepStrictEqual(computes, []);
		});

		test('onSessionDisposed clears every pending refresh for the session', async () => {
			const sessionStr = sessionUri.toString();
			const { service, localStateManager, computes } = createDeferringService([
				buildBranchChangesetUri(sessionStr),
				buildSessionChangesetUri(sessionStr),
				buildUncommittedChangesetUri(sessionStr),
			]);
			createSessionState(localStateManager, undefined);

			service.refreshBranchChangeset(sessionStr);
			service.refreshSessionChangeset(sessionStr);
			await service.computeUncommittedChangeset(sessionStr);
			service.onSessionDisposed(sessionStr);

			const summary = localStateManager.getSessionSummary(sessionStr)!;
			localStateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: ['file:///wd'] });
			service.onWorkingDirectoryAvailable(sessionStr);
			await timeout(0);
			assert.deepStrictEqual(computes, []);
		});
	});

	suite('restorePersistedStaticChangesets', () => {

		const aDiff = { after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } }, diff: { added: 1, removed: 0 } };
		const bDiff = { after: { uri: 'file:///wd/b.ts', content: { uri: 'file:///wd/b.ts' } }, diff: { added: 2, removed: 0 } };
		const sessionStr = sessionUri.toString();

		test('parsePersistedStaticChangesets parses without mutating state', () => {
			setupSession();
			changesetService.registerStaticChangesets(sessionStr);

			const result = changesetService.parsePersistedStaticChangesets(sessionStr, {
				sessionRaw: JSON.stringify([bDiff]),
			});

			assert.deepStrictEqual({
				session: result.session?.map(d => d.after?.uri),
				sessionState: stateManager.getChangesetState(buildSessionChangesetUri(sessionStr)),
			}, {
				session: ['file:///wd/b.ts'],
				sessionState: { status: 'computing', files: [] },
			});
		});

		test('applyPersistedStaticChangesets seeds parsed diffs', () => {
			setupSession();
			changesetService.registerStaticChangesets(sessionStr);
			const parsed = changesetService.parsePersistedStaticChangesets(sessionStr, {
				sessionRaw: JSON.stringify([bDiff]),
			});

			changesetService.applyPersistedStaticChangesets(sessionStr, parsed);

			const session = stateManager.getChangesetState(buildSessionChangesetUri(sessionStr));
			assert.deepStrictEqual(
				session && { status: session.status, files: session.files.map(f => f.id) },
				{ status: 'ready', files: ['file:///wd/b.ts'] },
			);
		});

		test('new sessionRaw beats legacyRaw when both are present', () => {
			setupSession();

			const result = changesetService.restorePersistedStaticChangesets(sessionStr, {
				sessionRaw: JSON.stringify([aDiff]),
				legacyRaw: JSON.stringify([bDiff]), // would lose
			});

			assert.deepStrictEqual(result.session?.map(d => d.after?.uri), ['file:///wd/a.ts'], 'new key wins over legacy');
		});

		test('legacyRaw still restores session state when sessionRaw is absent', () => {
			setupSession();

			const result = changesetService.restorePersistedStaticChangesets(sessionStr, {
				legacyRaw: JSON.stringify([bDiff]),
			});

			assert.deepStrictEqual(result.session?.map(d => d.after?.uri), ['file:///wd/b.ts']);
			const session = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
			assert.strictEqual((session?.state as { status: string }).status, 'ready');
		});

		test('malformed JSON logs and returns undefined for that slot', () => {
			setupSession();
			changesetService.registerStaticChangesets(sessionStr);

			const result = changesetService.restorePersistedStaticChangesets(sessionStr, {
				sessionRaw: '{ not valid json',
			});

			assert.strictEqual(result.session, undefined, 'malformed slot returns undefined');
			// Session snapshot stayed in `computing` because malformed input
			// was discarded — not seeded with garbage.
			const session = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
			assert.strictEqual((session?.state as { status: string }).status, 'computing');
		});

		test('seedIfEmpty honoured: live state with files is not overwritten', () => {
			setupSession();

			// Seed live session state via restoreStaticChangeset to mimic
			// a fresh refresh that landed before the persisted-overlay call.
			changesetService.restoreStaticChangeset(sessionStr, 'session', [aDiff]);
			const before = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
			assert.deepStrictEqual((before?.state as { files: Array<{ id: string }> }).files.map(f => f.id), ['file:///wd/a.ts']);

			// Persisted blob points at a DIFFERENT file; without the guard it
			// would clobber the live state.
			changesetService.restorePersistedStaticChangesets(sessionStr, {
				sessionRaw: JSON.stringify([bDiff]),
			});

			const after = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
			assert.deepStrictEqual(
				(after?.state as { files: Array<{ id: string }> }).files.map(f => f.id),
				['file:///wd/a.ts'],
				'live state must be preserved when persisted overlay tries to overwrite it',
			);
		});

		test('with live session state, restored diffs publish ready + catalogue counts', () => {
			setupSession();

			changesetService.restorePersistedStaticChangesets(sessionStr, {
				sessionRaw: JSON.stringify([aDiff, bDiff]),
			});

			const catalogue = stateManager.getSessionState(sessionStr)?.changesets;
			const sessionEntry = catalogue?.find((c: Changeset) => c.uriTemplate === `${sessionStr}/changeset/session`);
			assert.deepStrictEqual(sessionEntry, {
				label: 'Branch Changes',
				uriTemplate: `${sessionStr}/changeset/session`,
				changeKind: 'session',
			}, 'catalogue counts must reflect restored files');
		});
	});

	suite('idle changeset LRU eviction', () => {

		const sessionStr = sessionUri.toString();

		test('idle changeset states are evicted over the soft limit', () => {
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService(), { changesetStateRetention: { softLimit: 2 } }));
			const first = `${sessionStr}/changeset/session`;
			const second = `${sessionStr}/changeset/uncommitted`;
			const third = `${sessionStr}/changeset/turn/turn-1`;

			localStateManager.registerChangeset(first);
			localStateManager.registerChangeset(second);
			localStateManager.registerChangeset(third);

			assert.deepStrictEqual({
				first: localStateManager.getChangesetState(first),
				second: localStateManager.getChangesetState(second)?.status,
				third: localStateManager.getChangesetState(third)?.status,
			}, {
				first: undefined,
				second: 'computing',
				third: 'computing',
			});
		});

		test('evictability probe protects subscribed changesets', () => {
			const first = `${sessionStr}/changeset/session`;
			const second = `${sessionStr}/changeset/uncommitted`;
			const third = `${sessionStr}/changeset/turn/turn-1`;
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService(), { changesetStateRetention: { softLimit: 2, canEvict: changeset => changeset !== first } }));

			localStateManager.registerChangeset(first);
			localStateManager.registerChangeset(second);
			localStateManager.registerChangeset(third);

			assert.deepStrictEqual({
				first: localStateManager.getChangesetState(first)?.status,
				second: localStateManager.getChangesetState(second),
				third: localStateManager.getChangesetState(third)?.status,
			}, {
				first: 'computing',
				second: undefined,
				third: 'computing',
			});
		});

		test('LRU eviction is silent and does not dispatch ChangesetCleared', () => {
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService(), { changesetStateRetention: { softLimit: 1 } }));
			const envelopes: ActionEnvelope[] = [];
			const listener = disposables.add(localStateManager.onDidEmitEnvelope(e => envelopes.push(e)));

			localStateManager.registerChangeset(`${sessionStr}/changeset/session`);
			localStateManager.registerChangeset(`${sessionStr}/changeset/uncommitted`);

			assert.deepStrictEqual(envelopes.map(e => e.action.type), []);
			listener.dispose();
		});

		test('trimming reconsiders entries after they become evictable', () => {
			let canEvict = false;
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService(), { changesetStateRetention: { softLimit: 1, canEvict: () => canEvict } }));
			const first = `${sessionStr}/changeset/session`;
			const second = `${sessionStr}/changeset/uncommitted`;

			localStateManager.registerChangeset(first);
			localStateManager.registerChangeset(second);
			canEvict = true;
			localStateManager.onChangesetLivenessChanged();

			assert.deepStrictEqual({
				first: localStateManager.getChangesetState(first),
				second: localStateManager.getChangesetState(second)?.status,
			}, {
				first: undefined,
				second: 'computing',
			});
		});
	});

	suite('per-turn live streaming', () => {

		// Test rig: a subclass that counts `computeTurnChangeset` invocations
		// so we can assert gating wiring without needing real session DB
		// content for `computeTurnDiffs` to chew on. The base class behaviour
		// is preserved (super-call is awaited), so any per-file dispatch the
		// production path would emit still flows through normally.
		class CountingChangesetService extends AgentHostChangesetService {
			readonly turnComputeCalls: { session: string; turnId: string }[] = [];
			readonly uncommittedComputeCalls: string[] = [];
			override async computeTurnChangeset(session: string, turnId: string): Promise<string> {
				this.turnComputeCalls.push({ session, turnId });
				return super.computeTurnChangeset(session, turnId);
			}
			override async computeUncommittedChangeset(session: string): Promise<string> {
				this.uncommittedComputeCalls.push(session);
				return super.computeUncommittedChangeset(session);
			}
		}

		let subscriptions: Set<string>;
		function makeService(): CountingChangesetService {
			const subscriptionService = createSubscriptionService();
			subscriptions = subscriptionService.subscriptions;
			return disposables.add(new CountingChangesetService(
				stateManager,
				new NullLogService(),
				createNullSessionDataService(),
				createNoopGitService(),
				NULL_CHECKPOINT_SERVICE,
				disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
				createOperationService(),
				subscriptionService,
				NULL_REVIEW_SERVICE,
			));
		}
		test('onTurnComplete schedules a per-turn recompute when someone is subscribed', async () => {
			setupSession();
			const svc = makeService();
			subscriptions.add(buildTurnChangesetUri(sessionUri.toString(), 'turn-1'));

			svc.onTurnComplete(sessionUri.toString(), 'turn-1');

			// Sequencer drains async; wait briefly for the per-turn call.
			for (let i = 0; i < 50 && svc.turnComputeCalls.length === 0; i++) {
				await timeout(2);
			}
			assert.deepStrictEqual(
				svc.turnComputeCalls,
				[{ session: sessionUri.toString(), turnId: 'turn-1' }],
				'expected exactly one per-turn compute for the completed turn',
			);
		});

		test('onTurnComplete does NOT schedule a per-turn recompute when nobody is subscribed', async () => {
			setupSession();
			const svc = makeService();

			svc.onTurnComplete(sessionUri.toString(), 'turn-1');

			// Give the static computes a chance to drain — the per-turn
			// call must remain absent throughout.
			await timeout(20);
			assert.deepStrictEqual(svc.turnComputeCalls, [], 'no per-turn compute when nothing observes the turn URI');
		});

		test('onTurnComplete schedules an uncommitted recompute when someone is subscribed', async () => {
			setupSession();
			const svc = makeService();
			subscriptions.add(buildUncommittedChangesetUri(sessionUri.toString()));

			svc.onTurnComplete(sessionUri.toString(), 'turn-1');

			for (let i = 0; i < 50 && svc.uncommittedComputeCalls.length === 0; i++) {
				await timeout(2);
			}
			assert.deepStrictEqual(
				svc.uncommittedComputeCalls,
				[sessionUri.toString()],
				'expected exactly one uncommitted compute for the completed turn',
			);
		});

		test('onTurnComplete does NOT schedule an uncommitted recompute when nobody is subscribed', async () => {
			setupSession();
			const svc = makeService();

			svc.onTurnComplete(sessionUri.toString(), 'turn-1');

			// Give the static computes a chance to drain — the uncommitted
			// call must remain absent throughout.
			await timeout(20);
			assert.deepStrictEqual(svc.uncommittedComputeCalls, [], 'no uncommitted compute when nothing observes the uncommitted URI');
		});

		test('onToolCallEditsApplied fires the per-turn debounce only when subscribers exist; cancelled by onTurnComplete', () => {
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				setupSession();
				const svc = makeService();
				subscriptions.add(buildTurnChangesetUri(sessionUri.toString(), 'turn-1'));

				// 1) edits with subscriber -> after debounce, exactly one per-turn compute fires.
				svc.onToolCallEditsApplied(sessionUri.toString(), 'turn-1');
				await timeout(6_000); // debounce is 5s
				assert.strictEqual(svc.turnComputeCalls.length, 1, 'debounce should fire one per-turn compute');

				// 2) another edit batch + onTurnComplete before the debounce
				// elapses -> the debounce is cancelled and the final compute
				// is scheduled directly by onTurnComplete (one additional call).
				svc.onToolCallEditsApplied(sessionUri.toString(), 'turn-1');
				await timeout(1_000);
				svc.onTurnComplete(sessionUri.toString(), 'turn-1');
				await timeout(10);
				assert.strictEqual(svc.turnComputeCalls.length, 2, 'onTurnComplete cancels pending debounce and runs exactly one final compute');

				// 3) clearing the subscription mid-stream silences future
				// per-turn computes even if more edits arrive.
				subscriptions.clear();
				svc.onToolCallEditsApplied(sessionUri.toString(), 'turn-1');
				await timeout(6_000);
				assert.strictEqual(svc.turnComputeCalls.length, 2, 'unsubscribed turn must not get any further per-turn computes');
			});
		});

		test('per-turn URI streams a ChangesetContentChanged snapshot as the same turn is recomputed', async () => {
			// End-to-end variant exercising the real `computeTurnDiffs` path
			// — produces actual diff payloads from session-DB messages so
			// `_publishChangesetDiffs` emits a full content snapshot on each
			// recompute pass.
			const sessionDb = new SessionDatabase(':memory:');
			disposables.add(toDisposable(() => sessionDb.close()));
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const svc = disposables.add(new AgentHostChangesetService(
				localStateManager,
				new NullLogService(),
				createSessionDataService(sessionDb),
				createNoopGitService(),
				NULL_CHECKPOINT_SERVICE,
				disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
				createOperationService(),
				createSubscriptionService(buildTurnChangesetUri(sessionUri.toString(), 'turn-1')),
				NULL_REVIEW_SERVICE,
			));

			localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				workingDirectories: ['file:///wd'],
			});

			const envelopes: ActionEnvelope[] = [];
			disposables.add(localStateManager.onDidEmitEnvelope(e => envelopes.push(e)));
			const turnUri = `${sessionUri.toString()}/changeset/turn/turn-1`;

			// First compute pass — no edits yet, so just establishes the
			// per-turn state at status: ready with an empty file list.
			await svc.computeTurnChangeset(sessionUri.toString(), 'turn-1');
			const statusReady = envelopes
				.find(e => e.action.type === ActionType.ChangesetStatusChanged && e.channel === turnUri);
			assert.ok(statusReady, 'first per-turn compute must transition the URI to ready');

			// Subsequent recomputes are observable via `_publishChangesetDiffs`
			// even with empty diffs — the delta diffing is what matters here.
			// Smoke-check that calling `onTurnComplete` triggers another
			// `computeTurnChangeset` invocation through the sequencer.
			envelopes.length = 0;
			svc.onTurnComplete(sessionUri.toString(), 'turn-1');
			for (let i = 0; i < 100 && !envelopes.some(e => e.action.type === ActionType.ChangesetStatusChanged && e.channel === `${sessionUri.toString()}/changeset/session`); i++) {
				await timeout(2);
			}
			// Per-turn recompute was scheduled — at minimum its presence is
			// proven by the static-session recompute also having run (both
			// share the same `onTurnComplete` dispatch path).
			assert.ok(
				envelopes.some(e => e.action.type === ActionType.ChangesetStatusChanged),
				'onTurnComplete must drive at least one downstream changeset status transition',
			);
		});
	});

	suite('computeCompareTurnsChangeset', () => {

		function makeCheckpointService(pairs: Record<string, { parent: string; current: string } | undefined>, baselineRef?: string) {
			return {
				...NULL_CHECKPOINT_SERVICE,
				getTurnCheckpointPair: async (_session: URI, turnId: string) => pairs[turnId],
				getBaselineCheckpointRef: async () => baselineRef,
			};
		}

		test('publishes diffs as Ready when both checkpoints resolve and git returns diffs', async () => {
			const sessionStr = sessionUri.toString();
			setupSession('file:///wd');

			const db = new TestSessionDatabase();
			await db.setMetadata(META_CHECKPOINT_WORKING_DIR, 'file:///wd');

			const expectedDiffs = [
				{ after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } }, diff: { added: 4, removed: 1 } },
			];
			const calls: Array<{ fromRef: string; toRef: string }> = [];
			const gitService = createNoopGitService();
			gitService.computeFileDiffsBetweenRefs = async (_wd, opts) => {
				calls.push({ fromRef: opts.fromRef, toRef: opts.toRef });
				return expectedDiffs;
			};
			const svc = disposables.add(new AgentHostChangesetService(
				stateManager,
				new NullLogService(),
				createSessionDataService(db),
				gitService,
				makeCheckpointService({
					'orig': { parent: 'ref-orig-parent', current: 'ref-orig' },
					'mod': { parent: 'ref-orig', current: 'ref-mod' },
				}),
				disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
				createOperationService(),
				createSubscriptionService(),
				NULL_REVIEW_SERVICE,
			));

			const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, 'orig', 'mod');

			assert.strictEqual(compareUri, `${sessionStr}/changeset/compare/orig/mod`);
			assert.deepStrictEqual(calls, [{ fromRef: 'ref-orig', toRef: 'ref-mod' }]);
			const snapshot = stateManager.getSnapshot(compareUri);
			const state = snapshot?.state as { status: string; files: Array<{ id: string }> } | undefined;
			assert.deepStrictEqual({ status: state?.status, ids: state?.files.map(f => f.id) }, {
				status: 'ready',
				ids: ['file:///wd/a.ts'],
			});
		});

		test('transitions to Error when either checkpoint is missing', async () => {
			const sessionStr = sessionUri.toString();
			setupSession('file:///wd');

			const gitService = createNoopGitService();
			let gitCalls = 0;
			gitService.computeFileDiffsBetweenRefs = async () => { gitCalls++; return undefined; };
			const svc = disposables.add(new AgentHostChangesetService(
				stateManager,
				new NullLogService(),
				createSessionDataService(new TestSessionDatabase()),
				gitService,
				makeCheckpointService({
					'orig': { parent: 'ref-orig-parent', current: 'ref-orig' },
					// 'mod' is intentionally absent
				}),
				disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
				createOperationService(),
				createSubscriptionService(),
				NULL_REVIEW_SERVICE,
			));

			const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, 'orig', 'mod');

			const snapshot = stateManager.getSnapshot(compareUri);
			const state = snapshot?.state as { status: string; error?: { message: string } } | undefined;
			assert.strictEqual(state?.status, 'error');
			assert.ok(state?.error?.message.includes('modified turn'), `expected error to name the missing side, got ${state?.error?.message}`);
			assert.strictEqual(gitCalls, 0, 'git must not be invoked when a checkpoint is missing');
		});

		test('returns empty Ready snapshot when both checkpoints point at the same ref', async () => {
			const sessionStr = sessionUri.toString();
			setupSession('file:///wd');

			const gitService = createNoopGitService();
			let gitCalls = 0;
			gitService.computeFileDiffsBetweenRefs = async () => { gitCalls++; return undefined; };
			const svc = disposables.add(new AgentHostChangesetService(
				stateManager,
				new NullLogService(),
				createSessionDataService(new TestSessionDatabase()),
				gitService,
				makeCheckpointService({
					'orig': { parent: 'p1', current: 'same-ref' },
					'mod': { parent: 'same-ref', current: 'same-ref' },
				}),
				disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
				createOperationService(),
				createSubscriptionService(),
				NULL_REVIEW_SERVICE,
			));

			const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, 'orig', 'mod');

			const snapshot = stateManager.getSnapshot(compareUri);
			const state = snapshot?.state as { status: string; files: Array<unknown> } | undefined;
			assert.deepStrictEqual({ status: state?.status, files: state?.files }, { status: 'ready', files: [] });
			assert.strictEqual(gitCalls, 0, 'git diff must be short-circuited when both refs match');
		});

		test('transitions to Error when the git diff returns undefined (git failure, not empty)', async () => {
			const sessionStr = sessionUri.toString();
			setupSession('file:///wd');

			const db = new TestSessionDatabase();
			await db.setMetadata(META_CHECKPOINT_WORKING_DIR, 'file:///wd');

			const gitService = createNoopGitService();
			gitService.computeFileDiffsBetweenRefs = async () => undefined;
			const svc = disposables.add(new AgentHostChangesetService(
				stateManager,
				new NullLogService(),
				createSessionDataService(db),
				gitService,
				makeCheckpointService({
					'orig': { parent: 'p', current: 'ref-orig' },
					'mod': { parent: 'ref-orig', current: 'ref-mod' },
				}),
				disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
				createOperationService(),
				createSubscriptionService(),
				NULL_REVIEW_SERVICE,
			));

			const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, 'orig', 'mod');

			const snapshot = stateManager.getSnapshot(compareUri);
			const state = snapshot?.state as { status: string; error?: { message: string } } | undefined;
			assert.strictEqual(state?.status, 'error');
			assert.ok(state?.error?.message.includes('git'), `expected git-failure error message, got ${state?.error?.message}`);
		});
	});
});
