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
import { execFileSync, execSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { retry } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import type { ListSessionsResult, ResourceReadResult, SubscribeResult } from '../../../../common/state/protocol/commands.js';
import { ContentEncoding } from '../../../../common/state/protocol/common/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationResult } from '../../../../common/state/protocol/channels-changeset/commands.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { buildChatUri, buildDefaultChatUri, MessageKind, readSessionGitState, ROOT_STATE_URI, type SessionState } from '../../../../common/state/sessionState.js';
import {
	ChangesetKind,
	buildBranchChangesetUri,
	buildCompareTurnsChangesetUri,
	buildSessionChangesetUri,
	buildTurnChangesetUri,
	buildUncommittedChangesetUri,
} from '../../../../common/changesetUri.js';
import { createRealSession, dispatchTurn, driveTurnToCompletion, initTestGitRepo, resolveGitHubToken, startBackgroundApprovalLoop } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

/** The subset of `ChangesetFile` these tests assert on. */
interface IObservedChangesetFile {
	readonly id: string;
	readonly reviewed?: boolean;
	readonly edit: {
		readonly before?: { readonly uri: string; readonly content?: { readonly uri: string } };
		readonly after?: { readonly uri: string; readonly content?: { readonly uri: string } };
		readonly diff?: { readonly added: number; readonly removed: number };
	};
}

interface IContentChangedAction {
	readonly files: readonly IObservedChangesetFile[];
	readonly operations?: readonly IObservedOperation[];
}

interface IOperationsChangedAction {
	readonly operations?: readonly IObservedOperation[];
}

interface IObservedOperation {
	readonly id: string;
	readonly scopes: readonly string[];
	readonly status: string;
}

interface IOperationStatusChangedAction {
	readonly operationId: string;
	readonly status: string;
}

interface IObservedChangesetState {
	readonly status: string;
	readonly files: readonly IObservedChangesetFile[];
	readonly operations?: readonly IObservedOperation[];
	readonly error?: { readonly message?: string };
}

const CHANGESET_OPERATION_TIMEOUT_MS = 60_000;

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

	function createRemoteGitWorkspace(prefix: string): { readonly workspace: string; readonly remote: string } {
		const workspace = createGitWorkspace(`${prefix}-workspace-`);
		const remote = mkdtempSync(join(tmpdir(), `${prefix}-remote-`));
		tempDirs.push(remote);
		execFileSync('git', ['init', '--bare', '-q'], { cwd: remote });
		execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: workspace });
		execFileSync('git', ['push', '-q', '-u', 'origin', 'HEAD'], { cwd: workspace });
		execFileSync('git', ['config', 'pull.rebase', 'false'], { cwd: workspace });
		return { workspace, remote };
	}

	function commitFile(workspace: string, file: string, contents: string, message: string): void {
		writeFileSync(join(workspace, file), contents);
		execFileSync('git', ['add', file], { cwd: workspace });
		execFileSync('git', ['commit', '-q', '-m', message], { cwd: workspace });
	}

	function pushRemoteCommit(remote: string, prefix: string, file: string, contents: string): void {
		const clone = mkdtempSync(join(tmpdir(), `${prefix}-clone-`));
		tempDirs.push(clone);
		execFileSync('git', ['clone', '-q', remote, '.'], { cwd: clone });
		execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: clone });
		execFileSync('git', ['config', 'user.name', 'Agent Host E2E'], { cwd: clone });
		commitFile(clone, file, contents, `add ${file}`);
		execFileSync('git', ['push', '-q'], { cwd: clone });
	}

	async function createSessionIn(workspace: string, prefix: string): Promise<string> {
		return createRealSession(context.client, config, `${prefix}-${config.provider}`, createdSessions, URI.file(workspace));
	}

	async function createWorktreeSessionIn(workspace: string, prefix: string): Promise<string> {
		tempDirs.push(`${workspace}.worktrees`);
		context.client.setWorkingDirectory(workspace);
		await context.client.call('initialize', { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: `${prefix}-${config.provider}` }, 30_000);
		await context.client.call('authenticate', { channel: ROOT_STATE_URI, resource: 'https://api.github.com', token: config.githubToken ?? resolveGitHubToken() }, 30_000);
		const sessionUri = URI.from({ scheme: config.scheme, path: `/${generateUuid()}` }).toString();
		const branch = execSync('git branch --show-current', { cwd: workspace, encoding: 'utf8' }).trim();
		await context.client.call('createSession', {
			channel: sessionUri,
			provider: config.provider,
			workingDirectories: [URI.file(workspace).toString()],
			config: { isolation: 'worktree', branch },
		}, 30_000);
		createdSessions.push(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		await context.client.call<SubscribeResult>('subscribe', { channel: buildDefaultChatUri(sessionUri) });
		context.client.clearReceived();
		return sessionUri;
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

	function writeFileBase64Command(file: string, contents: string): string {
		const encodedFile = Buffer.from(file).toString('base64');
		const encodedContents = Buffer.from(contents).toString('base64');
		return `!node -e "const fs=require('fs');fs.writeFileSync(Buffer.from(process.argv[1],'base64').toString(),Buffer.from(process.argv[2],'base64'))" ${encodedFile} ${encodedContents}`;
	}

	function writeFileTwiceBase64Command(file: string, first: string, second: string): string {
		const encodedFile = Buffer.from(file).toString('base64');
		const encodedFirst = Buffer.from(first).toString('base64');
		const encodedSecond = Buffer.from(second).toString('base64');
		return `!node -e "const fs=require('fs');const file=Buffer.from(process.argv[1],'base64').toString();fs.writeFileSync(file,Buffer.from(process.argv[2],'base64'));fs.writeFileSync(file,Buffer.from(process.argv[3],'base64'))" ${encodedFile} ${encodedFirst} ${encodedSecond}`;
	}

	function deleteFileCommand(file: string): string {
		return `!node -e "require('fs').unlinkSync(process.argv[1])" ${file}`;
	}

	function renameFileCommand(source: string, target: string): string {
		return `!node -e "require('fs').renameSync(process.argv[1],process.argv[2])" ${source} ${target}`;
	}

	function fileUri(file: IObservedChangesetFile): string {
		return file.edit.after?.uri ?? file.edit.before?.uri ?? '';
	}

	function fileHasBasename(file: IObservedChangesetFile, basename: string): boolean {
		return URI.parse(fileUri(file)).path.endsWith(`/${basename}`);
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
			return action.files.some(file => fileHasBasename(file, basename));
		}, timeout);
		const action = getActionEnvelope(notification).action as IContentChangedAction;
		return action.files.find(file => fileHasBasename(file, basename))!;
	}

	async function waitForTurnComplete(sessionUri: string, turnId: string): Promise<void> {
		const chatUri = buildDefaultChatUri(sessionUri);
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'chat/turnComplete')
			&& getActionEnvelope(n).channel === chatUri
			&& (getActionEnvelope(n).action as { readonly turnId: string }).turnId === turnId,
			90_000,
		);
	}

	async function changesetState(channel: string): Promise<IObservedChangesetState> {
		const result = await context.client.call<SubscribeResult>('subscribe', { channel });
		let state = result.snapshot!.state as IObservedChangesetState;
		if (state.status === 'computing') {
			await context.client.waitForNotification(n =>
				isActionNotification(n, 'changeset/statusChanged')
				&& getActionEnvelope(n).channel === channel
				&& (getActionEnvelope(n).action as { readonly status: string }).status !== 'computing',
				60_000,
			);
			state = (await context.client.call<SubscribeResult>('subscribe', { channel })).snapshot!.state as typeof state;
		}
		return state;
	}

	async function waitForOperation(channel: string, operationId: string): Promise<IObservedOperation> {
		return retry(async () => {
			const operation = (await changesetState(channel)).operations?.find(operation => operation.id === operationId);
			if (!operation || operation.status !== 'idle') {
				throw new Error(`Changeset ${channel} has not advertised idle operation ${operationId}`);
			}
			return operation;
		}, 100, 100);
	}

	async function waitForOperationRemoved(channel: string, operationId: string): Promise<void> {
		await retry(async () => {
			if ((await changesetState(channel)).operations?.some(operation => operation.id === operationId)) {
				throw new Error(`Changeset ${channel} still advertises operation ${operationId}`);
			}
		}, 100, 100);
	}

	async function invokeChangesetOperation(channel: string, operationId: string): Promise<{
		readonly result: InvokeChangesetOperationResult;
		readonly statuses: readonly string[];
	}> {
		context.client.clearReceived();
		const completed = context.client.waitForNotification(n =>
			isActionNotification(n, 'changeset/operationStatusChanged')
			&& getActionEnvelope(n).channel === channel
			&& (getActionEnvelope(n).action as IOperationStatusChangedAction).operationId === operationId
			&& (getActionEnvelope(n).action as IOperationStatusChangedAction).status === 'idle',
			CHANGESET_OPERATION_TIMEOUT_MS,
		);
		const result = await context.client.call<InvokeChangesetOperationResult>('invokeChangesetOperation', {
			channel,
			operationId,
		}, CHANGESET_OPERATION_TIMEOUT_MS);
		await completed;
		const statuses = context.client.receivedNotifications(n =>
			isActionNotification(n, 'changeset/operationStatusChanged')
			&& getActionEnvelope(n).channel === channel,
		).map(n => getActionEnvelope(n).action as IOperationStatusChangedAction)
			.filter(action => action.operationId === operationId)
			.map(action => action.status);
		return { result, statuses };
	}

	async function waitForChangesetFiles(channel: string, basenames: readonly string[]): Promise<readonly IObservedChangesetFile[]> {
		return retry(async () => {
			const state = await changesetState(channel);
			const files: IObservedChangesetFile[] = [];
			for (const basename of basenames) {
				const file = state.files.find(file => fileHasBasename(file, basename));
				if (file) {
					files.push(file);
				}
			}
			if (state.status !== 'ready' || files.length !== basenames.length) {
				throw new Error(`Changeset ${channel} has not reported ${basenames.join(', ')}`);
			}
			return files;
		}, 100, 100);
	}

	async function runBangTurn(sessionUri: string, turnId: string, command: string, clientSeq: number): Promise<void> {
		context.client.clearReceived();
		dispatchTurn(context.client, sessionUri, turnId, command, clientSeq);
		await waitForTurnComplete(sessionUri, turnId);
	}

	async function waitForIdleResourceOnlyOperation(
		channel: string,
		operationId: string,
		initialOperations: readonly IObservedOperation[],
	): Promise<void> {
		const operations = new Map(initialOperations.map(operation => [operation.id, operation]));
		const pendingStatuses = new Map<string, string>();
		const isReady = () => {
			const operation = operations.get(operationId);
			return operation?.status === 'idle'
				&& operation.scopes.includes('resource')
				&& !operation.scopes.includes('changeset');
		};
		const replaceOperations = (replacement: readonly IObservedOperation[]): void => {
			operations.clear();
			for (const operation of replacement) {
				const pendingStatus = pendingStatuses.get(operation.id);
				operations.set(operation.id, pendingStatus === undefined ? operation : { ...operation, status: pendingStatus });
				pendingStatuses.delete(operation.id);
			}
		};
		const reduce = (n: Parameters<typeof isActionNotification>[0]): void => {
			const isContentChanged = isActionNotification(n, 'changeset/contentChanged');
			const isOperationsChanged = isActionNotification(n, 'changeset/operationsChanged');
			const isStatusChanged = isActionNotification(n, 'changeset/operationStatusChanged');
			if ((!isContentChanged && !isOperationsChanged && !isStatusChanged) || getActionEnvelope(n).channel !== channel) {
				return;
			}
			if (isOperationsChanged) {
				replaceOperations((getActionEnvelope(n).action as IOperationsChangedAction).operations ?? []);
			} else if (isContentChanged) {
				const replacement = (getActionEnvelope(n).action as IContentChangedAction).operations;
				if (replacement) {
					replaceOperations(replacement);
				}
			} else {
				const changed = getActionEnvelope(n).action as IOperationStatusChangedAction;
				const operation = operations.get(changed.operationId);
				if (operation) {
					operations.set(changed.operationId, { ...operation, status: changed.status });
				} else {
					pendingStatuses.set(changed.operationId, changed.status);
				}
			}
		};
		const processed = new Set(context.client.receivedNotifications());
		for (const notification of processed) {
			reduce(notification);
		}
		if (isReady()) {
			return;
		}
		await context.client.waitForNotification(n => {
			if (processed.has(n)) {
				return false;
			}
			processed.add(n);
			reduce(n);
			return isReady();
		}, CHANGESET_OPERATION_TIMEOUT_MS);
	}

	async function createModifiedUncommittedChangeset(prefix: string): Promise<{
		readonly workspace: string;
		readonly changeset: string;
		readonly file: IObservedChangesetFile;
	}> {
		const workspace = createGitWorkspace(`ahp-${prefix}-`);
		const sessionUri = await createSessionIn(workspace, prefix);
		const changeset = buildUncommittedChangesetUri(sessionUri);
		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: changeset });
		const initialOperations = ((subscribed.snapshot!.state as { operations?: readonly IObservedOperation[] }).operations ?? []);
		context.client.clearReceived();
		const turnId = `turn-${prefix}`;
		dispatchTurn(context.client, sessionUri, turnId, writeFileCommand('seed.txt', 'edited'), 1);
		const file = await waitForFileInChangeset(changeset, 'seed.txt');
		await waitForIdleResourceOnlyOperation(changeset, 'discard-changes', initialOperations);
		await waitForTurnComplete(sessionUri, turnId);
		return { workspace, changeset, file };
	}

	async function invokeDiscard(changeset: string, resource: string): Promise<string[]> {
		context.client.clearReceived();
		const completed = context.client.waitForNotification(n =>
			isActionNotification(n, 'changeset/operationStatusChanged')
			&& getActionEnvelope(n).channel === changeset
			&& (getActionEnvelope(n).action as { operationId: string; status: string }).operationId === 'discard-changes'
			&& (getActionEnvelope(n).action as { operationId: string; status: string }).status === 'idle',
			CHANGESET_OPERATION_TIMEOUT_MS,
		);
		await context.client.call('invokeChangesetOperation', {
			channel: changeset,
			operationId: 'discard-changes',
			target: { kind: ChangesetOperationTargetKind.Resource, resource },
		}, CHANGESET_OPERATION_TIMEOUT_MS);
		await completed;
		return context.client.receivedNotifications(n =>
			isActionNotification(n, 'changeset/operationStatusChanged')
			&& getActionEnvelope(n).channel === changeset,
		).map(n => getActionEnvelope(n).action as { operationId: string; status: string })
			.filter(action => action.operationId === 'discard-changes')
			.map(action => action.status);
	}


	conformanceTest(context, 'subscribing to a changeset reaches ready status', async function () {
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
		const turnId = 'turn-changeset-add';
		dispatchTurn(context.client, sessionUri, turnId, writeFileCommand('added.txt', 'ADDED'), 1);

		const file = await waitForFileInChangeset(branchUri, 'added.txt');
		await waitForTurnComplete(sessionUri, turnId);

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
		const turnId = 'turn-changeset-edit';
		dispatchTurn(context.client, sessionUri, turnId, writeFileCommand('seed.txt', 'edited'), 1);

		const file = await waitForFileInChangeset(branchUri, 'seed.txt');
		await waitForTurnComplete(sessionUri, turnId);

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

	conformanceTest(context, 'committed changeset content can be read through its git blob reference', async function () {
		const workspace = createGitWorkspace('ahp-changeset-git-blob-');
		const sessionUri = await createSessionIn(workspace, 'changeset-git-blob');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });
		await runBangTurn(sessionUri, 'turn-changeset-git-blob', writeFileCommand('seed.txt', 'edited'), 1);
		const [file] = await waitForChangesetFiles(branchUri, ['seed.txt']);
		assert.ok(file.edit.before?.content?.uri);

		const content = await context.client.call<ResourceReadResult>('resourceRead', {
			channel: ROOT_STATE_URI,
			uri: file.edit.before.content.uri,
			encoding: ContentEncoding.Utf8,
		});

		assert.strictEqual(content.data.replaceAll('\r\n', '\n'), 'seed\n');
	});

	conformanceTest(context, 'deleting a committed file reports only the before side', async function () {
		const workspace = createGitWorkspace('ahp-changeset-delete-');
		const sessionUri = await createSessionIn(workspace, 'changeset-delete');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });

		await runBangTurn(sessionUri, 'turn-changeset-delete', deleteFileCommand('seed.txt'), 1);
		const [file] = await waitForChangesetFiles(branchUri, ['seed.txt']);

		assert.deepStrictEqual({
			hasBeforeSide: file.edit.before !== undefined,
			hasAfterSide: file.edit.after !== undefined,
			diff: file.edit.diff,
		}, {
			hasBeforeSide: true,
			hasAfterSide: false,
			diff: { added: 0, removed: 1 },
		});
	});

	conformanceTest(context, 'renaming a committed file reports the destination change', async function () {
		const workspace = createGitWorkspace('ahp-changeset-rename-');
		const sessionUri = await createSessionIn(workspace, 'changeset-rename');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });

		await runBangTurn(sessionUri, 'turn-changeset-rename', renameFileCommand('seed.txt', 'renamed.txt'), 1);
		const [file] = await waitForChangesetFiles(branchUri, ['renamed.txt']);

		assert.deepStrictEqual({
			after: file.edit.after?.uri.endsWith('/renamed.txt'),
			sourceExists: existsSync(join(workspace, 'seed.txt')),
			destinationExists: existsSync(join(workspace, 'renamed.txt')),
		}, {
			after: true,
			sourceExists: false,
			destinationExists: true,
		});
	});

	conformanceTest(context, 'one turn reports mixed create edit and delete changes', async function () {
		const workspace = createGitWorkspace('ahp-changeset-mixed-');
		writeFileSync(join(workspace, 'delete.txt'), 'delete\n');
		execSync('git add .', { cwd: workspace });
		execSync('git commit -q -m "second seed"', { cwd: workspace });
		const sessionUri = await createSessionIn(workspace, 'changeset-mixed');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });

		await runBangTurn(
			sessionUri,
			'turn-changeset-mixed',
			'!node -e "const fs=require(\'fs\');fs.writeFileSync(\'seed.txt\',\'edited\');fs.writeFileSync(\'added.txt\',\'added\');fs.unlinkSync(\'delete.txt\')"',
			1,
		);
		const files = await waitForChangesetFiles(branchUri, ['seed.txt', 'added.txt', 'delete.txt']);

		assert.deepStrictEqual(files.map(file => ({
			name: URI.parse(fileUri(file)).path.split('/').at(-1),
			hasBefore: file.edit.before !== undefined,
			hasAfter: file.edit.after !== undefined,
		})), [
			{ name: 'seed.txt', hasBefore: true, hasAfter: true },
			{ name: 'added.txt', hasBefore: false, hasAfter: true },
			{ name: 'delete.txt', hasBefore: true, hasAfter: false },
		]);
	});

	conformanceTest(context, 'ignored files do not appear in a branch changeset', async function () {
		const workspace = createGitWorkspace('ahp-changeset-ignored-');
		writeFileSync(join(workspace, '.gitignore'), 'ignored.log\n');
		execSync('git add .gitignore', { cwd: workspace });
		execSync('git commit -q -m "ignore generated log"', { cwd: workspace });
		const sessionUri = await createSessionIn(workspace, 'changeset-ignored');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });
		await changesetState(branchUri);
		context.client.clearReceived();
		const changed = context.client.waitForNotification(n =>
			isActionNotification(n, 'changeset/contentChanged') && getActionEnvelope(n).channel === branchUri,
			60_000,
		);

		await runBangTurn(sessionUri, 'turn-changeset-ignored', writeFileCommand('ignored.log', 'ignored'), 1);
		await changed;
		const state = await changesetState(branchUri);

		assert.deepStrictEqual(state.files, []);
	});

	conformanceTest(context, 'a file created and deleted in one turn leaves no branch change', async function () {
		const workspace = createGitWorkspace('ahp-changeset-create-delete-');
		const sessionUri = await createSessionIn(workspace, 'changeset-create-delete');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });
		await changesetState(branchUri);
		context.client.clearReceived();
		const changed = context.client.waitForNotification(n =>
			isActionNotification(n, 'changeset/contentChanged') && getActionEnvelope(n).channel === branchUri,
			60_000,
		);

		await runBangTurn(sessionUri, 'turn-changeset-create-delete', '!node -e "const fs=require(\'fs\');fs.writeFileSync(\'temporary.txt\',\'temporary\');fs.unlinkSync(\'temporary.txt\')"', 1);
		await changed;
		const state = await changesetState(branchUri);

		assert.deepStrictEqual(state.files, []);
	});

	conformanceTest(context, 'an edit restored in the same turn leaves no branch change', async function () {
		const workspace = createGitWorkspace('ahp-changeset-edit-restore-');
		const sessionUri = await createSessionIn(workspace, 'changeset-edit-restore');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });
		await changesetState(branchUri);
		context.client.clearReceived();
		const changed = context.client.waitForNotification(n =>
			isActionNotification(n, 'changeset/contentChanged') && getActionEnvelope(n).channel === branchUri,
			60_000,
		);

		await runBangTurn(sessionUri, 'turn-changeset-edit-restore', writeFileTwiceBase64Command('seed.txt', 'changed', 'seed\n'), 1);
		await changed;
		const state = await changesetState(branchUri);

		assert.deepStrictEqual(state.files, []);
	});

	conformanceTest(context, 'an added multiline file reports every added line', async function () {
		const workspace = createGitWorkspace('ahp-changeset-multiline-add-');
		const sessionUri = await createSessionIn(workspace, 'changeset-multiline-add');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });

		await runBangTurn(sessionUri, 'turn-changeset-multiline-add', writeFileBase64Command('lines.txt', 'one\ntwo\nthree\n'), 1);
		const [file] = await waitForChangesetFiles(branchUri, ['lines.txt']);

		assert.deepStrictEqual(file.edit.diff, { added: 3, removed: 0 });
	});

	conformanceTest(context, 'deleting a multiline tracked file reports every removed line', async function () {
		const workspace = createGitWorkspace('ahp-changeset-multiline-delete-');
		writeFileSync(join(workspace, 'lines.txt'), 'one\ntwo\nthree\n');
		execSync('git add lines.txt', { cwd: workspace });
		execSync('git commit -q -m "add multiline file"', { cwd: workspace });
		const sessionUri = await createSessionIn(workspace, 'changeset-multiline-delete');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });

		await runBangTurn(sessionUri, 'turn-changeset-multiline-delete', deleteFileCommand('lines.txt'), 1);
		const [file] = await waitForChangesetFiles(branchUri, ['lines.txt']);

		assert.deepStrictEqual(file.edit.diff, { added: 0, removed: 3 });
	});

	conformanceTest(context, 'a changed filename containing spaces remains addressable', async function () {
		const workspace = createGitWorkspace('ahp-changeset-spaced-file-');
		const sessionUri = await createSessionIn(workspace, 'changeset-spaced-file');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });

		await runBangTurn(sessionUri, 'turn-changeset-spaced-file', writeFileBase64Command('spaced file.txt', 'content\n'), 1);
		const [file] = await waitForChangesetFiles(branchUri, ['spaced file.txt']);

		assert.deepStrictEqual({
			id: URI.parse(file.id).path.endsWith('/spaced file.txt'),
			after: file.edit.after?.uri.endsWith('/spaced%20file.txt') || file.edit.after?.uri.endsWith('/spaced file.txt'),
			exists: existsSync(join(workspace, 'spaced file.txt')),
		}, {
			id: true,
			after: true,
			exists: true,
		});
	});

	conformanceTest(context, 'an empty repository reports an untracked file as added', async function () {
		const workspace = mkdtempSync(join(tmpdir(), 'ahp-changeset-empty-repo-'));
		tempDirs.push(workspace);
		initTestGitRepo(workspace);
		const sessionUri = await createSessionIn(workspace, 'changeset-empty-repo');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });

		await runBangTurn(sessionUri, 'turn-changeset-empty-repo', writeFileCommand('first.txt', 'first'), 1);
		const [file] = await waitForChangesetFiles(branchUri, ['first.txt']);

		assert.deepStrictEqual({
			hasBefore: file.edit.before !== undefined,
			hasAfter: file.edit.after !== undefined,
			diff: file.edit.diff,
		}, {
			hasBefore: false,
			hasAfter: true,
			diff: { added: 1, removed: 0 },
		});
	});

	conformanceTest(context, 'a client can mark a changeset file reviewed', async function () {
		const workspace = createGitWorkspace('ahp-changeset-review-');
		const sessionUri = await createSessionIn(workspace, 'changeset-review');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });

		context.client.clearReceived();
		const turnId = 'turn-changeset-review';
		dispatchTurn(context.client, sessionUri, turnId, writeFileCommand('reviewme.txt', 'REVIEW'), 1);
		const file = await waitForFileInChangeset(branchUri, 'reviewme.txt');
		await waitForTurnComplete(sessionUri, turnId);

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
		const authoritative = await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });
		const reviewed = ((authoritative.snapshot!.state as { files: readonly IObservedChangesetFile[] }).files)
			.find(candidate => candidate.id === file.id)?.reviewed;

		assert.deepStrictEqual({
			action: getActionEnvelope(echoed).action,
			reviewed,
		}, {
			action: {
				type: ActionType.ChangesetFilesReviewChanged,
				files: [file.id],
				reviewed: true,
			},
			reviewed: true,
		});
	});

	conformanceTest(context, 'uncommitted changes advertise the operations that act on them', async function () {
		const workspace = createGitWorkspace('ahp-changeset-ops-');
		const sessionUri = await createSessionIn(workspace, 'changeset-ops');
		const uncommittedUri = buildUncommittedChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: uncommittedUri });

		context.client.clearReceived();
		const turnId = 'turn-changeset-ops';
		dispatchTurn(context.client, sessionUri, turnId, writeFileCommand('operate.txt', 'OPERATE'), 1);

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
		await waitForTurnComplete(sessionUri, turnId);
		assert.deepStrictEqual(operations.map(operation => ({ id: operation.id, scopes: operation.scopes })), [
			{ id: 'commit', scopes: ['changeset'] },
			{ id: 'discard-changes', scopes: ['resource'] },
		]);
	});

	conformanceTest(context, 'a branch with an upstream and no outgoing commits omits sync', async function () {
		const { workspace } = createRemoteGitWorkspace('ahp-sync-none');
		const sessionUri = await createSessionIn(workspace, 'sync-none');
		const changeset = buildUncommittedChangesetUri(sessionUri);

		await retry(async () => {
			const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
			const gitState = readSessionGitState((subscribed.snapshot!.state as SessionState)._meta);
			if (!gitState?.upstreamBranchName || gitState.outgoingChanges !== 0) {
				throw new Error('Session Git state has not confirmed an up-to-date upstream');
			}
		}, 100, 100);
		const state = await changesetState(changeset);

		assert.strictEqual(state.operations?.some(operation => operation.id === 'sync') ?? false, false);
	});

	conformanceTest(context, 'an outgoing commit advertises a changeset-scoped sync operation', async function () {
		const { workspace } = createRemoteGitWorkspace('ahp-sync-advertise');
		commitFile(workspace, 'outgoing.txt', 'outgoing\n', 'add outgoing');
		const sessionUri = await createSessionIn(workspace, 'sync-advertise');
		const changeset = buildUncommittedChangesetUri(sessionUri);

		const operation = await waitForOperation(changeset, 'sync');

		assert.deepStrictEqual({
			id: operation.id,
			scopes: operation.scopes,
			status: operation.status,
		}, {
			id: 'sync',
			scopes: ['changeset'],
			status: 'idle',
		});
	});

	conformanceTest(context, 'sync pushes an outgoing commit and clears the operation', async function () {
		const { workspace, remote } = createRemoteGitWorkspace('ahp-sync-push');
		commitFile(workspace, 'outgoing.txt', 'outgoing\n', 'add outgoing');
		const sessionUri = await createSessionIn(workspace, 'sync-push');
		const changeset = buildUncommittedChangesetUri(sessionUri);
		await waitForOperation(changeset, 'sync');

		const invoked = await invokeChangesetOperation(changeset, 'sync');
		await waitForOperationRemoved(changeset, 'sync');
		const localHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
		const remoteHead = execFileSync('git', ['--git-dir', remote, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

		assert.deepStrictEqual({
			message: typeof invoked.result.message === 'string' ? invoked.result.message : invoked.result.message?.markdown,
			statuses: invoked.statuses,
			remoteMatchesLocal: remoteHead === localHead,
		}, {
			message: 'Synced changes.',
			statuses: ['running', 'idle'],
			remoteMatchesLocal: true,
		});
	});

	conformanceTest(context, 'sync pulls a non-conflicting remote commit before pushing', async function () {
		const { workspace, remote } = createRemoteGitWorkspace('ahp-sync-diverged');
		commitFile(workspace, 'outgoing.txt', 'outgoing\n', 'add outgoing');
		pushRemoteCommit(remote, 'ahp-sync-diverged', 'incoming.txt', 'incoming\n');
		const sessionUri = await createSessionIn(workspace, 'sync-diverged');
		const changeset = buildUncommittedChangesetUri(sessionUri);
		await waitForOperation(changeset, 'sync');

		await invokeChangesetOperation(changeset, 'sync');
		const localHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
		const remoteHead = execFileSync('git', ['--git-dir', remote, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

		assert.deepStrictEqual({
			incoming: readFileSync(join(workspace, 'incoming.txt'), 'utf8').replaceAll('\r\n', '\n'),
			outgoing: readFileSync(join(workspace, 'outgoing.txt'), 'utf8').replaceAll('\r\n', '\n'),
			remoteMatchesLocal: remoteHead === localHead,
		}, {
			incoming: 'incoming\n',
			outgoing: 'outgoing\n',
			remoteMatchesLocal: true,
		});
	});

	conformanceTest(context, 'sync reports an error when its upstream becomes unreachable', async function () {
		const { workspace } = createRemoteGitWorkspace('ahp-sync-failure');
		commitFile(workspace, 'outgoing.txt', 'outgoing\n', 'add outgoing');
		const sessionUri = await createSessionIn(workspace, 'sync-failure');
		const changeset = buildUncommittedChangesetUri(sessionUri);
		await waitForOperation(changeset, 'sync');
		execFileSync('git', ['remote', 'set-url', 'origin', join(workspace, 'missing-remote')], { cwd: workspace });
		context.client.clearReceived();
		const failed = context.client.waitForNotification(n =>
			isActionNotification(n, 'changeset/operationStatusChanged')
			&& getActionEnvelope(n).channel === changeset
			&& (getActionEnvelope(n).action as IOperationStatusChangedAction).operationId === 'sync'
			&& (getActionEnvelope(n).action as IOperationStatusChangedAction).status === 'error',
			CHANGESET_OPERATION_TIMEOUT_MS,
		);

		await assert.rejects(context.client.call('invokeChangesetOperation', {
			channel: changeset,
			operationId: 'sync',
		}, CHANGESET_OPERATION_TIMEOUT_MS), /Failed to sync changes/);
		await failed;
		const statuses = context.client.receivedNotifications(n =>
			isActionNotification(n, 'changeset/operationStatusChanged')
			&& getActionEnvelope(n).channel === changeset,
		).map(n => getActionEnvelope(n).action as IOperationStatusChangedAction)
			.filter(action => action.operationId === 'sync')
			.map(action => action.status);

		assert.deepStrictEqual({
			statuses,
			outgoingPreserved: readFileSync(join(workspace, 'outgoing.txt'), 'utf8').replaceAll('\r\n', '\n'),
		}, {
			statuses: ['running', 'error'],
			outgoingPreserved: 'outgoing\n',
		});
	});

	conformanceTest(context, 'discarding a tracked change restores the file and reports operation status', async function () {
		const { workspace, changeset, file } = await createModifiedUncommittedChangeset('changeset-discard');
		const resource = file.edit.after?.uri;
		assert.ok(resource);
		context.client.clearReceived();
		const completed = context.client.waitForNotification(n =>
			isActionNotification(n, 'changeset/operationStatusChanged')
			&& getActionEnvelope(n).channel === changeset
			&& (getActionEnvelope(n).action as { operationId: string; status: string }).operationId === 'discard-changes'
			&& (getActionEnvelope(n).action as { operationId: string; status: string }).status === 'idle',
		);

		await context.client.call('invokeChangesetOperation', {
			channel: changeset,
			operationId: 'discard-changes',
			target: { kind: ChangesetOperationTargetKind.Resource, resource },
		});
		await completed;

		const statuses = context.client.receivedNotifications(n =>
			isActionNotification(n, 'changeset/operationStatusChanged')
			&& getActionEnvelope(n).channel === changeset,
		).map(n => getActionEnvelope(n).action as { operationId: string; status: string })
			.filter(action => action.operationId === 'discard-changes')
			.map(action => action.status);
		assert.deepStrictEqual({
			contents: readFileSync(join(workspace, 'seed.txt'), 'utf8').replaceAll('\r\n', '\n'),
			statuses,
		}, {
			contents: 'seed\n',
			statuses: ['running', 'idle'],
		});
	});

	// The operation is advertised but currently fails for untracked paths; see KNOWN_ISSUES.md.
	conformanceTest(context, 'discarding an untracked file removes it from disk', async function () {
		const workspace = createGitWorkspace('ahp-changeset-discard-added-');
		const sessionUri = await createSessionIn(workspace, 'changeset-discard-added');
		const changeset = buildUncommittedChangesetUri(sessionUri);
		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: changeset });
		const initialOperations = ((subscribed.snapshot!.state as { operations?: readonly IObservedOperation[] }).operations ?? []);
		await runBangTurn(sessionUri, 'turn-changeset-discard-added', writeFileCommand('untracked.txt', 'untracked'), 1);
		const [file] = await waitForChangesetFiles(changeset, ['untracked.txt']);
		await waitForIdleResourceOnlyOperation(changeset, 'discard-changes', initialOperations);

		const statuses = await invokeDiscard(changeset, fileUri(file));

		assert.deepStrictEqual({
			exists: existsSync(join(workspace, 'untracked.txt')),
			statuses,
		}, {
			exists: false,
			statuses: ['running', 'idle'],
		});
	}, false);

	conformanceTest(context, 'discarding a deleted tracked file restores its contents', async function () {
		const workspace = createGitWorkspace('ahp-changeset-discard-deleted-');
		const sessionUri = await createSessionIn(workspace, 'changeset-discard-deleted');
		const changeset = buildUncommittedChangesetUri(sessionUri);
		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: changeset });
		const initialOperations = ((subscribed.snapshot!.state as { operations?: readonly IObservedOperation[] }).operations ?? []);
		await runBangTurn(sessionUri, 'turn-changeset-discard-deleted', deleteFileCommand('seed.txt'), 1);
		const [file] = await waitForChangesetFiles(changeset, ['seed.txt']);
		await waitForIdleResourceOnlyOperation(changeset, 'discard-changes', initialOperations);

		const statuses = await invokeDiscard(changeset, fileUri(file));

		assert.deepStrictEqual({
			contents: readFileSync(join(workspace, 'seed.txt'), 'utf8').replaceAll('\r\n', '\n'),
			statuses,
		}, {
			contents: 'seed\n',
			statuses: ['running', 'idle'],
		});
	});

	// The Windows changeset does not refresh after the resource-scoped discard completes.
	conformanceTest(context, 'discarding one file preserves sibling changes', async function () {
		const workspace = createGitWorkspace('ahp-changeset-discard-one-');
		writeFileSync(join(workspace, 'first.txt'), 'original first\n');
		writeFileSync(join(workspace, 'second.txt'), 'original second\n');
		execSync('git add .', { cwd: workspace });
		execSync('git commit -q -m "sibling seed"', { cwd: workspace });
		const sessionUri = await createSessionIn(workspace, 'changeset-discard-one');
		const changeset = buildUncommittedChangesetUri(sessionUri);
		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: changeset });
		const initialOperations = ((subscribed.snapshot!.state as { operations?: readonly IObservedOperation[] }).operations ?? []);
		await runBangTurn(
			sessionUri,
			'turn-changeset-discard-one',
			'!node -e "const fs=require(\'fs\');fs.writeFileSync(\'first.txt\',\'changed first\');fs.writeFileSync(\'second.txt\',\'changed second\')"',
			1,
		);
		const [first] = await waitForChangesetFiles(changeset, ['first.txt', 'second.txt']);
		await waitForIdleResourceOnlyOperation(changeset, 'discard-changes', initialOperations);

		await invokeDiscard(changeset, fileUri(first));
		const state = await retry(async () => {
			const result = await changesetState(changeset);
			if (result.files.some(file => fileUri(file).endsWith('/first.txt')) || !result.files.some(file => fileUri(file).endsWith('/second.txt'))) {
				throw new Error('Changeset has not refreshed after discard');
			}
			return result;
		}, 100, 100);

		assert.deepStrictEqual({
			firstExists: existsSync(join(workspace, 'first.txt')),
			secondExists: existsSync(join(workspace, 'second.txt')),
			files: state.files.map(file => URI.parse(fileUri(file)).path.split('/').at(-1)),
		}, {
			firstExists: true,
			secondExists: true,
			files: ['second.txt'],
		});
		assert.strictEqual(readFileSync(join(workspace, 'first.txt'), 'utf8').replaceAll('\r\n', '\n'), 'original first\n');
	}, !context.isWindows);

	conformanceTest(context, 'review state can be applied to multiple changed files', async function () {
		const workspace = createGitWorkspace('ahp-changeset-review-multiple-');
		const sessionUri = await createSessionIn(workspace, 'changeset-review-multiple');
		const changeset = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: changeset });
		await runBangTurn(
			sessionUri,
			'turn-changeset-review-multiple',
			'!node -e "const fs=require(\'fs\');fs.writeFileSync(\'first.txt\',\'first\');fs.writeFileSync(\'second.txt\',\'second\')"',
			1,
		);
		const files = await waitForChangesetFiles(changeset, ['first.txt', 'second.txt']);

		context.client.clearReceived();
		context.client.dispatch({
			channel: changeset,
			clientSeq: nextClientSeq(),
			action: { type: ActionType.ChangesetFilesReviewChanged, files: files.map(file => file.id), reviewed: true },
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'changeset/filesReviewChanged') && getActionEnvelope(n).channel === changeset,
		);
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'changeset/statusChanged')
			&& getActionEnvelope(n).channel === changeset
			&& (getActionEnvelope(n).action as { readonly status: string }).status === 'ready',
		);
		const state = await changesetState(changeset);

		assert.deepStrictEqual(state.files.map(file => file.reviewed), [true, true]);
	});

	conformanceTest(context, 'a client can clear review state from a changed file', async function () {
		const workspace = createGitWorkspace('ahp-changeset-review-unset-');
		const sessionUri = await createSessionIn(workspace, 'changeset-review-unset');
		const changeset = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: changeset });
		await runBangTurn(sessionUri, 'turn-changeset-review-unset', writeFileCommand('seed.txt', 'edited'), 1);
		const [file] = await waitForChangesetFiles(changeset, ['seed.txt']);

		context.client.dispatch({
			channel: changeset,
			clientSeq: nextClientSeq(),
			action: { type: ActionType.ChangesetFilesReviewChanged, files: [file.id], reviewed: true },
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'changeset/filesReviewChanged') && getActionEnvelope(n).channel === changeset,
		);
		context.client.clearReceived();
		context.client.dispatch({
			channel: changeset,
			clientSeq: nextClientSeq(),
			action: { type: ActionType.ChangesetFilesReviewChanged, files: [file.id], reviewed: false },
		});
		await context.client.waitForNotification(n =>
			isActionNotification(n, 'changeset/filesReviewChanged') && getActionEnvelope(n).channel === changeset,
		);

		const state = await changesetState(changeset);
		assert.strictEqual(state.files.find(candidate => candidate.id === file.id)?.reviewed, false);
	});

	// Repeated edits currently leave the first ready diff in place; see KNOWN_ISSUES.md.
	conformanceTest(context, 'a second edit updates one changeset entry in place', async function () {
		const workspace = createGitWorkspace('ahp-changeset-second-edit-');
		const sessionUri = await createSessionIn(workspace, 'changeset-second-edit');
		const changeset = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: changeset });
		await runBangTurn(
			sessionUri,
			'turn-changeset-second-edit-first',
			'!node -e "require(\'fs\').writeFileSync(\'seed.txt\',\'first\\nsecond\\n\')"',
			1,
		);
		const [first] = await waitForChangesetFiles(changeset, ['seed.txt']);
		await runBangTurn(
			sessionUri,
			'turn-changeset-second-edit-second',
			'!node -e "require(\'fs\').writeFileSync(\'seed.txt\',\'first\\nsecond\\nthird\\n\')"',
			2,
		);
		const second = await retry(async () => {
			const [candidate] = await waitForChangesetFiles(changeset, ['seed.txt']);
			if (candidate.edit.diff?.added !== 3) {
				throw new Error('Changeset has not incorporated the second edit');
			}
			return candidate;
		}, 100, 100);
		const state = await changesetState(changeset);

		assert.deepStrictEqual({
			fileCount: state.files.length,
			sameIdentity: first.id === second.id,
			diff: second.edit.diff,
		}, {
			fileCount: 1,
			sameIdentity: true,
			diff: { added: 3, removed: 1 },
		});
	}, false);

	conformanceTest(context, 'a nested untracked file retains its workspace-relative identity', async function () {
		const workspace = createGitWorkspace('ahp-changeset-nested-');
		const sessionUri = await createSessionIn(workspace, 'changeset-nested');
		const changeset = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: changeset });
		await runBangTurn(
			sessionUri,
			'turn-changeset-nested',
			'!node -e "const fs=require(\'fs\');fs.mkdirSync(\'nested\',{recursive:true});fs.writeFileSync(\'nested/added.txt\',\'nested\')"',
			1,
		);
		const [file] = await waitForChangesetFiles(changeset, ['added.txt']);

		assert.deepStrictEqual({
			path: URI.parse(file.edit.after!.uri).path.endsWith('/nested/added.txt'),
			hasBefore: file.edit.before !== undefined,
			diff: file.edit.diff,
		}, {
			path: true,
			hasBefore: false,
			diff: { added: 1, removed: 0 },
		});
	});

	// Windows restores the file but leaves both changesets and the list summary stale.
	conformanceTest(context, 'discarding the last tracked change clears changeset and list summaries', async function () {
		const workspace = createGitWorkspace('ahp-changeset-discard-last-');
		const sessionUri = await createSessionIn(workspace, 'changeset-discard-last');
		const branchChangeset = buildBranchChangesetUri(sessionUri);
		const uncommittedChangeset = buildUncommittedChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchChangeset });
		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: uncommittedChangeset });
		const initialOperations = ((subscribed.snapshot!.state as { operations?: readonly IObservedOperation[] }).operations ?? []);
		await runBangTurn(sessionUri, 'turn-changeset-discard-last', writeFileCommand('seed.txt', 'edited'), 1);
		await waitForChangesetFiles(branchChangeset, ['seed.txt']);
		const [file] = await waitForChangesetFiles(uncommittedChangeset, ['seed.txt']);
		await waitForIdleResourceOnlyOperation(uncommittedChangeset, 'discard-changes', initialOperations);

		await invokeDiscard(uncommittedChangeset, fileUri(file));
		await retry(async () => {
			const branch = await changesetState(branchChangeset);
			const uncommitted = await changesetState(uncommittedChangeset);
			const sessions = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
			assert.deepStrictEqual({
				branchFiles: branch.files.length,
				uncommittedFiles: uncommitted.files.length,
				summary: sessions.items.find(item => item.resource === sessionUri)?.changes,
			}, {
				branchFiles: 0,
				uncommittedFiles: 0,
				summary: { additions: 0, deletions: 0, files: 0 },
			});
		}, 100, 100);
	}, !context.isWindows);

	conformanceTest(context, 'listSessions reports the aggregate file change summary', async function () {
		const workspace = createGitWorkspace('ahp-changeset-list-summary-');
		const sessionUri = await createSessionIn(workspace, 'changeset-list-summary');
		const branchUri = buildBranchChangesetUri(sessionUri);
		await context.client.call<SubscribeResult>('subscribe', { channel: branchUri });
		await runBangTurn(
			sessionUri,
			'turn-changeset-list-summary',
			'!node -e "const fs=require(\'fs\');fs.writeFileSync(\'seed.txt\',\'edited\');fs.writeFileSync(\'added.txt\',\'added\')"',
			1,
		);
		await waitForChangesetFiles(branchUri, ['seed.txt', 'added.txt']);

		const changes = await retry(async () => {
			const result = await context.client.call<ListSessionsResult>('listSessions', { channel: ROOT_STATE_URI });
			const summary = result.items.find(item => item.resource === sessionUri)?.changes;
			if (!summary || summary.files !== 2) {
				throw new Error('Session list has not received the changes summary');
			}
			return summary;
		}, 100, 100);

		assert.deepStrictEqual(changes, { additions: 2, deletions: 1, files: 2 });
	});

	conformanceTest(context, 'invoking an unknown changeset operation is rejected', async function () {
		const { changeset } = await createModifiedUncommittedChangeset('changeset-unknown-operation');

		await assert.rejects(context.client.call('invokeChangesetOperation', {
			channel: changeset,
			operationId: 'unknown-operation',
		}));
	});

	conformanceTest(context, 'changeset operation rejects a target outside its advertised scopes', async function () {
		const { changeset } = await createModifiedUncommittedChangeset('changeset-invalid-scope');

		await assert.rejects(context.client.call('invokeChangesetOperation', {
			channel: changeset,
			operationId: 'discard-changes',
		}));
	});

	conformanceTest(context, 'a new session advertises its initial changeset catalog on a separate channel', async function () {
		const workspace = createGitWorkspace('ahp-changeset-catalog-');
		const sessionUri = await createSessionIn(workspace, 'changeset-catalog');

		const session = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		const changesets = (session.snapshot!.state as SessionState).changesets ?? [];
		const advertisedChannels = changesets.map(changeset => changeset.uriTemplate).filter(uri => !uri.includes('{'));
		const subscribed = await Promise.all(advertisedChannels.map(channel =>
			context.client.call<SubscribeResult>('subscribe', { channel })
		));

		assert.deepStrictEqual({
			catalog: changesets.map(changeset => ({
				changeKind: changeset.changeKind,
				uriTemplate: changeset.uriTemplate,
				canReview: changeset.capabilities?.review !== undefined,
			})),
			subscribedChannels: subscribed.map(result => result.snapshot!.resource),
		}, {
			catalog: [{
				changeKind: ChangesetKind.Uncommitted,
				uriTemplate: buildUncommittedChangesetUri(sessionUri),
				canReview: false,
			}],
			subscribedChannels: advertisedChannels,
		});
	});

	conformanceTest(context, 'a per-turn changeset reports a file created in that turn', async function () {
		const workspace = createGitWorkspace('ahp-turn-changeset-add-');
		const sessionUri = await createWorktreeSessionIn(workspace, 'turn-changeset-add');
		await runBangTurn(sessionUri, 'turn-add', writeFileCommand('turn-added.txt', 'ADDED'), 1);

		const state = await changesetState(buildTurnChangesetUri(sessionUri, 'turn-add'));
		const file = state.files.find(file => fileUri(file).endsWith('/turn-added.txt'));

		assert.deepStrictEqual({
			status: state.status,
			hasBefore: file?.edit.before !== undefined,
			hasAfter: file?.edit.after !== undefined,
			diff: file?.edit.diff,
		}, {
			status: 'ready',
			hasBefore: false,
			hasAfter: true,
			diff: { added: 1, removed: 0 },
		});
	}, false);

	conformanceTest(context, 'a per-turn changeset reports an edit to a committed file', async function () {
		const workspace = createGitWorkspace('ahp-turn-changeset-edit-');
		const sessionUri = await createWorktreeSessionIn(workspace, 'turn-changeset-edit');
		await runBangTurn(sessionUri, 'turn-edit', writeFileCommand('seed.txt', 'edited'), 1);

		const state = await changesetState(buildTurnChangesetUri(sessionUri, 'turn-edit'));
		const file = state.files.find(file => fileUri(file).endsWith('/seed.txt'));

		assert.deepStrictEqual({
			status: state.status,
			hasBefore: file?.edit.before !== undefined,
			hasAfter: file?.edit.after !== undefined,
		}, {
			status: 'ready',
			hasBefore: true,
			hasAfter: true,
		});
	}, false);

	conformanceTest(context, 'a per-turn changeset reports a file deleted in that turn', async function () {
		const workspace = createGitWorkspace('ahp-turn-changeset-delete-');
		const sessionUri = await createWorktreeSessionIn(workspace, 'turn-changeset-delete');
		await runBangTurn(sessionUri, 'turn-delete', '!node -e "require(\'fs\').unlinkSync(process.argv[1])" seed.txt', 1);

		const state = await changesetState(buildTurnChangesetUri(sessionUri, 'turn-delete'));
		const file = state.files.find(file => fileUri(file).endsWith('/seed.txt'));

		assert.deepStrictEqual({
			status: state.status,
			hasBefore: file?.edit.before !== undefined,
			hasAfter: file?.edit.after !== undefined,
		}, {
			status: 'ready',
			hasBefore: true,
			hasAfter: false,
		});
	}, false);

	conformanceTest(context, 'a per-turn changeset for a no-op turn is empty and ready', async function () {
		const workspace = createGitWorkspace('ahp-turn-changeset-noop-');
		const sessionUri = await createWorktreeSessionIn(workspace, 'turn-changeset-noop');
		await runBangTurn(sessionUri, 'turn-noop', '/rename No File Changes', 1);

		const state = await changesetState(buildTurnChangesetUri(sessionUri, 'turn-noop'));
		assert.deepStrictEqual({ status: state.status, files: state.files }, { status: 'ready', files: [] });
	});

	conformanceTest(context, 'a per-turn changeset for an unknown turn reports an error', async function () {
		const workspace = createGitWorkspace('ahp-turn-changeset-missing-');
		const sessionUri = await createWorktreeSessionIn(workspace, 'turn-changeset-missing');
		await runBangTurn(sessionUri, 'turn-known', '/rename Known Turn', 1);

		const state = await changesetState(buildTurnChangesetUri(sessionUri, 'missing-turn'));
		assert.strictEqual(state.status, 'error');
	}, false);

	conformanceTest(context, 'comparing a turn with itself produces an empty ready changeset', async function () {
		const workspace = createGitWorkspace('ahp-compare-turns-same-');
		const sessionUri = await createWorktreeSessionIn(workspace, 'compare-turns-same');
		await runBangTurn(sessionUri, 'turn-same', writeFileCommand('same.txt', 'SAME'), 1);

		const state = await changesetState(buildCompareTurnsChangesetUri(sessionUri, 'turn-same', 'turn-same'));
		assert.deepStrictEqual({ status: state.status, files: state.files }, { status: 'ready', files: [] });
	}, false);

	conformanceTest(context, 'comparing two turns reports the changes between their checkpoints', async function () {
		const workspace = createGitWorkspace('ahp-compare-turns-edit-');
		const sessionUri = await createWorktreeSessionIn(workspace, 'compare-turns-edit');
		await runBangTurn(sessionUri, 'turn-first', writeFileCommand('between.txt', 'FIRST'), 1);
		await runBangTurn(sessionUri, 'turn-second', writeFileCommand('between.txt', 'SECOND'), 2);

		const state = await changesetState(buildCompareTurnsChangesetUri(sessionUri, 'turn-first', 'turn-second'));
		const file = state.files.find(file => fileUri(file).endsWith('/between.txt'));
		assert.deepStrictEqual({
			status: state.status,
			hasBefore: file?.edit.before !== undefined,
			hasAfter: file?.edit.after !== undefined,
		}, {
			status: 'ready',
			hasBefore: true,
			hasAfter: true,
		});
	}, false);

	conformanceTest(context, 'comparing with an unknown turn reports an error', async function () {
		const workspace = createGitWorkspace('ahp-compare-turns-missing-');
		const sessionUri = await createWorktreeSessionIn(workspace, 'compare-turns-missing');
		await runBangTurn(sessionUri, 'turn-known', writeFileCommand('known.txt', 'KNOWN'), 1);

		const state = await changesetState(buildCompareTurnsChangesetUri(sessionUri, 'missing-turn', 'turn-known'));
		assert.strictEqual(state.status, 'error');
	});

	conformanceTest(context, 'a materialized git session advertises turn and compare changeset templates', async function () {
		const workspace = createGitWorkspace('ahp-changeset-template-catalog-');
		const sessionUri = await createWorktreeSessionIn(workspace, 'changeset-template-catalog');
		await runBangTurn(sessionUri, 'turn-materialize', '/rename Materialized', 1);

		const session = await context.client.call<SubscribeResult>('subscribe', { channel: sessionUri });
		const kinds = ((session.snapshot!.state as SessionState).changesets ?? []).map(changeset => changeset.changeKind);

		assert.deepStrictEqual({
			hasTurn: kinds.includes(ChangesetKind.Turn),
			hasCompare: kinds.includes(ChangesetKind.Compare),
		}, {
			hasTurn: true,
			hasCompare: true,
		});
	}, false);

	if (context.tier === 'parity') {
		(config.supportsMultipleChats && config.streamingFileCreateToolName ? test : test.skip)('session changeset aggregates provider edits from default and peer chats', async function () {
			this.timeout(240_000);
			const workspace = createGitWorkspace(`ahp-provider-session-changeset-${config.provider}-`);
			const sessionUri = await createSessionIn(workspace, 'provider-session-changeset');
			const peerUri = buildChatUri(sessionUri, generateUuid());
			await context.client.call('createChat', { channel: sessionUri, chat: peerUri, title: 'Changes Peer' });
			await context.client.call<SubscribeResult>('subscribe', { channel: peerUri });
			const sessionChangeset = buildSessionChangesetUri(sessionUri);
			await context.client.call<SubscribeResult>('subscribe', { channel: sessionChangeset });

			await driveTurnToCompletion(
				context.client,
				sessionUri,
				'turn-provider-default-edit',
				'Create default-provider.txt containing exactly DEFAULT_PROVIDER using your file creation tool; do not run a shell command. Then reply exactly "created".',
				1,
			);
			const approval = startBackgroundApprovalLoop(context.client, {
				approvalSeqStart: 100,
				allow: [{ toolName: config.streamingFileCreateToolName! }],
			});
			try {
				context.client.dispatch({
					channel: peerUri,
					clientSeq: 10,
					action: {
						type: ActionType.ChatTurnStarted,
						turnId: 'turn-provider-peer-edit',
						startedAt: '2025-01-01T00:00:00.000Z',
						message: {
							text: 'Create peer-provider.txt containing exactly PEER_PROVIDER using your file creation tool; do not run a shell command. Then reply exactly "created".',
							origin: { kind: MessageKind.User },
						},
					},
				});
				await context.client.waitForNotification(n =>
					isActionNotification(n, 'chat/turnComplete')
					&& getActionEnvelope(n).channel === peerUri
					&& (getActionEnvelope(n).action as { readonly turnId: string }).turnId === 'turn-provider-peer-edit',
					90_000,
				);
			} finally {
				await approval.stop();
			}
			assert.deepStrictEqual(approval.errors, []);

			const files = await retry(async () => {
				const state = await changesetState(sessionChangeset);
				const matches = ['default-provider.txt', 'peer-provider.txt'].map(name => state.files.find(file => fileUri(file).endsWith(`/${name}`)));
				if (matches.some(match => !match)) {
					throw new Error('Session changeset has not aggregated both provider chats');
				}
				return matches;
			}, 100, 100);

			assert.deepStrictEqual(files.map(file => URI.parse(fileUri(file!)).path.split('/').at(-1)).sort(), [
				'default-provider.txt',
				'peer-provider.txt',
			]);
		});
	}
}
