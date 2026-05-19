/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agentService.js';
import { buildDefaultChangesetCatalogue } from '../../common/changesetUri.js';
import { ActionEnvelope, ActionType } from '../../common/state/sessionActions.js';
import { SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostChangesetService } from '../../node/agentHostChangesetService.js';
import { IAgentHostGitService } from '../../node/agentHostGitService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { createNoopGitService, createNullSessionDataService, createSessionDataService } from '../common/sessionTestHelpers.js';

suite('AgentHostChangesetService', () => {

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
			changesets: buildDefaultChangesetCatalogue(sessionUri.toString()),
		});
		stateManager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri.toString() });
	}

	setup(() => {
		stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		changesetService = disposables.add(new AgentHostChangesetService(
			stateManager,
			new NullLogService(),
			createNullSessionDataService(),
			createNoopGitService(),
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
		assert.deepStrictEqual(stateManager.getSessionState(sessionStr)?.summary.changesets, [
			{ label: 'Uncommitted Changes', uriTemplate: `${sessionStr}/changeset/uncommitted` },
			{ label: 'Session Changes', uriTemplate: `${sessionStr}/changeset/session` },
			{ label: 'This Turn', uriTemplate: `${sessionStr}/changeset/turn/{turnId}` },
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
		assert.deepStrictEqual(stateManager.getSessionState(sessionStr)?.summary.changesets, [
			{ label: 'Uncommitted Changes', uriTemplate: `${sessionStr}/changeset/uncommitted` },
			{ label: 'Session Changes', uriTemplate: `${sessionStr}/changeset/session` },
			{ label: 'This Turn', uriTemplate: `${sessionStr}/changeset/turn/{turnId}` },
		]);
	});

	test('registerStaticChangesets is idempotent across repeated calls', () => {
		const sessionStr = sessionUri.toString();
		setupSession();

		changesetService.registerStaticChangesets(sessionStr);
		changesetService.registerStaticChangesets(sessionStr);
		changesetService.registerStaticChangesets(sessionStr);

		const changesets = stateManager.getSessionState(sessionStr)?.summary.changesets;
		assert.strictEqual(changesets?.length, 3, 'expected the three default catalogue entries');
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

		const catalogue = stateManager.getSessionState(sessionStr)?.summary.changesets;
		assert.deepStrictEqual(catalogue, [
			{
				label: 'Uncommitted Changes',
				uriTemplate: `${sessionStr}/changeset/uncommitted`,
			},
			{
				label: 'Session Changes',
				uriTemplate: changesetUri,
				additions: 6,
				deletions: 2,
				files: 2,
			},
			{
				label: 'This Turn',
				uriTemplate: `${sessionStr}/changeset/turn/{turnId}`,
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
		const catalogue = stateManager.getSessionState(sessionStr)?.summary.changesets;
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
					label: 'Uncommitted Changes',
					uriTemplate: `${sessionStr}/changeset/uncommitted`,
				},
				{
					label: 'Session Changes',
					uriTemplate: changesetUri,
					additions: 4,
					deletions: 1,
					files: 2,
				},
				{
					label: 'This Turn',
					uriTemplate: `${sessionStr}/changeset/turn/{turnId}`,
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
				localStateManager, new NullLogService(), sessionDataService, stubGit));

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
				.map(e => e.action)
				.filter(a => a.type === ActionType.ChangesetFileSet) as Array<{ changeset: string; file: { edit: unknown } }>;
			const sessionFileSets = fileSets.filter(a => a.changeset === `${sessionUri.toString()}/changeset/session`);
			const uncommittedFileSets = fileSets.filter(a => a.changeset === `${sessionUri.toString()}/changeset/uncommitted`);
			assert.deepStrictEqual(sessionFileSets.map(a => a.file.edit), gitDiffs);
			assert.deepStrictEqual(uncommittedFileSets.map(a => a.file.edit), gitDiffs);

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

		test('falls back to the edit-tracker aggregator when the git service returns undefined', async () => {
			const sessionDb = new SessionDatabase(':memory:');
			disposables.add(toDisposable(() => sessionDb.close()));
			const sessionDataService = createSessionDataService(sessionDb);
			const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));

			const stubGit = {
				computeSessionFileDiffs: async () => undefined,
			} as unknown as IAgentHostGitService;

			const localChangesets = disposables.add(new AgentHostChangesetService(
				localStateManager, new NullLogService(), sessionDataService, stubGit));

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
				localStateManager, new NullLogService(), sessionDataService, stubGit));

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

			// Trigger the recompute of the uncommitted changeset.
			localChangesets.refreshUncommittedChangeset(sessionStr);

			// Wait long enough for the sequencer to drain the uncommitted compute.
			for (let i = 0; i < 50; i++) {
				await timeout(2);
			}

			// 1) The persisted snapshot must still be in live state — no
			//    `ChangesetFileRemoved` envelopes for the uncommitted URI
			//    were emitted.
			const uncommittedUri = `${sessionStr}/changeset/uncommitted`;
			const removed = envelopes
				.map(e => e.action)
				.filter(a => a.type === ActionType.ChangesetFileRemoved && a.changeset === uncommittedUri);
			assert.deepStrictEqual(removed, [], 'no files should be removed when the git path is unavailable');

			// 2) The persisted DB blob is unchanged (compute did not overwrite it).
			const persistedAfter = await sessionDb.getMetadata('agentHost.changeset.uncommitted');
			assert.strictEqual(persistedAfter, undefined, 'compute must not persist anything when git is unavailable');

			// 3) Live state still reports the 3 seeded files.
			const snapshot = localStateManager.getSnapshot(uncommittedUri);
			const state = snapshot?.state as { files: Array<{ id: string }> } | undefined;
			assert.deepStrictEqual(state?.files.map(f => f.id).sort(), ['file:///wd/a.ts', 'file:///wd/b.ts', 'file:///wd/c.ts']);
		});
	});

	suite('restorePersistedStaticChangesets', () => {

		const aDiff = { after: { uri: 'file:///wd/a.ts', content: { uri: 'file:///wd/a.ts' } }, diff: { added: 1, removed: 0 } };
		const bDiff = { after: { uri: 'file:///wd/b.ts', content: { uri: 'file:///wd/b.ts' } }, diff: { added: 2, removed: 0 } };
		const sessionStr = sessionUri.toString();

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

			const catalogue = stateManager.getSessionState(sessionStr)?.summary.changesets;
			const sessionEntry = catalogue?.find(c => c.uriTemplate === `${sessionStr}/changeset/session`);
			assert.deepStrictEqual(sessionEntry, {
				label: 'Session Changes',
				uriTemplate: `${sessionStr}/changeset/session`,
				additions: 3,
				deletions: 0,
				files: 2,
			}, 'catalogue counts must reflect restored files');
		});
	});
});
