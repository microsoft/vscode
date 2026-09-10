/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as cp from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { SubscribeResult } from '../../../common/state/protocol/commands.js';
import type { ChangesetContentChangedAction, SessionAddedParams, SessionSummaryChangedParams } from '../../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import {
	dispatchTurnStarted,
	getAgentHostE2ETestTimeout,
	getActionEnvelope,
	IServerHandle,
	isActionNotification,
	nextSessionUri,
	startServer,
	stopServer,
	TestProtocolClient,
} from '../serverIntegrationTestHelpers.js';

const hasGit = (() => {
	try { cp.execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

(hasGit ? suite : suite.skip)('Protocol WebSocket — Git-driven session changeset', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	let tmpRoot: string;
	let userDataDir: string;

	suiteSetup(async function () {
		this.timeout(getAgentHostE2ETestTimeout(15_000, 60_000));
		userDataDir = mkdtempSync(join(tmpdir(), 'agent-host-proto-diff-user-data-'));
		server = await startServer({ userDataDir });
	});

	suiteTeardown(async function () {
		this.timeout(getAgentHostE2ETestTimeout(20_000, 50_000));
		await stopServer(server);
		rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
	});

	setup(async function () {
		this.timeout(getAgentHostE2ETestTimeout(10_000, 30_000));
		// Initialize a tmp git repo as the session's working directory.
		tmpRoot = mkdtempSync(join(tmpdir(), 'agent-host-proto-diff-'));
		const run = (...args: string[]) => cp.execFileSync('git', args, { cwd: tmpRoot, stdio: 'pipe' });
		run('init', '-q', '-b', 'main');
		// The agent-host subprocess also needs an identity for its checkpoint commits.
		run('config', 'user.name', 'Agent Host Test');
		run('config', 'user.email', 'agent-host-test@example.com');
		writeFileSync(join(tmpRoot, 'seed.txt'), 'seed\n');
		run('add', '.');
		run('commit', '-q', '-m', 'init');

		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(function () {
		client.close();
		if (tmpRoot) {
			try {
				// On Windows, freshly-spawned `git` child processes and the
				// agent host server may still hold handles on files under
				// `tmpRoot` (e.g. `.git/index`) when teardown runs, causing
				// `EBUSY`/`ENOTEMPTY`. `maxRetries` is Node's built-in
				// workaround for exactly this case.
				rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
			} catch {
				// Best-effort: leave the temp dir for the OS to clean up
				// rather than fail the test on a stale Windows file lock.
			}
		}
	});

	test('terminal-driven file edit (no ToolResultFileEditContent) lands in the session changeset', async function () {
		this.timeout(getAgentHostE2ETestTimeout(15_000, 90_000));

		// Create a session whose working directory is the tmp git repo.
		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-git-diffs' });

		const workingDirectory = URI.file(tmpRoot).toString();
		await client.call('createSession', { channel: nextSessionUri(), provider: 'mock', workingDirectories: [workingDirectory] });

		const addedNotif = await client.waitForNotification(n =>
			n.method === 'root/sessionAdded'
		);
		const sessionUri = (addedNotif.params as SessionAddedParams).summary.resource;

		await client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		// Also subscribe to the session changeset URI: `changeset/*` envelopes
		// are scoped to the changeset URI by `_isRelevantToClient`, so a
		// session-only subscription will not receive them.
		const branchChangesetUri = `${sessionUri}/changeset/branch`;
		await client.call<SubscribeResult>('subscribe', { channel: branchChangesetUri });
		client.clearReceived();

		// Fire a turn that runs the `terminal-edit:<path>` mock prompt. The mock
		// agent writes the file via fs.writeFile (no ToolResultFileEditContent),
		// so the diff must come from the git-driven path.
		const editedFile = join(tmpRoot, 'from-terminal.txt');
		dispatchTurnStarted(client, sessionUri, 'turn-1', `terminal-edit:${editedFile}`, 1);

		// Wait for a `changeset/contentChanged` action whose file list
		// includes the edited file. On macOS, git's `--show-toplevel`
		// resolves symlinks (/var → /private/var) so the URI may differ in
		// prefix; match by basename.
		const fileUri = (edit: ChangesetContentChangedAction['files'][number]['edit']) =>
			edit.after?.uri ?? edit.before?.uri;
		const matchesEditedFile = (action: ChangesetContentChangedAction) =>
			action.files.some(f => {
				const u = fileUri(f.edit);
				return typeof u === 'string' && u.endsWith('/from-terminal.txt');
			});
		const contentChangedNotif = await client.waitForNotification(n => {
			if (!isActionNotification(n, 'changeset/contentChanged')) {
				return false;
			}
			return matchesEditedFile(getActionEnvelope(n).action as ChangesetContentChangedAction);
		}, getAgentHostE2ETestTimeout(10_000, 30_000));
		const action = getActionEnvelope(contentChangedNotif).action as ChangesetContentChangedAction;
		const file = action.files.find(f => {
			const u = fileUri(f.edit);
			return typeof u === 'string' && u.endsWith('/from-terminal.txt');
		});
		assert.ok(file, 'expected the edited file in the changeset content');
		assert.ok(file.edit.after, 'expected after-side for newly added file');
		assert.ok(!file.edit.before, 'newly added file should have no before-side');
	});

	test('folder summary matches Session Changes and excludes pre-existing working-tree changes', async function () {
		this.timeout(getAgentHostE2ETestTimeout(15_000, 90_000));
		writeFileSync(join(tmpRoot, 'pre-existing.txt'), 'pre-existing change\n');
		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-folder-summary' });
		const session = nextSessionUri();
		await client.call('createSession', {
			channel: session, provider: 'mock', workingDirectories: [URI.file(tmpRoot).toString()],
			config: { isolation: 'folder' },
		});
		const changeset = `${session}/changeset/session`;
		await client.call('subscribe', { channel: session });
		await client.call('subscribe', { channel: changeset });
		client.clearReceived();

		dispatchTurnStarted(client, session, 'turn-folder-summary', `terminal-edit:${join(tmpRoot, 'session-edit.txt')}`, 1);
		const content = await client.waitForNotification(n =>
			isActionNotification(n, 'changeset/contentChanged')
			&& getActionEnvelope(n).channel === changeset
			&& (getActionEnvelope(n).action as ChangesetContentChangedAction).files.some(file => file.edit.after?.uri.endsWith('/session-edit.txt')),
			getAgentHostE2ETestTimeout(10_000, 30_000),
		);
		const files = (getActionEnvelope(content).action as ChangesetContentChangedAction).files;
		const summary = await client.waitForNotification(n =>
			n.method === 'root/sessionSummaryChanged'
			&& (n.params as SessionSummaryChangedParams).session === session
			&& (n.params as SessionSummaryChangedParams).changes.changes?.files === 1,
		);

		assert.deepStrictEqual({
			files: files.map(file => file.edit.after?.uri.split('/').pop()),
			changes: (summary.params as SessionSummaryChangedParams).changes.changes,
		}, {
			files: ['session-edit.txt'],
			changes: {
				additions: files[0].edit.diff?.added ?? 0,
				deletions: files[0].edit.diff?.removed ?? 0,
				files: 1,
			},
		});
	});
});
