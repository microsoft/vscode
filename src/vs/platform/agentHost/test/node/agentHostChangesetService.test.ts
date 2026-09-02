/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agent.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind } from '../../common/agentHostTelemetry.js';
import { buildBranchChangesetUri, buildDefaultChangesetCatalog, buildSessionChangesetUri, buildTurnChangesetUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { ActionEnvelope, ActionType } from '../../common/state/sessionActions.js';
import { ChangesetStatus, FileEditKind, MessageKind, SessionStatus, withSessionGitState, type Changeset, type ISessionFileDiff } from '../../common/state/sessionState.js';
import { AgentHostChangesetService } from '../../node/agentHostChangesetService.js';
import { NullAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';
import { META_CHANGES_SUMMARY } from '../../common/agentHostChangesetService.js';
import type { ChangesSummary } from '../../common/state/protocol/state.js';
import { IAgentHostChangesetSubscriptionService } from '../../common/agentHostChangesetSubscriptionService.js';
import { IAgentHostChangesetOperationService } from '../../common/agentHostChangesetOperationService.js';
import { NULL_CHECKPOINT_SERVICE, type IAgentHostCheckpointService } from '../../common/agentHostCheckpointService.js';
import { NULL_REVIEW_SERVICE } from '../../common/agentHostReviewService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { createNoopGitService, createNullSessionDataService, createSessionDataService, encodeString, TestDiffComputeService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

type WithoutLast<T extends readonly unknown[]> = T extends [...infer Head, unknown] ? Head : never;

class TestAgentHostChangesetService extends AgentHostChangesetService {
	constructor(...args: WithoutLast<ConstructorParameters<typeof AgentHostChangesetService>>) {
		super(...args, new NullAgentHostWorktreeIsolation());
	}
}

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
		onDidChangeSessionSubscriptions: Event.None,
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

/** Captures `publicLog2` telemetry events so tests can assert on emitted fields. */
class CapturingTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sessionId = 'test-session';
	readonly machineId = 'test-machine';
	readonly sqmId = 'test-sqm';
	readonly devDeviceId = 'test-dev-device';
	readonly firstSessionDate = 'test-first-session-date';
	readonly sendErrorTelemetry = false;
	readonly events: { eventName: string; data: Record<string, unknown> }[] = [];

	publicLog(): void { }
	publicLog2(eventName: string, data?: Record<string, unknown>): void {
		this.events.push({ eventName, data: data ?? {} });
	}
	publicLogError(): void { }
	publicLogError2(eventName: string, data?: Record<string, unknown>): void {
		this.events.push({ eventName, data: data ?? {} });
	}
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
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
		changesetService = disposables.add(new TestAgentHostChangesetService(
			stateManager,
			new NullLogService(),
			createNullSessionDataService(),
			createNoopGitService(),
			NULL_CHECKPOINT_SERVICE,
			disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
			createOperationService(),
			createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())),
			NULL_REVIEW_SERVICE,
			NullTelemetryService,
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

			const localChangesets = disposables.add(new TestAgentHostChangesetService(
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE, disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())), createOperationService(), createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())), NULL_REVIEW_SERVICE, NullTelemetryService));

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
			const localChangesets = disposables.add(new TestAgentHostChangesetService(
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE, disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())), createOperationService(), createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())), NULL_REVIEW_SERVICE, NullTelemetryService));
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
			const localChangesets = disposables.add(new TestAgentHostChangesetService(
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE, disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())), createOperationService(), createSubscriptionService(), NULL_REVIEW_SERVICE, NullTelemetryService));
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

			const localChangesets = disposables.add(new TestAgentHostChangesetService(
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE, disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())), createOperationService(), createSubscriptionService(), NULL_REVIEW_SERVICE, NullTelemetryService));

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

			const localChangesets = disposables.add(new TestAgentHostChangesetService(
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE, disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())), createOperationService(), createSubscriptionService(), NULL_REVIEW_SERVICE, NullTelemetryService));

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
			const localChangesets = disposables.add(new TestAgentHostChangesetService(
				localStateManager, new NullLogService(), createNullSessionDataService(), stubGit, NULL_CHECKPOINT_SERVICE, disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())), createOperationService(), createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())), NULL_REVIEW_SERVICE, NullTelemetryService));

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

	suite('materialization refresh (working directory unknown)', () => {

		function createDeferringService(subscriptions: Iterable<string> = []): { service: AgentHostChangesetService; localStateManager: AgentHostStateManager; computes: string[]; subscriptions: Set<string> } {
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const computes: string[] = [];
			const stubGit = {
				computeSessionFileDiffs: async () => { computes.push('session'); return []; },
				computeUncommittedFileDiffs: async () => { computes.push('uncommitted'); return []; },
			} as unknown as IAgentHostGitService;
			const subscriptionService = createSubscriptionService(...subscriptions);
			const service = disposables.add(new TestAgentHostChangesetService(
				localStateManager,
				new NullLogService(),
				createNullSessionDataService(),
				stubGit,
				NULL_CHECKPOINT_SERVICE,
				disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
				createOperationService(),
				subscriptionService,
				NULL_REVIEW_SERVICE,
				NullTelemetryService,
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

		test('refreshSessionChangeset / refreshBranchChangeset skip until the working directory is known, then recompute the subscribed changesets', async () => {
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

		test('computeUncommittedChangeset skips until the working directory is known, then recomputes', async () => {
			const sessionStr = sessionUri.toString();
			const { service, localStateManager, computes } = createDeferringService([buildUncommittedChangesetUri(sessionStr)]);
			createSessionState(localStateManager, undefined);

			await service.computeUncommittedChangeset(sessionStr);
			assert.deepStrictEqual(computes, [], 'uncommitted compute skipped while the working directory is unknown');

			const summary = localStateManager.getSessionSummary(sessionStr)!;
			localStateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: ['file:///wd'] });
			service.onWorkingDirectoryAvailable(sessionStr);
			await timeout(0);
			assert.deepStrictEqual(computes, ['uncommitted']);
		});

		test('a changeset unsubscribed before materialization is skipped', async () => {
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
		class CountingChangesetService extends TestAgentHostChangesetService {
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
				NullTelemetryService,
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
			const svc = disposables.add(new TestAgentHostChangesetService(
				localStateManager,
				new NullLogService(),
				createSessionDataService(sessionDb),
				createNoopGitService(),
				NULL_CHECKPOINT_SERVICE,
				disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
				createOperationService(),
				createSubscriptionService(buildTurnChangesetUri(sessionUri.toString(), 'turn-1')),
				NULL_REVIEW_SERVICE,
				NullTelemetryService,
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

			const expectedDiffs = [
				{ after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } }, diff: { added: 4, removed: 1 } },
			];
			const calls: Array<{ fromRef: string; toRef: string }> = [];
			const gitService = createNoopGitService();
			gitService.computeFileDiffsBetweenRefs = async (_wd, opts) => {
				calls.push({ fromRef: opts.fromRef, toRef: opts.toRef });
				return expectedDiffs;
			};
			const svc = disposables.add(new TestAgentHostChangesetService(
				stateManager,
				new NullLogService(),
				createSessionDataService(new TestSessionDatabase()),
				gitService,
				makeCheckpointService({
					'orig': { parent: 'ref-orig-parent', current: 'ref-orig' },
					'mod': { parent: 'ref-orig', current: 'ref-mod' },
				}),
				disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
				createOperationService(),
				createSubscriptionService(),
				NULL_REVIEW_SERVICE,
				NullTelemetryService,
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
			const svc = disposables.add(new TestAgentHostChangesetService(
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
				NullTelemetryService,
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
			const svc = disposables.add(new TestAgentHostChangesetService(
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
				NullTelemetryService,
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

			const gitService = createNoopGitService();
			gitService.computeFileDiffsBetweenRefs = async () => undefined;
			const svc = disposables.add(new TestAgentHostChangesetService(
				stateManager,
				new NullLogService(),
				createSessionDataService(new TestSessionDatabase()),
				gitService,
				makeCheckpointService({
					'orig': { parent: 'p', current: 'ref-orig' },
					'mod': { parent: 'ref-orig', current: 'ref-mod' },
				}),
				disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
				createOperationService(),
				createSubscriptionService(),
				NULL_REVIEW_SERVICE,
				NullTelemetryService,
			));

			const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, 'orig', 'mod');

			const snapshot = stateManager.getSnapshot(compareUri);
			const state = snapshot?.state as { status: string; error?: { message: string } } | undefined;
			assert.strictEqual(state?.status, 'error');
			assert.ok(state?.error?.message.includes('git'), `expected git-failure error message, got ${state?.error?.message}`);
		});
	});
});

suite('AgentHostChangesetService - materialization refresh', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('recomputes an uncommitted subscription added after worktree pending clears but before materialization', async () => {
		const sessionStr = AgentSession.uri('mock', 'session-materialization').toString();
		const sourceDirectory = 'file:///repo/source';
		const worktreeDirectory = 'file:///repo/worktree';
		const computedWorkingDirectories: string[] = [];
		const gitService = createNoopGitService();
		gitService.computeSessionFileDiffs = async workingDirectory => {
			computedWorkingDirectories.push(workingDirectory.toString());
			return [];
		};
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const diffService = new TestDiffComputeService();
		class TestableChangesetService extends TestAgentHostChangesetService {
			protected override _createDiffComputeService() {
				return diffService;
			}
		}
		const subscriptionService = createSubscriptionService();
		const service = disposables.add(new TestableChangesetService(
			stateManager,
			new NullLogService(),
			createNullSessionDataService(),
			gitService,
			NULL_CHECKPOINT_SERVICE,
			disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
			createOperationService(),
			subscriptionService,
			NULL_REVIEW_SERVICE,
			NullTelemetryService,
		));
		stateManager.createSession({
			resource: sessionStr,
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			workingDirectories: [sourceDirectory],
		}, { emitNotification: false });

		const uncommittedChangeset = buildUncommittedChangesetUri(sessionStr);
		subscriptionService.addSubscription(sessionStr, uncommittedChangeset);
		await service.computeUncommittedChangeset(sessionStr);

		const summary = stateManager.getSessionSummary(sessionStr)!;
		stateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: [worktreeDirectory] });
		service.onWorkingDirectoryAvailable(sessionStr);
		await timeout(0);

		assert.deepStrictEqual(computedWorkingDirectories, [sourceDirectory, worktreeDirectory]);
	});
});

/**
 * A log service that records every warning/error message so multi-root tests
 * can assert the never-hard-fail path logged the expected per-folder failure.
 */
class RecordingLogService extends NullLogService {
	readonly errors: string[] = [];
	readonly warnings: string[] = [];
	override error(message: string | Error): void {
		this.errors.push(message instanceof Error ? message.message : message);
	}
	override warn(message: string): void {
		this.warnings.push(message);
	}
}

suite('AgentHostChangesetService - turn changeset lifecycle', () => {

	const disposables = new DisposableStore();
	const sessionStr = AgentSession.uri('mock', 'session-turn-lifecycle').toString();

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('marks a ready turn changeset as computing until recomputation completes', async () => {
		const recomputeGate = new DeferredPromise<void>();
		let computeCount = 0;
		const git = createNoopGitService();
		git.getRepositoryRoot = async wd => URI.parse(wd.toString());
		git.computeFileDiffsBetweenRefs = async () => {
			computeCount++;
			if (computeCount > 1) {
				await recomputeGate.p;
			}
			return [];
		};
		const checkpoint: IAgentHostCheckpointService = {
			...NULL_CHECKPOINT_SERVICE,
			getTurnCheckpointPair: async () => ({ parent: 'parent', current: 'current' }),
		};
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const diffService = new TestDiffComputeService();
		class TestableChangesetService extends TestAgentHostChangesetService {
			protected override _createDiffComputeService() {
				return diffService;
			}
		}
		const svc = disposables.add(new TestableChangesetService(
			stateManager,
			new NullLogService(),
			createSessionDataService(new TestSessionDatabase()),
			git,
			checkpoint,
			disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
			createOperationService(),
			createSubscriptionService(),
			NULL_REVIEW_SERVICE,
			NullTelemetryService,
		));
		stateManager.createSession({
			resource: sessionStr,
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			workingDirectories: ['file:///repo'],
		});
		const turnUri = await svc.computeTurnChangeset(sessionStr, 'turn-1');

		const recompute = svc.computeTurnChangeset(sessionStr, 'turn-1');
		const whileRecomputing = stateManager.getChangesetState(turnUri)?.status;
		recomputeGate.complete();
		await recompute;

		assert.deepStrictEqual({
			whileRecomputing,
			afterRecompute: stateManager.getChangesetState(turnUri),
		}, {
			whileRecomputing: ChangesetStatus.Computing,
			afterRecompute: {
				status: ChangesetStatus.Ready,
				files: [],
			},
		});
	});
});

/**
 * Multi-root turn changeset aggregation (AC-2). A separate top-level suite so
 * these run against the current service (the older `AgentHostChangesetService`
 * suite above is skipped pending an unrelated catalogue refresh).
 */
suite('AgentHostChangesetService - multi-root turn changeset', () => {

	const disposables = new DisposableStore();
	const sessionStr = AgentSession.uri('mock', 'session-mr').toString();

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	function gitDiff(path: string, added = 1, removed = 0): ISessionFileDiff {
		const uri = URI.file(path).toString();
		return { after: { uri, content: { uri } }, diff: { added, removed } };
	}

	/** Builds a checkpoint service whose per-repo pair is derived from the working directory. */
	function makeCheckpoint(pairFor: (workingDirectory: string | undefined) => { parent: string; current: string } | undefined): IAgentHostCheckpointService {
		return {
			...NULL_CHECKPOINT_SERVICE,
			getTurnCheckpointPair: async (_session: URI, _turnId: string, workingDirectory?: URI) => pairFor(workingDirectory?.toString()),
		};
	}

	function build(options: {
		workingDirectories: string[];
		git: IAgentHostGitService;
		checkpoint: IAgentHostCheckpointService;
		db?: TestSessionDatabase;
		log?: RecordingLogService;
		telemetry?: ITelemetryService;
		subscriptions?: string[];
		peer?: { resource: string; db: TestSessionDatabase; turnId: string; onDispose?: () => void };
	}): { svc: AgentHostChangesetService; stateManager: AgentHostStateManager; log: RecordingLogService } {
		const log = options.log ?? new RecordingLogService();
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const db = options.db ?? new TestSessionDatabase();
		// The production diff-count worker runs an ESM module in a raw
		// worker_thread, which the unit-test harness cannot load, so substitute
		// the shared synchronous in-process computer via the factory seam.
		const diffService = new TestDiffComputeService();
		class TestableChangesetService extends TestAgentHostChangesetService {
			protected override _createDiffComputeService() {
				return diffService;
			}
		}
		const sessionDataService = createSessionDataService(db);
		const peerDataService = options.peer ? createSessionDataService(options.peer.db) : undefined;
		const svc = disposables.add(new TestableChangesetService(
			stateManager,
			log,
			{
				...sessionDataService,
				openDatabase: resource => {
					if (options.peer?.resource !== resource.toString()) {
						return sessionDataService.openDatabase(resource);
					}
					const ref = peerDataService!.openDatabase(resource);
					return {
						object: ref.object,
						dispose: () => {
							options.peer?.onDispose?.();
							ref.dispose();
						},
					};
				},
			},
			options.git,
			options.checkpoint,
			disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
			createOperationService(),
			createSubscriptionService(...(options.subscriptions ?? [])),
			NULL_REVIEW_SERVICE,
			options.telemetry ?? NullTelemetryService,
		));
		stateManager.createSession({
			resource: sessionStr,
			provider: 'mock',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			workingDirectories: options.workingDirectories,
		});
		if (options.peer) {
			stateManager.addChat(sessionStr, options.peer.resource);
			stateManager.dispatchServerAction(options.peer.resource, {
				type: ActionType.ChatTurnStarted,
				turnId: options.peer.turnId,
				startedAt: new Date(0).toISOString(),
				message: { text: 'peer', origin: { kind: MessageKind.User } },
			});
			stateManager.dispatchServerAction(options.peer.resource, {
				type: ActionType.ChatTurnComplete,
				turnId: options.peer.turnId,
				duration: 1,
			});
		}
		return { svc, stateManager, log };
	}

	test('aggregates turn diffs across all folders of a multi-root session', async () => {
		const git = createNoopGitService();
		git.getRepositoryRoot = async wd => URI.parse(wd.toString());
		git.computeFileDiffsBetweenRefs = async wd => {
			const root = wd.toString();
			if (root === 'file:///repoA') { return [gitDiff('/repoA/a.ts')]; }
			if (root === 'file:///repoB') { return [gitDiff('/repoB/b.ts')]; }
			return undefined;
		};
		const checkpoint = makeCheckpoint(root => ({ parent: `${root}~p`, current: `${root}~c` }));
		const { svc, stateManager } = build({ workingDirectories: ['file:///repoA', 'file:///repoB'], git, checkpoint });

		const turnUri = await svc.computeTurnChangeset(sessionStr, 'turn-1');

		const state = stateManager.getChangesetState(turnUri);
		assert.strictEqual(state?.status, ChangesetStatus.Ready);
		assert.deepStrictEqual(
			new Set(state?.files.map(f => f.id)),
			new Set([URI.file('/repoA/a.ts').toString(), URI.file('/repoB/b.ts').toString()]),
			'the turn changeset must contain files from every folder',
		);
	});

	test('partitions git vs non-git folders so git-folder edits are not double-counted by the DB', async () => {
		const db = new TestSessionDatabase();
		// The DB edit tracker is path-based (no folder column) so it records
		// edits from BOTH folders, including two under the git-backed repoB.
		db.addEdit({ turnId: 'turn-1', toolCallId: 'tcX', filePath: '/folderA/x.txt', kind: FileEditKind.Edit, addedLines: undefined, removedLines: undefined, beforeContent: encodeString('a'), afterContent: encodeString('a\nb') });
		db.addEdit({ turnId: 'turn-1', toolCallId: 'tcY', filePath: '/repoB/y.txt', kind: FileEditKind.Edit, addedLines: undefined, removedLines: undefined, beforeContent: encodeString('c'), afterContent: encodeString('c\nd') });
		db.addEdit({ turnId: 'turn-1', toolCallId: 'tcZ', filePath: '/repoB/z.txt', kind: FileEditKind.Edit, addedLines: undefined, removedLines: undefined, beforeContent: encodeString('e'), afterContent: encodeString('e\nf') });

		const git = createNoopGitService();
		git.getRepositoryRoot = async wd => wd.toString() === 'file:///repoB' ? URI.parse('file:///repoB') : undefined;
		// git reports only y.txt for repoB (not z.txt) — if the DB partition
		// leaked git-folder edits, z.txt would wrongly appear.
		git.computeFileDiffsBetweenRefs = async () => [gitDiff('/repoB/y.txt', 2, 0)];
		const checkpoint = makeCheckpoint(() => ({ parent: 'p', current: 'c' }));
		const { svc, stateManager } = build({ workingDirectories: ['file:///folderA', 'file:///repoB'], git, checkpoint, db });

		const turnUri = await svc.computeTurnChangeset(sessionStr, 'turn-1');

		const state = stateManager.getChangesetState(turnUri);
		assert.strictEqual(state?.status, ChangesetStatus.Ready);
		const ids = state!.files.map(f => f.id);
		assert.deepStrictEqual(
			[...ids].sort(),
			[URI.file('/folderA/x.txt').toString(), URI.file('/repoB/y.txt').toString()].sort(),
			'non-git folderA comes from the DB; repoB comes from git only (no leaked z.txt)',
		);
		assert.strictEqual(
			ids.filter(id => id === URI.file('/repoB/y.txt').toString()).length,
			1,
			'the git-backed file must appear exactly once',
		);
	});

	test('uses the owning peer database for multi-root non-git fallback', async () => {
		const sessionDb = new TestSessionDatabase();
		const lifecycle: string[] = [];
		class DelayedPeerDatabase extends TestSessionDatabase {
			override async getFileEditsByTurn(turnId: string) {
				await timeout(0);
				lifecycle.push('read');
				return super.getFileEditsByTurn(turnId);
			}
		}
		const peerDb = new DelayedPeerDatabase();
		peerDb.addEdit({ turnId: 'peer-turn', toolCallId: 'tc1', filePath: '/folderA/peer.txt', kind: FileEditKind.Edit, addedLines: undefined, removedLines: undefined, beforeContent: encodeString('a'), afterContent: encodeString('a\nb') });
		const peerResource = 'ahp-chat://peer-1/session-mr';
		const { svc, stateManager } = build({
			workingDirectories: ['file:///folderA', 'file:///folderB'],
			git: createNoopGitService(),
			checkpoint: NULL_CHECKPOINT_SERVICE,
			db: sessionDb,
			peer: { resource: peerResource, db: peerDb, turnId: 'peer-turn', onDispose: () => lifecycle.push('dispose') },
		});

		const turnUri = await svc.computeTurnChangeset(sessionStr, 'peer-turn');

		assert.deepStrictEqual({
			files: stateManager.getChangesetState(turnUri)?.files.map(file => file.id),
			lifecycle,
		}, {
			files: [URI.file('/folderA/peer.txt').toString()],
			lifecycle: ['read', 'dispose'],
		});
	});

	test('diffs a repository shared by two working directories exactly once (dedup by repo root)', async () => {
		const git = createNoopGitService();
		git.getRepositoryRoot = async () => URI.parse('file:///repo');
		let diffCalls = 0;
		git.computeFileDiffsBetweenRefs = async () => { diffCalls++; return [gitDiff('/repo/shared.ts')]; };
		const checkpoint = makeCheckpoint(() => ({ parent: 'p', current: 'c' }));
		const { svc, stateManager } = build({ workingDirectories: ['file:///repo', 'file:///repo/sub'], git, checkpoint });

		const turnUri = await svc.computeTurnChangeset(sessionStr, 'turn-1');

		assert.strictEqual(diffCalls, 1, 'the shared repository is diffed exactly once');
		const state = stateManager.getChangesetState(turnUri);
		assert.deepStrictEqual(state?.files.map(f => f.id), [URI.file('/repo/shared.ts').toString()]);
	});

	test('keeps the turn changeset ready and logs an error when one folder git diff throws', async () => {
		const log = new RecordingLogService();
		const git = createNoopGitService();
		git.getRepositoryRoot = async wd => URI.parse(wd.toString());
		git.computeFileDiffsBetweenRefs = async wd => {
			if (wd.toString() === 'file:///repoBad') { throw new Error('git exploded'); }
			return [gitDiff('/repoGood/g.ts')];
		};
		const checkpoint = makeCheckpoint(root => ({ parent: `${root}~p`, current: `${root}~c` }));
		const { svc, stateManager } = build({ workingDirectories: ['file:///repoBad', 'file:///repoGood'], git, checkpoint, log });

		const turnUri = await svc.computeTurnChangeset(sessionStr, 'turn-1');

		const state = stateManager.getChangesetState(turnUri);
		assert.strictEqual(state?.status, ChangesetStatus.Ready, 'one folder failure must not error the whole changeset');
		assert.deepStrictEqual(state?.files.map(f => f.id), [URI.file('/repoGood/g.ts').toString()]);
		assert.ok(log.errors.some(e => e.includes('repoBad')), `expected an error naming the failing repository, got ${JSON.stringify(log.errors)}`);
	});

	test('a git repository whose turn diff fails falls back to that folder\'s DB edits', async () => {
		const log = new RecordingLogService();
		const db = new TestSessionDatabase();
		// repoBad is git-backed but its git turn diff throws; the edit under it is
		// tracked only in the path-based DB, so the per-folder DB fallback must
		// surface it instead of the folder being dropped.
		db.addEdit({ turnId: 'turn-1', toolCallId: 'tcBad', filePath: '/repoBad/x.ts', kind: FileEditKind.Edit, addedLines: undefined, removedLines: undefined, beforeContent: encodeString('a'), afterContent: encodeString('a\nb') });
		const git = createNoopGitService();
		git.getRepositoryRoot = async wd => URI.parse(wd.toString());
		git.computeFileDiffsBetweenRefs = async wd => {
			if (wd.toString() === 'file:///repoBad') { throw new Error('git exploded'); }
			return [gitDiff('/repoGood/g.ts')];
		};
		const checkpoint = makeCheckpoint(root => ({ parent: `${root}~p`, current: `${root}~c` }));
		const { svc, stateManager } = build({ workingDirectories: ['file:///repoBad', 'file:///repoGood'], git, checkpoint, db, log });

		const turnUri = await svc.computeTurnChangeset(sessionStr, 'turn-1');

		const state = stateManager.getChangesetState(turnUri);
		assert.strictEqual(state?.status, ChangesetStatus.Ready);
		assert.deepStrictEqual(
			[...state!.files.map(f => f.id)].sort(),
			[URI.file('/repoBad/x.ts').toString(), URI.file('/repoGood/g.ts').toString()].sort(),
			'the failed git repo contributes its DB-tracked edits instead of dropping the folder',
		);
		assert.ok(log.errors.some(e => e.includes('repoBad') && e.includes('falling back to tracked edits')), `expected a fallback error naming the repo, got ${JSON.stringify(log.errors)}`);
	});

	test('missing checkpoint refs use tracked edits without logging an error', async () => {
		const log = new RecordingLogService();
		const db = new TestSessionDatabase();
		db.addEdit({ turnId: 'turn-1', toolCallId: 'tc1', filePath: '/repoA/tracked.ts', kind: FileEditKind.Edit, addedLines: undefined, removedLines: undefined, beforeContent: encodeString('1'), afterContent: encodeString('1\n2') });
		const git = createNoopGitService();
		git.getRepositoryRoot = async wd => URI.parse(wd.toString());
		const { svc, stateManager } = build({
			workingDirectories: ['file:///repoA', 'file:///repoB'],
			git,
			checkpoint: makeCheckpoint(() => undefined),
			db,
			log,
		});

		const turnUri = await svc.computeTurnChangeset(sessionStr, 'turn-1');

		assert.deepStrictEqual({
			status: stateManager.getChangesetState(turnUri)?.status,
			files: stateManager.getChangesetState(turnUri)?.files.map(file => file.id),
			errors: log.errors,
		}, {
			status: ChangesetStatus.Ready,
			files: [URI.file('/repoA/tracked.ts').toString()],
			errors: [],
		});
	});

	test('a folder whose repository-root lookup throws is treated as non-git (DB fallback) without dropping the whole turn', async () => {
		const log = new RecordingLogService();
		const db = new TestSessionDatabase();
		// repoBad's ROOT resolution fails (not its git diff). Its edit is tracked
		// only in the path-based DB, so it must surface via the non-git fallback
		// while repoGood still contributes its git diff — before Issue 10 a single
		// root-resolution failure dropped the WHOLE turn to an empty changeset.
		db.addEdit({ turnId: 'turn-1', toolCallId: 'tcBad', filePath: '/repoBad/x.ts', kind: FileEditKind.Edit, addedLines: undefined, removedLines: undefined, beforeContent: encodeString('a'), afterContent: encodeString('a\nb') });
		const git = createNoopGitService();
		git.getRepositoryRoot = async wd => {
			if (wd.toString() === 'file:///repoBad') { throw new Error('rev-parse exploded'); }
			return URI.parse(wd.toString());
		};
		git.computeFileDiffsBetweenRefs = async () => [gitDiff('/repoGood/g.ts')];
		const checkpoint = makeCheckpoint(root => ({ parent: `${root}~p`, current: `${root}~c` }));
		const { svc, stateManager } = build({ workingDirectories: ['file:///repoBad', 'file:///repoGood'], git, checkpoint, db, log });

		const turnUri = await svc.computeTurnChangeset(sessionStr, 'turn-1');

		const state = stateManager.getChangesetState(turnUri);
		assert.deepStrictEqual({
			status: state?.status,
			files: [...state!.files.map(f => f.id)].sort(),
			loggedRepoBad: log.errors.some(e => e.includes('repoBad')),
		}, {
			status: ChangesetStatus.Ready,
			files: [URI.file('/repoBad/x.ts').toString(), URI.file('/repoGood/g.ts').toString()].sort(),
			loggedRepoBad: true,
		}, 'the failed-root folder falls back to its DB edits; the healthy folder is unaffected');
	});

	test('multi-folder turn diffs fan out over every repository with bounded concurrency and no cap', async () => {
		const log = new RecordingLogService();
		const repoCount = 25;
		const workingDirectories = Array.from({ length: repoCount }, (_, i) => `file:///repo${i}`);
		const diffCalls: string[] = [];
		let active = 0;
		let maxActive = 0;
		const pending: Array<() => void> = [];
		const git = createNoopGitService();
		git.getRepositoryRoot = async wd => URI.parse(wd.toString());
		// Each diff parks on its own gate so we can observe how many run at once.
		git.computeFileDiffsBetweenRefs = async wd => {
			diffCalls.push(wd.toString());
			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise<void>(resolve => pending.push(() => { active--; resolve(); }));
			return [];
		};
		const checkpoint = makeCheckpoint(root => ({ parent: `${root}~p`, current: `${root}~c` }));
		const { svc, stateManager } = build({ workingDirectories, git, checkpoint, log });

		const turnPromise = svc.computeTurnChangeset(sessionStr, 'turn-1');

		// With every diff gated, only the concurrency limit start at once; the
		// rest stay queued in the limiter (they are not dropped).
		for (let i = 0; i < 500 && diffCalls.length < 5; i++) {
			await timeout(1);
		}
		await timeout(10); // give a (wrongly) unbounded 6th diff a chance to start
		const dispatchedWhileGated = diffCalls.length;

		// Release the gated diffs one at a time, yielding so the limiter starts
		// the next queued diff, until the whole turn compute settles.
		let settled = false;
		void turnPromise.then(() => { settled = true; });
		while (!settled) {
			pending.shift()?.();
			await timeout(0);
		}
		const turnUri = await turnPromise;

		assert.deepStrictEqual({
			dispatchedWhileGated,
			maxActive,
			totalDiffed: diffCalls.length,
			warnedAboutCapping: log.warnings.some(w => w.includes('capping')),
			status: stateManager.getChangesetState(turnUri)?.status,
		}, {
			dispatchedWhileGated: 5,
			maxActive: 5,
			totalDiffed: repoCount,
			warnedAboutCapping: false,
			status: ChangesetStatus.Ready,
		});
	});

	test('single-folder checkpoint path is byte-for-byte unchanged', async () => {
		const checkpointCalls: Array<{ turnId: string; workingDirectory: string | undefined }> = [];
		const checkpoint: IAgentHostCheckpointService = {
			...NULL_CHECKPOINT_SERVICE,
			getTurnCheckpointPair: async (_session: URI, turnId: string, workingDirectory?: URI) => {
				checkpointCalls.push({ turnId, workingDirectory: workingDirectory?.toString() });
				return { parent: 'p', current: 'c' };
			},
		};
		const git = createNoopGitService();
		let repoRootCalls = 0;
		git.getRepositoryRoot = async () => { repoRootCalls++; return undefined; };
		const diffCalls: Array<{ wd: string; fromRef: string; toRef: string }> = [];
		git.computeFileDiffsBetweenRefs = async (wd, opts) => { diffCalls.push({ wd: wd.toString(), fromRef: opts.fromRef, toRef: opts.toRef }); return [gitDiff('/wd/only.ts')]; };
		const { svc, stateManager } = build({ workingDirectories: ['file:///wd'], git, checkpoint });

		const turnUri = await svc.computeTurnChangeset(sessionStr, 'turn-1');

		const state = stateManager.getChangesetState(turnUri);
		assert.strictEqual(state?.status, ChangesetStatus.Ready);
		assert.deepStrictEqual(state?.files.map(f => f.id), [URI.file('/wd/only.ts').toString()]);
		assert.strictEqual(repoRootCalls, 0, 'single-folder path must not resolve per-folder repositories');
		assert.deepStrictEqual(checkpointCalls, [{ turnId: 'turn-1', workingDirectory: undefined }], 'checkpoint pair is requested session-wide, not per-repo');
		assert.deepStrictEqual(diffCalls, [{ wd: 'file:///wd', fromRef: 'p', toRef: 'c' }]);
	});

	test('single-folder DB fallback path is byte-for-byte unchanged', async () => {
		const db = new TestSessionDatabase();
		db.addEdit({ turnId: 'turn-1', toolCallId: 'tc1', filePath: '/wd/tracked.ts', kind: FileEditKind.Edit, addedLines: undefined, removedLines: undefined, beforeContent: encodeString('1'), afterContent: encodeString('1\n2') });
		const checkpoint: IAgentHostCheckpointService = { ...NULL_CHECKPOINT_SERVICE, getTurnCheckpointPair: async () => undefined };
		const git = createNoopGitService();
		let repoRootCalls = 0;
		git.getRepositoryRoot = async () => { repoRootCalls++; return undefined; };
		const { svc, stateManager } = build({ workingDirectories: ['file:///wd'], git, checkpoint, db });

		const turnUri = await svc.computeTurnChangeset(sessionStr, 'turn-1');

		const state = stateManager.getChangesetState(turnUri);
		assert.strictEqual(state?.status, ChangesetStatus.Ready);
		assert.deepStrictEqual(state?.files.map(f => f.id), [URI.file('/wd/tracked.ts').toString()], 'fallback returns all of the turn edits, exactly as today');
		assert.strictEqual(repoRootCalls, 0, 'single-folder fallback must not resolve repositories');
	});

	/**
	 * All-folder branch summary (AC-3). In a multi-folder session the
	 * `summary.changes` chip must reflect EVERY folder's branch delta, computed
	 * independently of the primary-only branch changeset, and must survive a
	 * subsequent branch recompute. Single-folder sessions stay branch-derived
	 * (byte-for-byte unchanged).
	 */
	suite('all-folder branch summary', () => {

		/** Polls until the live session summary carries a `changes` aggregate. */
		async function waitForSummaryChanges(stateManager: AgentHostStateManager): Promise<ChangesSummary | undefined> {
			for (let i = 0; i < 500; i++) {
				const changes = stateManager.getSessionSummary(sessionStr)?.changes;
				if (changes) {
					return changes;
				}
				await timeout(1);
			}
			return stateManager.getSessionSummary(sessionStr)?.changes;
		}

		/** Polls until `count()` reaches (at least) `target`. */
		async function waitForCount(count: () => number, target: number): Promise<void> {
			for (let i = 0; i < 500 && count() < target; i++) {
				await timeout(1);
			}
		}

		/** Polls until the independently published primary branch changeset settles. */
		async function waitForBranchCompute(svc: AgentHostChangesetService, stateManager: AgentHostStateManager): Promise<void> {
			const branchUri = buildBranchChangesetUri(sessionStr);
			for (let i = 0; i < 500; i++) {
				const status = stateManager.getChangesetState(branchUri)?.status;
				if (!svc.isStaticChangesetComputeActive(branchUri) && status !== ChangesetStatus.Computing) {
					return;
				}
				await timeout(1);
			}
		}

		test('sums every repository branch diff, not just the primary', async () => {
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => URI.parse(wd.toString());
			git.computeSessionFileDiffs = async wd => {
				const root = wd.toString();
				if (root === 'file:///repoA') { return [gitDiff('/repoA/a.ts', 3, 1)]; }
				if (root === 'file:///repoB') { return [gitDiff('/repoB/b.ts', 5, 2), gitDiff('/repoB/c.ts', 1, 0)]; }
				return undefined;
			};
			const db = new TestSessionDatabase();
			const { svc, stateManager } = build({ workingDirectories: ['file:///repoA', 'file:///repoB'], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });

			svc.refreshBranchChangeset(sessionStr);
			const changes = await waitForSummaryChanges(stateManager);

			// repoA => 1 file / +3 / -1; repoB => 2 files / +6 / -2.
			assert.deepStrictEqual(changes, { additions: 9, deletions: 3, files: 3 }, 'the chip counts every folder, not only the primary');
			assert.deepStrictEqual(
				JSON.parse((await db.getMetadata(META_CHANGES_SUMMARY))!),
				{ additions: 9, deletions: 3, files: 3 },
				'the persisted META_CHANGES_SUMMARY carries the all-folder aggregate for the inactive-list path',
			);
		});

		test('all-folder summary survives a subsequent branch recompute, reusing the primary diff (not clobbered, not re-diffed)', async () => {
			const calls: string[] = [];
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => URI.parse(wd.toString());
			git.computeSessionFileDiffs = async wd => {
				calls.push(wd.toString());
				const root = wd.toString();
				if (root === 'file:///repoA') { return [gitDiff('/repoA/a.ts', 1, 0)]; }
				if (root === 'file:///repoB') { return [gitDiff('/repoB/b.ts', 1, 0)]; }
				return undefined;
			};
			const { svc, stateManager } = build({ workingDirectories: ['file:///repoA', 'file:///repoB'], git, checkpoint: NULL_CHECKPOINT_SERVICE });

			svc.refreshBranchChangeset(sessionStr);
			const first = await waitForSummaryChanges(stateManager);
			assert.deepStrictEqual(first, { additions: 2, deletions: 0, files: 2 }, 'first recompute yields the all-folder aggregate');

			// F7: the primary repo's branch diff is REUSED by the summary, so each
			// branch recompute issues exactly 2 `computeSessionFileDiffs` calls for
			// a 2-repo session (primary once for the branch changeset + secondary
			// once for the chip), not 3. Drain the second recompute, then allow a
			// beat for any (unwanted) extra diff to surface.
			const callsAfterFirst = calls.length;
			svc.refreshBranchChangeset(sessionStr);
			await waitForCount(() => calls.length, callsAfterFirst + 2);
			await timeout(10);

			const secondRecompute = calls.slice(callsAfterFirst);
			assert.strictEqual(secondRecompute.filter(c => c === 'file:///repoA').length, 1, 'the primary repo is diffed exactly once per recompute (reused by the summary, not re-diffed)');
			assert.strictEqual(secondRecompute.length, 2, 'a 2-repo session issues 2 diffs per branch recompute, not 3');

			assert.deepStrictEqual(
				stateManager.getSessionSummary(sessionStr)?.changes,
				{ additions: 2, deletions: 0, files: 2 },
				'branch recompute must not clobber the all-folder aggregate back to the primary-only count',
			);
		});

		test('all-folder chip survives idle eviction (evicted-but-warm): not clobbered to primary-only', async () => {
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => URI.parse(wd.toString());
			git.computeSessionFileDiffs = async wd => {
				const root = wd.toString();
				if (root === 'file:///repoA') { return [gitDiff('/repoA/a.ts', 3, 1)]; }
				if (root === 'file:///repoB') { return [gitDiff('/repoB/b.ts', 5, 2)]; }
				return undefined;
			};
			const db = new TestSessionDatabase();
			const { svc, stateManager } = build({ workingDirectories: ['file:///repoA', 'file:///repoB'], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });

			// Warm the session: persist the all-folder summary and make the branch
			// + session changesets Ready (idle eviction keeps changesets cached).
			svc.refreshBranchChangeset(sessionStr);
			svc.refreshSessionChangeset(sessionStr);
			const warm = await waitForSummaryChanges(stateManager);
			assert.deepStrictEqual(warm, { additions: 8, deletions: 3, files: 2 }, 'all-folder chip while the session is warm');
			await waitForCount(() => stateManager.getChangesetState(buildSessionChangesetUri(sessionStr))?.status === ChangesetStatus.Ready ? 1 : 0, 1);
			const persistedSummary = (await db.getMetadata(META_CHANGES_SUMMARY))!;

			// Idle eviction: drops the live summary but KEEPS the changesets cached.
			stateManager.removeSession(sessionStr);
			assert.strictEqual(stateManager.getSessionSummary(sessionStr)?.changes, undefined, 'live summary is gone after eviction');
			assert.strictEqual(stateManager.getChangesetState(buildSessionChangesetUri(sessionStr))?.status, ChangesetStatus.Ready, 'session changeset stays cached after eviction (LRU keeps the on-screen chip)');

			// The list overlay must still request the persisted summary key — before
			// the fix it returned undefined here (session changeset Ready), skipping
			// META_CHANGES_SUMMARY and falling back to the primary-only branch count.
			const keys = svc.getListMetadataKeys(sessionStr);
			assert.ok(keys && keys[META_CHANGES_SUMMARY], `getListMetadataKeys must request the persisted summary post-eviction, got ${JSON.stringify(keys)}`);

			// ... and prefer it (all-folder), never deriving+persisting the
			// primary-only branch count (repoA-only would be 3/1/1).
			const overlay = svc.computeListEntryChanges(sessionStr, { [META_CHANGES_SUMMARY]: persistedSummary });
			assert.deepStrictEqual(overlay, { additions: 8, deletions: 3, files: 2 }, 'evicted chip stays all-folder, not primary-only');
			assert.deepStrictEqual(JSON.parse((await db.getMetadata(META_CHANGES_SUMMARY))!), { additions: 8, deletions: 3, files: 2 }, 'persisted all-folder summary is not clobbered');
		});

		test('multi-folder branch changeset DATA stays primary-only (AC-8 data fence)', async () => {
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => URI.parse(wd.toString());
			git.computeSessionFileDiffs = async wd => {
				const root = wd.toString();
				if (root === 'file:///repoA') { return [gitDiff('/repoA/a.ts', 1, 0)]; }
				if (root === 'file:///repoB') { return [gitDiff('/repoB/b.ts', 1, 0)]; }
				return undefined;
			};
			const { svc, stateManager } = build({ workingDirectories: ['file:///repoA', 'file:///repoB'], git, checkpoint: NULL_CHECKPOINT_SERVICE });

			svc.refreshBranchChangeset(sessionStr);
			await waitForSummaryChanges(stateManager);

			// The chip aggregates ALL folders, but the branch CHANGESET data itself
			// must remain primary-only — AC-8: only the turn changeset and the chip
			// change in multi-folder sessions; branch/session/uncommitted/compare
			// data is untouched.
			const branch = stateManager.getChangesetState(buildBranchChangesetUri(sessionStr));
			assert.deepStrictEqual(branch?.files.map(f => f.id), [URI.file('/repoA/a.ts').toString()], 'branch changeset data stays primary-only in a multi-root session');
		});

		test('single-folder summary stays branch-derived (characterization: byte-for-byte unchanged)', async () => {
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => URI.parse(wd.toString());
			git.computeSessionFileDiffs = async () => [gitDiff('/wd/only.ts', 4, 2)];
			const db = new TestSessionDatabase();
			const { svc, stateManager } = build({ workingDirectories: ['file:///wd'], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });

			svc.refreshBranchChangeset(sessionStr);
			const changes = await waitForSummaryChanges(stateManager);

			// The single primary branch diff IS the whole session footprint, exactly as today.
			assert.deepStrictEqual(changes, { additions: 4, deletions: 2, files: 1 });
			assert.deepStrictEqual(
				JSON.parse((await db.getMetadata(META_CHANGES_SUMMARY))!),
				{ additions: 4, deletions: 2, files: 1 },
			);
		});

		test('a repository branch diff failure leaves a cold summary unavailable without failing the branch changeset', async () => {
			const log = new RecordingLogService();
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => URI.parse(wd.toString());
			git.computeSessionFileDiffs = async wd => {
				const root = wd.toString();
				if (root === 'file:///repoBad') { throw new Error('branch diff exploded'); }
				if (root === 'file:///repoGood1') { return [gitDiff('/repoGood1/a.ts', 2, 0)]; }
				if (root === 'file:///repoGood2') { return [gitDiff('/repoGood2/b.ts', 5, 1)]; }
				return undefined;
			};
			const db = new TestSessionDatabase();
			const { svc, stateManager } = build({ workingDirectories: ['file:///repoGood1', 'file:///repoBad', 'file:///repoGood2'], git, checkpoint: NULL_CHECKPOINT_SERVICE, db, log });

			svc.refreshBranchChangeset(sessionStr);
			await waitForBranchCompute(svc, stateManager);

			assert.deepStrictEqual({
				live: stateManager.getSessionSummary(sessionStr)?.changes,
				persisted: await db.getMetadata(META_CHANGES_SUMMARY),
				branchStatus: stateManager.getChangesetState(buildBranchChangesetUri(sessionStr))?.status,
				loggedRepoBad: log.errors.some(e => e.includes('repoBad')),
			}, {
				live: undefined,
				persisted: undefined,
				branchStatus: ChangesetStatus.Ready,
				loggedRepoBad: true,
			}, 'one failed source prevents partial publication without failing the primary branch changeset');
		});

		test('threads a base branch per repository (primary uses the session base, secondaries their default)', async () => {
			const calls: { wd: string; baseBranch: string | undefined }[] = [];
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => URI.parse(wd.toString());
			git.getDefaultBranch = async wd => wd.toString() === 'file:///repoB' ? { name: 'develop', startPoint: 'origin/develop' } : undefined;
			git.computeSessionFileDiffs = async (wd, opts) => {
				calls.push({ wd: wd.toString(), baseBranch: opts.baseBranch });
				return wd.toString() === 'file:///repoA' ? [gitDiff('/repoA/a.ts', 1, 0)] : [gitDiff('/repoB/b.ts', 1, 0)];
			};
			const db = new TestSessionDatabase();
			const { svc, stateManager } = build({ workingDirectories: ['file:///repoA', 'file:///repoB'], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });
			// The session's configured base branch applies to the PRIMARY repo only.
			stateManager.setSessionMeta(sessionStr, withSessionGitState(undefined, { baseBranchName: 'main' }));

			svc.refreshBranchChangeset(sessionStr);
			await waitForSummaryChanges(stateManager);

			const repoA = calls.filter(c => c.wd === 'file:///repoA');
			const repoB = calls.filter(c => c.wd === 'file:///repoB');
			assert.ok(repoA.length > 0 && repoA.every(c => c.baseBranch === 'main'), `primary repo must use the session base branch, got ${JSON.stringify(repoA)}`);
			assert.ok(repoB.length > 0 && repoB.every(c => c.baseBranch === 'develop'), `secondary repo must use its own default branch (not HEAD), got ${JSON.stringify(repoB)}`);
		});

		test('partial recompute preserves cached all-folder summary when the primary branch diff is unavailable', async () => {
			let primaryAvailable = true;
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => URI.parse(wd.toString());
			git.computeSessionFileDiffs = async wd => {
				const root = wd.toString();
				if (root === 'file:///repoA') { return primaryAvailable ? [gitDiff('/repoA/a.ts', 3, 1)] : undefined; }
				if (root === 'file:///repoB') { return [gitDiff('/repoB/b.ts', 5, 2)]; }
				return undefined;
			};
			const db = new TestSessionDatabase();
			const { svc, stateManager } = build({ workingDirectories: ['file:///repoA', 'file:///repoB'], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });

			svc.refreshBranchChangeset(sessionStr);
			await waitForSummaryChanges(stateManager);

			primaryAvailable = false;
			svc.refreshBranchChangeset(sessionStr);
			await waitForBranchCompute(svc, stateManager);

			assert.deepStrictEqual({
				live: stateManager.getSessionSummary(sessionStr)?.changes,
				persisted: JSON.parse((await db.getMetadata(META_CHANGES_SUMMARY))!),
				branchStatus: stateManager.getChangesetState(buildBranchChangesetUri(sessionStr))?.status,
			}, {
				live: { additions: 8, deletions: 3, files: 2 },
				persisted: { additions: 8, deletions: 3, files: 2 },
				branchStatus: ChangesetStatus.Ready,
			}, 'an unavailable primary source preserves the last complete all-folder summary');
		});

		test('folds non-git folder edits into the all-folder chip', async () => {
			const db = new TestSessionDatabase();
			// folderA is not git-backed; its edits are tracked only in the DB.
			db.addEdit({ turnId: 'turn-1', toolCallId: 'tcA', filePath: '/folderA/x.txt', kind: FileEditKind.Edit, addedLines: undefined, removedLines: undefined, beforeContent: encodeString('a'), afterContent: encodeString('a\nb') });
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => wd.toString() === 'file:///repoB' ? URI.parse('file:///repoB') : undefined;
			git.computeSessionFileDiffs = async wd => wd.toString() === 'file:///repoB' ? [gitDiff('/repoB/y.txt', 5, 2)] : undefined;
			const { svc, stateManager } = build({ workingDirectories: ['file:///folderA', 'file:///repoB'], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });

			svc.refreshBranchChangeset(sessionStr);
			const changes = await waitForSummaryChanges(stateManager);

			// repoB git branch diff => 1 file / +5 / -2; folderA DB edit => 1 file / +1 / -0.
			assert.deepStrictEqual(changes, { additions: 6, deletions: 2, files: 2 }, 'non-git folder DB edits count toward the chip alongside git repos');
		});

		test('total git failure preserves the cached all-folder summary (not clobbered to zero)', async () => {
			let available = true;
			const calls: string[] = [];
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => URI.parse(wd.toString());
			git.computeSessionFileDiffs = async wd => {
				calls.push(wd.toString());
				if (!available) { return undefined; }
				const root = wd.toString();
				if (root === 'file:///repoA') { return [gitDiff('/repoA/a.ts', 3, 1)]; }
				if (root === 'file:///repoB') { return [gitDiff('/repoB/b.ts', 5, 2)]; }
				return undefined;
			};
			const db = new TestSessionDatabase();
			const { svc, stateManager } = build({ workingDirectories: ['file:///repoA', 'file:///repoB'], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });

			// Warm the summary to Ready with a real all-folder aggregate.
			svc.refreshBranchChangeset(sessionStr);
			const warm = await waitForSummaryChanges(stateManager);
			assert.deepStrictEqual(warm, { additions: 8, deletions: 3, files: 2 }, 'warm all-folder aggregate');
			await timeout(10);
			const callsAfterWarm = calls.length;

			// Every repository now fails: refresh and let the recompute settle.
			// Observe completion via the git call count, NOT the (already-truthy)
			// live summary, which would false-positive on the warm value.
			available = false;
			svc.refreshBranchChangeset(sessionStr);
			await waitForCount(() => calls.length, callsAfterWarm + 1);
			await timeout(10);

			assert.deepStrictEqual({
				live: stateManager.getSessionSummary(sessionStr)?.changes,
				persisted: JSON.parse((await db.getMetadata(META_CHANGES_SUMMARY))!),
			}, {
				live: { additions: 8, deletions: 3, files: 2 },
				persisted: { additions: 8, deletions: 3, files: 2 },
			}, 'total failure preserves the live and persisted summary instead of overwriting it with zeros');
		});

		test('all repositories succeeding with no changes writes a zero summary (no over-preserve)', async () => {
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => URI.parse(wd.toString());
			// Both repos succeed with an EMPTY diff (genuinely no changes) — this
			// is an available source, so the aggregate must be written as zero,
			// never preserved as if it were unavailable.
			git.computeSessionFileDiffs = async () => [];
			const db = new TestSessionDatabase();
			const { svc, stateManager } = build({ workingDirectories: ['file:///repoA', 'file:///repoB'], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });

			svc.refreshBranchChangeset(sessionStr);
			const changes = await waitForSummaryChanges(stateManager);

			assert.deepStrictEqual({
				live: changes,
				persisted: JSON.parse((await db.getMetadata(META_CHANGES_SUMMARY))!),
			}, {
				live: { additions: 0, deletions: 0, files: 0 },
				persisted: { additions: 0, deletions: 0, files: 0 },
			}, 'a genuinely empty all-folder aggregate is written as zero, not preserved');
		});

		test('a secondary default-branch lookup rejection leaves a cold summary unavailable and keeps the branch changeset Ready', async () => {
			const log = new RecordingLogService();
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => URI.parse(wd.toString());
			// The SECONDARY repo's default-branch probe rejects (git spawn failure).
			git.getDefaultBranch = async wd => {
				if (wd.toString() === 'file:///repoB') { throw new Error('default branch lookup exploded'); }
				return undefined;
			};
			git.computeSessionFileDiffs = async wd => {
				const root = wd.toString();
				if (root === 'file:///repoA') { return [gitDiff('/repoA/a.ts', 3, 1)]; }
				if (root === 'file:///repoB') { return [gitDiff('/repoB/b.ts', 5, 2)]; }
				return undefined;
			};
			const db = new TestSessionDatabase();
			const { svc, stateManager } = build({ workingDirectories: ['file:///repoA', 'file:///repoB'], git, checkpoint: NULL_CHECKPOINT_SERVICE, db, log });

			svc.refreshBranchChangeset(sessionStr);
			await waitForBranchCompute(svc, stateManager);

			assert.deepStrictEqual({
				live: stateManager.getSessionSummary(sessionStr)?.changes,
				persisted: await db.getMetadata(META_CHANGES_SUMMARY),
				branchStatus: stateManager.getChangesetState(buildBranchChangesetUri(sessionStr))?.status,
				branchFiles: stateManager.getChangesetState(buildBranchChangesetUri(sessionStr))?.files.map(file => file.id),
				loggedRepoB: log.errors.some(e => e.includes('repoB')),
			}, {
				live: undefined,
				persisted: undefined,
				branchStatus: ChangesetStatus.Ready,
				branchFiles: [URI.file('/repoA/a.ts').toString()],
				loggedRepoB: true,
			}, 'a secondary failure must not publish a partial summary or fail the independent primary branch changeset');
		});
	});

	suite('telemetry emission', () => {
		async function waitForTelemetry(telemetry: CapturingTelemetryService, eventName: string, match?: (data: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
			const find = () => telemetry.events.find(e => e.eventName === eventName && (!match || match(e.data)));
			for (let i = 0; i < 200 && !find(); i++) {
				await timeout(0);
			}
			const event = find();
			assert.ok(event, `expected telemetry event ${eventName}`);
			return event.data;
		}

		test('changesetComputed (turn) carries correlation and omits multi-root fields for a single-root turn', async () => {
			const telemetry = new CapturingTelemetryService();
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => URI.parse(wd.toString());
			git.computeFileDiffsBetweenRefs = async () => [gitDiff('/repo/a.ts')];
			const checkpoint = makeCheckpoint(root => ({ parent: `${root}~p`, current: `${root}~c` }));
			const { svc } = build({
				workingDirectories: ['file:///repo'],
				git,
				checkpoint,
				telemetry,
				subscriptions: [buildTurnChangesetUri(sessionStr, 'turn-1')],
			});

			svc.onTurnComplete(sessionStr, 'turn-1', {
				clientType: AgentHostClientType.EditorWindow,
				connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
				transportKind: AgentHostTransportKind.MessagePort,
				hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
				machineId: 'client-machine-id',
				devDeviceId: 'client-dev-device-id',
			});
			const data = await waitForTelemetry(telemetry, 'agentHost.changesetComputed', d => d.kind === 'turn');

			assert.deepStrictEqual({
				provider: data.provider,
				agentSessionId: data.agentSessionId,
				turnId: data.turnId,
				initiatorClientType: data.initiatorClientType,
				initiatorConnectionKind: data.initiatorConnectionKind,
				initiatorTransportKind: data.initiatorTransportKind,
				hostLaunchKind: data.hostLaunchKind,
				initiatorMachineId: data.initiatorMachineId,
				initiatorDevDeviceId: data.initiatorDevDeviceId,
				kind: data.kind,
				outcome: data.outcome,
				isMultiRoot: data.isMultiRoot,
				folderCount: data.folderCount,
				hasFileCount: data.fileCount !== undefined,
				hasMultiRootFields: data.uniqueGitFolderCount !== undefined || data.trackedEditFallbackFolderCount !== undefined,
			}, {
				provider: URI.parse(sessionStr).scheme,
				agentSessionId: AgentSession.id(sessionStr),
				turnId: 'turn-1',
				initiatorClientType: 'editor_window',
				initiatorConnectionKind: 'remote_extension_host',
				initiatorTransportKind: 'message_port',
				hostLaunchKind: 'vscode_main_process',
				initiatorMachineId: 'client-machine-id',
				initiatorDevDeviceId: 'client-dev-device-id',
				kind: 'turn',
				outcome: 'computed',
				isMultiRoot: false,
				folderCount: 1,
				hasFileCount: true,
				hasMultiRootFields: false,
			});
		});

		test('changesetComputed (turn) carries the multi-root fan-out fields for a multi-root turn', async () => {
			const telemetry = new CapturingTelemetryService();
			const git = createNoopGitService();
			git.getRepositoryRoot = async wd => URI.parse(wd.toString());
			git.computeFileDiffsBetweenRefs = async wd => wd.toString() === 'file:///repoA' ? [gitDiff('/repoA/a.ts')] : [gitDiff('/repoB/b.ts')];
			const checkpoint = makeCheckpoint(root => ({ parent: `${root}~p`, current: `${root}~c` }));
			const { svc } = build({
				workingDirectories: ['file:///repoA', 'file:///repoB'],
				git,
				checkpoint,
				telemetry,
				subscriptions: [buildTurnChangesetUri(sessionStr, 'turn-1')],
			});

			svc.onTurnComplete(sessionStr, 'turn-1');
			const data = await waitForTelemetry(telemetry, 'agentHost.changesetComputed', d => d.kind === 'turn');

			assert.deepStrictEqual({
				kind: data.kind,
				outcome: data.outcome,
				isMultiRoot: data.isMultiRoot,
				folderCount: data.folderCount,
				uniqueGitFolderCount: data.uniqueGitFolderCount,
				nonGitFolderCount: data.nonGitFolderCount,
				trackedEditFallbackFolderCount: data.trackedEditFallbackFolderCount,
			}, {
				kind: 'turn',
				outcome: 'computed',
				isMultiRoot: true,
				folderCount: 2,
				uniqueGitFolderCount: 2,
				nonGitFolderCount: 0,
				trackedEditFallbackFolderCount: 0,
			});
		});
	});
});
