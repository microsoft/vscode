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
import type { SessionAddedNotification, SessionDiffsChangedAction } from '../../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import type { INotificationBroadcastParams } from '../../../common/state/sessionProtocol.js';
import {
	dispatchTurnStarted,
	getActionEnvelope,
	IServerHandle,
	isActionNotification,
	nextSessionUri,
	startServer,
	TestProtocolClient,
} from './testHelpers.js';

const hasGit = (() => {
	try { cp.execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
})();

(hasGit ? suite : suite.skip)('Protocol WebSocket — Git-driven session diffs', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	let tmpRoot: string;

	suiteSetup(async function () {
		this.timeout(15_000);
		server = await startServer();
	});

	suiteTeardown(function () {
		server.process.kill();
	});

	setup(async function () {
		this.timeout(10_000);
		// Initialize a tmp git repo as the session's working directory.
		tmpRoot = mkdtempSync(join(tmpdir(), 'agent-host-proto-diff-'));
		const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
		const run = (...args: string[]) => cp.execFileSync('git', args, { cwd: tmpRoot, env, stdio: 'pipe' });
		run('init', '-q', '-b', 'main');
		writeFileSync(join(tmpRoot, 'seed.txt'), 'seed\n');
		run('add', '.');
		run('commit', '-q', '-m', 'init');

		client = new TestProtocolClient(server.port);
		await client.connect();
	});

	teardown(function () {
		client.close();
		if (tmpRoot) {
			rmSync(tmpRoot, { recursive: true, force: true });
		}
	});

	test('terminal-driven file edit (no ToolResultFileEditContent) is reported via summary.diffs', async function () {
		this.timeout(15_000);

		// Create a session whose working directory is the tmp git repo.
		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: 'test-git-diffs' });

		const workingDirectory = URI.file(tmpRoot).toString();
		await client.call('createSession', { session: nextSessionUri(), provider: 'mock', workingDirectory });

		const addedNotif = await client.waitForNotification(n =>
			n.method === 'notification' && (n.params as INotificationBroadcastParams).notification.type === 'notify/sessionAdded'
		);
		const sessionUri = ((addedNotif.params as INotificationBroadcastParams).notification as SessionAddedNotification).summary.resource;

		await client.call<SubscribeResult>('subscribe', { resource: sessionUri });
		client.clearReceived();

		// Fire a turn that runs the `terminal-edit:<path>` mock prompt. The mock
		// agent writes the file via fs.writeFile (no ToolResultFileEditContent),
		// so the diff must come from the git-driven path.
		const editedFile = join(tmpRoot, 'from-terminal.txt');
		dispatchTurnStarted(client, sessionUri, 'turn-1', `terminal-edit:${editedFile}`, 1);

		// Wait for the diff broadcast that comes after the idle event.
		const diffNotif = await client.waitForNotification(n => isActionNotification(n, 'session/diffsChanged'), 10_000);
		const action = getActionEnvelope(diffNotif).action as SessionDiffsChangedAction;

		// On macOS, git's `--show-toplevel` resolves symlinks (/var → /private/var)
		// so the diff URI may differ in prefix; match by basename instead.
		const matching = action.diffs.find(d => {
			const u = d.after?.uri ?? d.before?.uri;
			return typeof u === 'string' && u.endsWith('/from-terminal.txt');
		});
		assert.ok(matching, `expected diff for from-terminal.txt; got ${JSON.stringify(action.diffs.map(d => d.after?.uri ?? d.before?.uri))}`);
		assert.ok(matching!.after, 'expected after-side for newly added file');
		assert.ok(!matching!.before, 'newly added file should have no before-side');
	});
});
