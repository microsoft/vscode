/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The changeset channel: how the host reports what a session changed on disk.
 *
 * A changeset is computed from git rather than from what a tool reported, so
 * it sees edits the agent made by any means — the scenarios here drive real
 * file changes through host-executed bang commands and never cross the model
 * boundary.
 *
 * The host publishes several changesets per session, each on its own
 * subscribable channel: `branch` (against the branch point), `uncommitted`
 * (working-tree state), and `session` (cumulative for the session). They are
 * separate channels because `changeset/*` actions are scoped to the changeset
 * URI, so a session-only subscription never receives them.
 *
 * This contract previously existed only in the frozen `../protocol/` suite,
 * which drives a mock agent with the magic prompt `terminal-edit:<path>` and
 * so cannot describe the contract for any other AHP implementation.
 */

import assert from 'assert';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import {
	buildBranchChangesetUri,
	buildSessionChangesetUri,
	buildUncommittedChangesetUri,
} from '../../../../common/changesetUri.js';
import { createRealSession, dispatchTurn, initTestGitRepo } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

/** The subset of `ChangesetFile` these tests assert on. */
interface IObservedChangesetFile {
	readonly id: string;
	readonly reviewed?: boolean;
	readonly edit: {
		readonly before?: { readonly uri: string };
		readonly after?: { readonly uri: string };
		readonly diff?: { readonly added: number; readonly removed: number };
	};
}

interface IContentChangedAction {
	readonly files: readonly IObservedChangesetFile[];
	readonly operations?: readonly { readonly id: string; readonly scopes: readonly string[] }[];
}

export function defineChangesetTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;

	/**
	 * Client sequence numbers must strictly increase for the lifetime of a
	 * client, and the suite shares one across tests, so they cannot be
	 * hard-coded per scenario.
	 */
	let clientSeq = 1000;
	function nextClientSeq(): number {
		return clientSeq++;
	}

	/** A git repository with one committed file, so a branch point exists. */
	function createGitWorkspace(prefix: string): string {
		const workspace = mkdtempSync(join(tmpdir(), prefix));
		tempDirs.push(workspace);
		initTestGitRepo(workspace);
		writeFileSync(join(workspace, 'seed.txt'), 'seed\n');
		execSync('git add .', { cwd: workspace });
		execSync('git commit -q -m "seed"', { cwd: workspace });
		return workspace;
	}

	async function createSessionIn(workspace: string, prefix: string): Promise<string> {
		return createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, URI.file(workspace));
	}

	/**
	 * Writes `file` through a host-executed bang command, so the change reaches
	 * disk the way an agent's shell edit would rather than from the test
	 * process. Paths are relative so no Windows backslash has to survive into a
	 * JavaScript string literal.
	 *
	 * The file name and contents are passed as `process.argv` entries rather
	 * than interpolated into the script, so a value containing a quote or a
	 * backslash cannot break out of the literal or change what runs.
	 */
	function writeFileCommand(file: string, contents: string): string {
		return `!node -e "require('fs').writeFileSync(process.argv[1],process.argv[2])" ${file} ${contents}`;
	}

	function fileUri(file: IObservedChangesetFile): string {
		return file.edit.after?.uri ?? file.edit.before?.uri ?? '';
	}

	/**
	 * Waits for a `changeset/contentChanged` on `channel` that reports
	 * `basename`. Matched by basename because git resolves symlinks when
	 * reporting its top level (macOS `/var` versus `/private/var`), so the
	 * reported URI need not share a prefix with the workspace path.
	 */
	async function waitForFileInChangeset(channel: string, basename: string, timeout = 60_000): Promise<IObservedChangesetFile> {
		const notification = await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'changeset/contentChanged') || getActionEnvelope(n).channel !== channel) {
				return false;
			}
			const action = getActionEnvelope(n).action as IContentChangedAction;
			return action.files.some(file => fileUri(file).endsWith(`/${basename}`));
		}, timeout);
		const action = getActionEnvelope(notification).action as IContentChangedAction;
		return action.files.find(file => fileUri(file).endsWith(`/${basename}`))!;
	}


	conformanceTest(context, 'subscribing to a changeset reports its computation status', async function () {
		const workspace = createGitWorkspace('ahp-changeset-status-');
		const sessionUri = await createSessionIn(workspace, 'changeset-status');
		const branchUri = buildBranchChangesetUri(sessionUri);

		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });

		// A changeset is computed asynchronously, so the snapshot a subscriber
		// receives is a starting point and the terminal status arrives as an
		// action. Asserting only the snapshot would pass without the host ever
		// finishing the computation.
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'changeset/statusChanged')
			&& getActionEnvelope(n).channel === branchUri
			&& (getActionEnvelope(n).action as { status: string }).status === 'ready',
			60_000,
		);

		assert.deepStrictEqual({
			resource: subscribed.snapshot!.resource,
			files: (subscribed.snapshot!.state as { files: unknown[] }).files,
		}, {
			resource: branchUri,
			files: [],
		});
	});

	conformanceTest(context, 'a file written during a turn appears in the branch changeset', async function () {
		const workspace = createGitWorkspace('ahp-changeset-add-');
		const sessionUri = await createSessionIn(workspace, 'changeset-add');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });

		context.client.clearReceived();
		dispatchTurn(context.client, sessionUri, 'turn-changeset-add', writeFileCommand('added.txt', 'ADDED'), 1);

		const file = await waitForFileInChangeset(branchUri, 'added.txt');

		// A newly added file has no before-side, and its diff counts the added
		// line. Both come from git rather than from anything the tool reported,
		// which is the property that makes the changeset trustworthy.
		assert.deepStrictEqual({
			hasBeforeSide: file.edit.before !== undefined,
			hasAfterSide: file.edit.after !== undefined,
			diff: file.edit.diff,
			reviewed: file.reviewed,
		}, {
			hasBeforeSide: false,
			hasAfterSide: true,
			diff: { added: 1, removed: 0 },
			reviewed: false,
		});
	});

	conformanceTest(context, 'editing a committed file reports both sides of the change', async function () {
		const workspace = createGitWorkspace('ahp-changeset-edit-');
		const sessionUri = await createSessionIn(workspace, 'changeset-edit');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });

		context.client.clearReceived();
		dispatchTurn(context.client, sessionUri, 'turn-changeset-edit', writeFileCommand('seed.txt', 'edited'), 1);

		const file = await waitForFileInChangeset(branchUri, 'seed.txt');

		// Unlike an added file, an edit to a committed file has a before-side —
		// the committed revision — so the client can render a real diff.
		assert.deepStrictEqual({
			hasBeforeSide: file.edit.before !== undefined,
			hasAfterSide: file.edit.after !== undefined,
		}, {
			hasBeforeSide: true,
			hasAfterSide: true,
		});
	});

	conformanceTest(context, 'a client can mark a changeset file reviewed', async function () {
		const workspace = createGitWorkspace('ahp-changeset-review-');
		const sessionUri = await createSessionIn(workspace, 'changeset-review');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });

		context.client.clearReceived();
		dispatchTurn(context.client, sessionUri, 'turn-changeset-review', writeFileCommand('reviewme.txt', 'REVIEW'), 1);
		const file = await waitForFileInChangeset(branchUri, 'reviewme.txt');

		// `changeset/filesReviewChanged` is the one client-dispatchable action
		// on this channel: review state is the client's to own, and the server
		// echoes it back so other connected clients converge.
		context.client.dispatch({
			channel: branchUri,
			clientSeq: nextClientSeq(),
			action: { type: ActionType.ChangesetFilesReviewChanged, files: [file.id], reviewed: true },
		});

		const echoed = await context.client.waitForNotification(n =>
			isActionNotification(n, 'changeset/filesReviewChanged')
			&& getActionEnvelope(n).channel === branchUri,
			60_000,
		);

		assert.deepStrictEqual(getActionEnvelope(echoed).action, {
			type: ActionType.ChangesetFilesReviewChanged,
			files: [file.id],
			reviewed: true,
		});
	});

	conformanceTest(context, 'uncommitted changes advertise the operations that act on them', async function () {
		const workspace = createGitWorkspace('ahp-changeset-ops-');
		const sessionUri = await createSessionIn(workspace, 'changeset-ops');
		const uncommittedUri = buildUncommittedChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: uncommittedUri });

		context.client.clearReceived();
		dispatchTurn(context.client, sessionUri, 'turn-changeset-ops', writeFileCommand('operate.txt', 'OPERATE'), 1);

		// Operations are what a client turns into affordances, and they are
		// only offered once there is something to act on — a session with no
		// uncommitted changes advertises none. Each carries the scope it
		// applies to, so a client knows whether to offer it for the whole
		// changeset or per file.
		const notification = await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'changeset/contentChanged') || getActionEnvelope(n).channel !== uncommittedUri) {
				return false;
			}
			return ((getActionEnvelope(n).action as IContentChangedAction).operations ?? []).length > 0;
		}, 60_000);

		const operations = (getActionEnvelope(notification).action as IContentChangedAction).operations ?? [];
		assert.deepStrictEqual(operations.map(operation => ({ id: operation.id, scopes: operation.scopes })), [
			{ id: 'commit', scopes: ['changeset'] },
			{ id: 'discard-changes', scopes: ['resource'] },
		]);
	});

	conformanceTest(context, 'the session advertises its changeset catalog on separate channels', async function () {
		const workspace = createGitWorkspace('ahp-changeset-catalog-');
		const sessionUri = await createSessionIn(workspace, 'changeset-catalog');

		// Each changeset is its own channel. A client that subscribes only to
		// the session never receives `changeset/*` actions, so the catalog is
		// how it learns what else to subscribe to.
		const subscribed = await Promise.all([
			context.client.call<SubscribeResult>('subscribe', { channel: buildBranchChangesetUri(sessionUri) }),
			context.client.call<SubscribeResult>('subscribe', { channel: buildUncommittedChangesetUri(sessionUri) }),
			context.client.call<SubscribeResult>('subscribe', { channel: buildSessionChangesetUri(sessionUri) }),
		]);

		assert.deepStrictEqual(subscribed.map(result => result.snapshot!.resource), [
			buildBranchChangesetUri(sessionUri),
			buildUncommittedChangesetUri(sessionUri),
			buildSessionChangesetUri(sessionUri),
		]);
	});

	conformanceTest(context, 'invokeChangesetOperation rejects an unknown operation', async function () {
		const workspace = createGitWorkspace('ahp-changeset-invoke-');
		const sessionUri = await createSessionIn(workspace, 'changeset-invoke');
		const changesetUri = buildUncommittedChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: changesetUri });

		await assert.rejects(
			() => context.client.call('invokeChangesetOperation', {
				channel: changesetUri,
				operationId: 'does-not-exist',
			}),
			/unknown operation/i,
		);
	});
}
