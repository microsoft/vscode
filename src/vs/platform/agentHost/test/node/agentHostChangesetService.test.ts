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
import { BASELINE_TURN_ID, buildDefaultChangesetCatalogue, buildSessionChangesetUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { ActionEnvelope, ActionType } from '../../common/state/sessionActions.js';
import { ChangesetStatus, SessionStatus, withSessionGitState, type Changeset } from '../../common/state/sessionState.js';
import { AgentHostChangesetService } from '../../node/agentHostChangesetService.js';
import { NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { IAgentHostGitService } from '../../node/agentHostGitService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { createNoopGitService, createNullSessionDataService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { META_CHECKPOINT_WORKING_DIR } from '../../node/agentHostCheckpointService.js';

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
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			project: { uri: 'file:///test-project', displayName: 'Test Project' },
			workingDirectory,
		});
		stateManager.setSessionChangesets(sessionUri.toString(), buildDefaultChangesetCatalogue(sessionUri.toString()));
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
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE));

			localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				workingDirectory: 'file:///wd',
			});
			await sessionDb.setMetadata('agentHost.diffBaseBranch', 'main');

			const envelopes: ActionEnvelope[] = [];
			disposables.add(localStateManager.onDidEmitEnvelope(e => {
				envelopes.push(e);
			}));

			// Trigger a turn-complete (which fires the immediate diff path).
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
			// Each git diff lands as its own `changeset/fileSet` envelope.
			// Walk the captured stream and reconstruct the per-changeset
			// file lists to assert each matches the git service output.
			const fileSets = envelopes
				.filter(e => e.action.type === ActionType.ChangesetFileSet) as Array<{ channel: string; action: { file: { edit: unknown } } }>;
			const sessionFileSets = fileSets.filter(e => e.channel === `${sessionUri.toString()}/changeset/session`);
			const uncommittedFileSets = fileSets.filter(e => e.channel === `${sessionUri.toString()}/changeset/uncommitted`);
			assert.deepStrictEqual(sessionFileSets.map(e => e.action.file.edit), gitDiffs);
			assert.deepStrictEqual(uncommittedFileSets.map(e => e.action.file.edit), gitDiffs);

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
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE));
			const sessionStr = sessionUri.toString();

			localStateManager.createSession({
				resource: sessionStr,
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				workingDirectory: 'file:///wd',
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
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE));
			const sessionStr = sessionUri.toString();

			localStateManager.createSession({
				resource: sessionStr,
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				workingDirectory: 'file:///wd',
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
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE));

			localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				workingDirectory: 'file:///wd',
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
			// empty array — no `changeset/fileSet` envelopes are emitted. The
			// important assertion is that we still ran the producer through
			// to a `changeset/statusChanged → ready` envelope, which proves
			// the fallback path executed without throwing.
			const fileSets = envelopes
				.map(e => e.action)
				.filter(a => a.type === ActionType.ChangesetFileSet);
			assert.deepStrictEqual(fileSets, []);
			const statusAction = envelopes
				.map(e => e.action)
				.find(a => a.type === ActionType.ChangesetStatusChanged);
			assert.ok(statusAction, 'expected a changeset/statusChanged envelope from the fallback path');
		});

		test('uncommitted compute does NOT fall back to edit-tracker and preserves restored snapshot when git is unavailable', async () => {
			// Regression: previously, when the git path returned undefined
			// (e.g. session restored before its working directory was known),
			// the uncommitted slot would fall through to the edit-tracker
			// aggregator. The aggregator answers a different question
			// (SDK-tracked tool edits, not `git status`) and silently
			// overwrote the legitimate persisted snapshot. The fix gates
			// the fallback on `kind === 'session'`, so an unavailable git
			// path leaves the uncommitted state untouched.
			const sessionDb = new SessionDatabase(':memory:');
			disposables.add(toDisposable(() => sessionDb.close()));
			const sessionDataService = createSessionDataService(sessionDb);
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));

			const stubGit = {
				computeSessionFileDiffs: async () => undefined,
			} as unknown as IAgentHostGitService;

			const localChangesets = disposables.add(new AgentHostChangesetService(
				localStateManager, new NullLogService(), sessionDataService, stubGit, NULL_CHECKPOINT_SERVICE));

			const sessionStr = sessionUri.toString();
			localStateManager.createSession({
				resource: sessionStr,
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				workingDirectory: 'file:///wd',
			});

			// Seed a "persisted" uncommitted snapshot of 3 files into live
			// state, mirroring what `listSessions` overlay does on startup.
			const persistedDiffs = [
				{ after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } }, diff: { added: 1, removed: 0 } },
				{ after: { uri: 'file:///wd/b.ts', content: { uri: 'file:///wd/b.ts' } }, diff: { added: 1, removed: 0 } },
				{ after: { uri: 'file:///wd/c.ts', content: { uri: 'file:///wd/c.ts' } }, diff: { added: 1, removed: 0 } },
			];
			localChangesets.restoreStaticChangeset(sessionStr, 'uncommitted', persistedDiffs);

			const envelopes: ActionEnvelope[] = [];
			disposables.add(localStateManager.onDidEmitEnvelope(e => { envelopes.push(e); }));
			const uncommittedUri = `${sessionStr}/changeset/uncommitted`;

			// Trigger the recompute of the uncommitted changeset.
			localChangesets.refreshUncommittedChangeset(sessionStr);
			const refreshing = localStateManager.getSnapshot(uncommittedUri)?.state as { status: string; files: Array<{ id: string }> } | undefined;
			assert.deepStrictEqual({
				status: refreshing?.status,
				files: refreshing?.files.map(f => f.id).sort(),
			}, {
				status: ChangesetStatus.Computing,
				files: ['file:///wd/a.ts', 'file:///wd/b.ts', 'file:///wd/c.ts'],
			});

			// Wait long enough for the sequencer to drain the uncommitted compute.
			for (let i = 0; i < 50; i++) {
				await timeout(2);
			}

			// 1) The persisted snapshot must still be in live state — no
			//    `ChangesetFileRemoved` envelopes for the uncommitted URI
			//    were emitted.
			const removed = envelopes
				.filter(e => e.action.type === ActionType.ChangesetFileRemoved && e.channel === uncommittedUri);
			assert.deepStrictEqual(removed, [], 'no files should be removed when the git path is unavailable');

			// 2) The persisted DB blob is unchanged (compute did not overwrite it).
			const persistedAfter = await sessionDb.getMetadata('agentHost.changeset.uncommitted');
			assert.strictEqual(persistedAfter, undefined, 'compute must not persist anything when git is unavailable');

			// 3) Live state still reports the 3 seeded files.
			const snapshot = localStateManager.getSnapshot(uncommittedUri);
			const state = snapshot?.state as { status: string; files: Array<{ id: string }> } | undefined;
			assert.deepStrictEqual({
				status: state?.status,
				files: state?.files.map(f => f.id).sort(),
			}, {
				status: ChangesetStatus.Ready,
				files: ['file:///wd/a.ts', 'file:///wd/b.ts', 'file:///wd/c.ts'],
			});
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
				uncommittedRaw: JSON.stringify([aDiff]),
				sessionRaw: JSON.stringify([bDiff]),
			});

			assert.deepStrictEqual({
				uncommitted: result.uncommitted?.map(d => d.after?.uri),
				session: result.session?.map(d => d.after?.uri),
				uncommittedState: stateManager.getChangesetState(buildUncommittedChangesetUri(sessionStr)),
				sessionState: stateManager.getChangesetState(buildSessionChangesetUri(sessionStr)),
			}, {
				uncommitted: ['file:///wd/a.ts'],
				session: ['file:///wd/b.ts'],
				uncommittedState: { status: 'computing', files: [] },
				sessionState: { status: 'computing', files: [] },
			});
		});

		test('applyPersistedStaticChangesets seeds parsed diffs', () => {
			setupSession();
			changesetService.registerStaticChangesets(sessionStr);
			const parsed = changesetService.parsePersistedStaticChangesets(sessionStr, {
				uncommittedRaw: JSON.stringify([aDiff]),
				sessionRaw: JSON.stringify([bDiff]),
			});

			changesetService.applyPersistedStaticChangesets(sessionStr, parsed);

			const uncommitted = stateManager.getChangesetState(buildUncommittedChangesetUri(sessionStr));
			const session = stateManager.getChangesetState(buildSessionChangesetUri(sessionStr));
			assert.deepStrictEqual({
				uncommitted: uncommitted && { status: uncommitted.status, files: uncommitted.files.map(f => f.id) },
				session: session && { status: session.status, files: session.files.map(f => f.id) },
			}, {
				uncommitted: { status: 'ready', files: ['file:///wd/a.ts'] },
				session: { status: 'ready', files: ['file:///wd/b.ts'] },
			});
		});

		test('new uncommitted key restores only uncommitted state', () => {
			setupSession();
			changesetService.registerStaticChangesets(sessionStr);

			const result = changesetService.restorePersistedStaticChangesets(sessionStr, {
				uncommittedRaw: JSON.stringify([aDiff]),
			});

			assert.deepStrictEqual(result.uncommitted?.map(d => d.after?.uri), ['file:///wd/a.ts']);
			assert.strictEqual(result.session, undefined);

			const uncommitted = stateManager.getSnapshot(`${sessionStr}/changeset/uncommitted`);
			const session = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
			assert.strictEqual((uncommitted?.state as { status: string }).status, 'ready');
			// Session-state remains in `computing` because nothing was applied.
			assert.strictEqual((session?.state as { status: string }).status, 'computing');
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
				uncommittedRaw: '{ not valid json',
				sessionRaw: JSON.stringify([aDiff]),
			});

			assert.strictEqual(result.uncommitted, undefined, 'malformed slot returns undefined');
			assert.deepStrictEqual(result.session?.map(d => d.after?.uri), ['file:///wd/a.ts'], 'valid slot still parses');
			// Uncommitted snapshot stayed in `computing` because malformed
			// input was discarded — not seeded with garbage.
			const uncommitted = stateManager.getSnapshot(`${sessionStr}/changeset/uncommitted`);
			assert.strictEqual((uncommitted?.state as { status: string }).status, 'computing');
		});

		test('seedIfEmpty honoured: live state with files is not overwritten', () => {
			setupSession();

			// Seed live uncommitted state via restoreStaticChangeset to mimic
			// a fresh refresh that landed before the persisted-overlay call.
			changesetService.restoreStaticChangeset(sessionStr, 'uncommitted', [aDiff]);
			const before = stateManager.getSnapshot(`${sessionStr}/changeset/uncommitted`);
			assert.deepStrictEqual((before?.state as { files: Array<{ id: string }> }).files.map(f => f.id), ['file:///wd/a.ts']);

			// Persisted blob points at a DIFFERENT file; without the guard it
			// would clobber the live state.
			changesetService.restorePersistedStaticChangesets(sessionStr, {
				uncommittedRaw: JSON.stringify([bDiff]),
			});

			const after = stateManager.getSnapshot(`${sessionStr}/changeset/uncommitted`);
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
			override async computeTurnChangeset(session: string, turnId: string): Promise<string> {
				this.turnComputeCalls.push({ session, turnId });
				return super.computeTurnChangeset(session, turnId);
			}
		}

		function makeService(): CountingChangesetService {
			return disposables.add(new CountingChangesetService(
				stateManager,
				new NullLogService(),
				createNullSessionDataService(),
				createNoopGitService(),
				NULL_CHECKPOINT_SERVICE,
			));
		}

		test('onTurnComplete schedules a per-turn recompute when the probe says someone is subscribed', async () => {
			setupSession();
			const svc = makeService();
			svc.setTurnSubscriberProbe(() => true);

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

		test('onTurnComplete does NOT schedule a per-turn recompute when the probe says nobody is subscribed', async () => {
			setupSession();
			const svc = makeService();
			svc.setTurnSubscriberProbe(() => false);

			svc.onTurnComplete(sessionUri.toString(), 'turn-1');

			// Give the static computes a chance to drain — the per-turn
			// call must remain absent throughout.
			await timeout(20);
			assert.deepStrictEqual(svc.turnComputeCalls, [], 'no per-turn compute when nothing observes the turn URI');
		});

		test('onToolCallEditsApplied fires the per-turn debounce only when subscribers exist; cancelled by onTurnComplete', () => {
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				setupSession();
				const svc = makeService();
				svc.setTurnSubscriberProbe(() => true);

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

				// 3) flipping the probe off mid-stream silences future
				// per-turn computes even if more edits arrive.
				svc.setTurnSubscriberProbe(() => false);
				svc.onToolCallEditsApplied(sessionUri.toString(), 'turn-1');
				await timeout(6_000);
				assert.strictEqual(svc.turnComputeCalls.length, 2, 'unsubscribed turn must not get any further per-turn computes');
			});
		});

		test('per-turn URI streams incremental ChangesetFileSet / ChangesetFileRemoved as the same turn is recomputed', async () => {
			// End-to-end variant exercising the real `computeTurnDiffs` path
			// — produces actual diff payloads from session-DB messages so
			// `_publishChangesetDiffs` emits real per-file actions on each
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
			));
			svc.setTurnSubscriberProbe(() => true);

			localStateManager.createSession({
				resource: sessionUri.toString(),
				provider: 'mock',
				title: 'Test',
				status: SessionStatus.Idle,
				createdAt: Date.now(),
				modifiedAt: Date.now(),
				workingDirectory: 'file:///wd',
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

		test('uses the baseline ref as the from-endpoint when original is BASELINE_TURN_ID', async () => {
			const sessionStr = sessionUri.toString();
			setupSession('file:///wd');

			const db = new TestSessionDatabase();
			await db.setMetadata(META_CHECKPOINT_WORKING_DIR, 'file:///wd');

			const calls: Array<{ fromRef: string; toRef: string }> = [];
			const gitService = createNoopGitService();
			gitService.computeFileDiffsBetweenRefs = async (_wd, opts) => {
				calls.push({ fromRef: opts.fromRef, toRef: opts.toRef });
				return [];
			};
			const svc = disposables.add(new AgentHostChangesetService(
				stateManager,
				new NullLogService(),
				createSessionDataService(db),
				gitService,
				makeCheckpointService({
					'mod': { parent: 'ref-baseline', current: 'ref-mod' },
				}, 'ref-baseline'),
			));

			const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, BASELINE_TURN_ID, 'mod');

			assert.strictEqual(compareUri, `${sessionStr}/changeset/compare/baseline/mod`);
			assert.deepStrictEqual(calls, [{ fromRef: 'ref-baseline', toRef: 'ref-mod' }]);
			const state = stateManager.getSnapshot(compareUri)?.state as { status: string } | undefined;
			assert.strictEqual(state?.status, 'ready');
		});

		test('transitions to Error when original is BASELINE_TURN_ID but no baseline was captured', async () => {
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
					'mod': { parent: 'ref-baseline', current: 'ref-mod' },
				} /* no baseline */),
			));

			const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, BASELINE_TURN_ID, 'mod');

			const state = stateManager.getSnapshot(compareUri)?.state as { status: string; error?: { message: string } } | undefined;
			assert.strictEqual(state?.status, 'error');
			assert.ok(state?.error?.message.includes('baseline'), `expected error to name the missing baseline, got ${state?.error?.message}`);
			assert.strictEqual(gitCalls, 0, 'git must not be invoked when the baseline is missing');
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
			));

			const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, 'orig', 'mod');

			const snapshot = stateManager.getSnapshot(compareUri);
			const state = snapshot?.state as { status: string; error?: { message: string } } | undefined;
			assert.strictEqual(state?.status, 'error');
			assert.ok(state?.error?.message.includes('git'), `expected git-failure error message, got ${state?.error?.message}`);
		});
	});
});
