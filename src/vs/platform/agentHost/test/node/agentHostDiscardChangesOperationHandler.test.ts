/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { constObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { NullLogService } from '../../../log/common/log.js';
import type { ITrackedEditSource, ITrackedTurnDatabase } from '../../common/agentHostChangesetService.js';
import { EMPTY_TREE_OBJECT, type IAgentHostGitService, type IBranch, type IDefaultBranch } from '../../common/agentHostGitService.js';
import { buildBranchChangesetUri, buildCompareTurnsChangesetUri, buildSessionChangesetUri, buildTurnChangesetUri, buildUncommittedChangesetUri, buildWorkingSetChangesetUri, ChangesetKind } from '../../common/changesetUri.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationParams } from '../../common/state/protocol/channels-changeset/commands.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AHP_SESSION_NOT_FOUND, AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { buildChatUri, buildDefaultChatUri, FileEditKind, MessageKind, SessionStatus, type ISessionFileDiff, type TextRange } from '../../common/state/sessionState.js';
import { AgentHostDiscardChangesOperationHandler } from '../../node/agentHostDiscardChangesOperationHandler.js';
import { AgentHostFileEditCoordinator } from '../../node/agentHostFileEditCoordinator.js';
import { AgentHostDiscardChangesOperationContribution } from '../../node/agentHostDiscardChangesOperationProvider.js';
import { AgentHostFileEditRevert } from '../../node/agentHostFileEditRevert.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { createFileEditAcceptRecord, createPartialFileEditAcceptRecord, isFileEditAcceptRecord } from '../../node/fileEditAccept.js';
import { createFileEditDiscardRecord } from '../../node/fileEditDiscard.js';
import { buildGitBlobUri } from '../../node/gitDiffContent.js';
import { computeSessionDiffs, computeTurnDiffs, computeWorkingSetDiffs } from '../../node/sessionDiffAggregator.js';
import { createNoopChangesetService, encodeString, TestDiffComputeService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { InProcessDiffComputeService } from './inProcessDiffComputeService.js';

class TestGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	readonly restoreCalls: { workingDirectory: string; paths: readonly string[]; options?: { readonly staged?: boolean; readonly ref?: string } }[] = [];
	restoreError: Error | undefined;
	repositoryRoot: URI | undefined = URI.file('/repo');
	readonly repositoryRoots = new Map<string, URI | undefined>();
	untrackedPaths: readonly string[] = [];

	async getCurrentBranch(): Promise<string | undefined> { return undefined; }
	async getHEAD(): Promise<IBranch | undefined> { return undefined; }
	async getDefaultBranch(): Promise<IDefaultBranch | undefined> { return undefined; }
	async getDefaultBranch2(): Promise<IBranch | undefined> { return undefined; }
	async getBranch(): Promise<IBranch | undefined> { return undefined; }
	async getRefs(): Promise<IBranch[]> { return []; }
	async getBranches(): Promise<IBranch[]> { return []; }
	hasGitRoot() { return constObservable(undefined); }
	async getRepositoryRoot(workingDirectory: URI): Promise<URI | undefined> { return this.repositoryRoots.get(workingDirectory.toString()) ?? this.repositoryRoot; }
	async getWorktreeRoots(): Promise<URI[]> { return []; }
	async addWorktree(): Promise<void> { }
	async copyWorktreeIncludeFiles(): Promise<void> { }
	async symlinkWorktreeFolders(): Promise<readonly string[]> { return []; }
	async addExistingWorktree(): Promise<void> { }
	async removeWorktree(): Promise<void> { }
	async branchExists(): Promise<boolean> { return false; }
	async createBranch(): Promise<void> { }
	async checkout(): Promise<void> { }
	async hasUncommittedChanges(): Promise<boolean> { return true; }
	async createStash(): Promise<void> { }
	async commitAll(): Promise<void> { }
	async mergeBranch(): Promise<string> { return ''; }
	async restore(workingDirectory: URI, paths: readonly string[], options?: { readonly staged?: boolean; readonly ref?: string }): Promise<void> {
		this.restoreCalls.push({ workingDirectory: workingDirectory.toString(), paths, options });
		if (this.restoreError) {
			throw this.restoreError;
		}
	}
	async hasUpstream(): Promise<boolean> { return false; }
	async fetch(): Promise<void> { }
	async pull(): Promise<void> { }
	async push(): Promise<void> { }
	async getSessionGitState(): Promise<undefined> { return undefined; }
	async computeSessionFileDiffs(): Promise<readonly ISessionFileDiff[] | undefined> { return undefined; }
	async showBlob(): Promise<undefined> { return undefined; }
	async captureWorkingTreeAsTree(): Promise<undefined> { return undefined; }
	async commitTree(): Promise<undefined> { return undefined; }
	async updateRef(): Promise<void> { }
	async deleteRefs(): Promise<void> { }
	async revParse(): Promise<string | undefined> { return undefined; }
	async resolveBranchBaselineCommit(): Promise<string | undefined> { return undefined; }
	async overlayPathIntoTree(): Promise<string | undefined> { return undefined; }
	async diffTreePaths(): Promise<string[] | undefined> { return undefined; }
	async computeFileDiffsBetweenRefs(): Promise<readonly ISessionFileDiff[] | undefined> { return undefined; }
	async getFetchRemoteUrls(): Promise<undefined> { return undefined; }
	async getFetchRemotes(): Promise<undefined> { return undefined; }
	async getUntrackedPaths(): Promise<readonly string[]> { return this.untrackedPaths; }
	async getBranchDiffSafetyInfo(): Promise<undefined> { return undefined; }
	async getDiffPatchBetweenRefs(): Promise<undefined> { return undefined; }
}

class TestFileService extends mock<IFileService>() {
	readonly deleteCalls: { resource: string; useTrash: boolean }[] = [];
	trashSupported = true;

	override hasCapability(_resource: URI, capability: FileSystemProviderCapabilities): boolean {
		return capability === FileSystemProviderCapabilities.Trash && this.trashSupported;
	}

	override async del(resource: URI, options?: Parameters<IFileService['del']>[1]): Promise<void> {
		this.deleteCalls.push({ resource: resource.toString(), useTrash: options?.useTrash ?? false });
	}
}

function setup(disposables: Pick<DisposableStore, 'add'>, opts?: { readonly withWorkingDirectory?: boolean; readonly workingDirectory?: URI; readonly workingDirectories?: readonly URI[]; readonly registerSession?: boolean; readonly onDiscarded?: (sessionKey: string) => Promise<void> }) {
	const gitService = new TestGitService();
	const fileService = new TestFileService();
	const diskFileService = disposables.add(new FileService(new NullLogService()));
	disposables.add(diskFileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
	const refreshes: string[] = [];
	const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
	const session = URI.parse('agent:/session');
	const workingDirectories = opts?.workingDirectories ?? [opts?.workingDirectory ?? URI.file('/repo')];
	const trackedDb = new TestSessionDatabase();
	const tracked: { database: ITrackedTurnDatabase | undefined } = {
		database: { db: trackedDb, folderScope: workingDirectories, otherChatDatabases: [], dispose: () => { } },
	};
	const trackedSession: { sources: ITrackedEditSource[]; otherChatDatabases: TestSessionDatabase[]; workingDirectories: readonly string[] | undefined; folderScope: readonly URI[] | undefined } = {
		sources: [{ chat: buildDefaultChatUri(session.toString()), storage: session.toString(), db: trackedDb }],
		otherChatDatabases: [],
		workingDirectories: workingDirectories.map(workingDirectory => workingDirectory.toString()),
		folderScope: workingDirectories,
	};
	const discardedTurns: { owner: string; turnIds: readonly string[] }[] = [];
	const fileEditCoordinator = disposables.add(new AgentHostFileEditCoordinator());
	const changesets = createNoopChangesetService();
	changesets.openTrackedTurnDatabase = () => tracked.database;
	changesets.openTrackedSessionDatabases = () => ({ ...trackedSession, dispose: () => { } });
	changesets.onFileEditsDiscarded = (owner, turnIds) => { discardedTurns.push({ owner, turnIds }); };
	if (opts?.registerSession !== false) {
		stateManager.createSession({
			resource: session.toString(),
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
			workingDirectories: opts?.withWorkingDirectory === false ? undefined : workingDirectories.map(workingDirectory => workingDirectory.toString()),
			defaultChat: buildDefaultChatUri(session.toString()),
		});
	}
	const handler = new AgentHostDiscardChangesOperationHandler(
		sessionKey => stateManager.getSessionState(sessionKey),
		async sessionKey => {
			refreshes.push(sessionKey);
			await opts?.onDiscarded?.(sessionKey);
		},
		new AgentHostFileEditRevert(diskFileService, new InProcessDiffComputeService()),
		gitService,
		fileService,
		new NullLogService(),
		stateManager,
		changesets,
		new InProcessDiffComputeService(), fileEditCoordinator,
	);
	return { handler, gitService, fileService, diskFileService, trackedDb, tracked, trackedSession, discardedTurns, stateManager, refreshes, session, fileEditCoordinator };
}

function addChangesetFile(stateManager: AgentHostStateManager, channel: string, edit: ISessionFileDiff): void {
	stateManager.registerChangeset(channel);
	stateManager.dispatchServerAction(channel, {
		type: ActionType.ChangesetFileSet,
		file: {
			id: edit.after?.uri ?? edit.before?.uri ?? 'file',
			edit,
		},
	});
}

function addUncommittedChangesetFile(stateManager: AgentHostStateManager, owner: string, resource: URI): string {
	const channel = buildUncommittedChangesetUri(owner);
	addChangesetFile(stateManager, channel, {
		after: { uri: resource.toString(), content: { uri: resource.toString() } },
	});
	return channel;
}

function makeResourceTarget(resource: URI): InvokeChangesetOperationParams['target'] {
	// `ChangesetOperationTarget.resource` is typed as the protocol `URI` (a
	// branded string), not the workbench `URI` class.
	return { kind: ChangesetOperationTargetKind.Resource, resource: resource.toString() as unknown as InvokeChangesetOperationParams['channel'] };
}

function startTurn(stateManager: AgentHostStateManager, chat: string, turnId: string): void {
	stateManager.dispatchServerAction(chat, {
		type: ActionType.ChatTurnStarted,
		turnId,
		startedAt: new Date(1).toISOString(),
		message: { text: 'Edit files', origin: { kind: MessageKind.User } },
	});
}

function addTurn(stateManager: AgentHostStateManager, chat: string, turnId: string): void {
	startTurn(stateManager, chat, turnId);
	stateManager.dispatchServerAction(chat, { type: ActionType.ChatTurnComplete, turnId, duration: 1 });
}

suite('AgentHostDiscardChangesOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('restores the targeted file on success', async () => {
		const { handler, gitService, fileService, stateManager, refreshes, session } = setup(disposables);
		const target = URI.file('/repo/src/file.ts');
		const owner = buildDefaultChatUri(session.toString());
		const channel = addUncommittedChangesetFile(stateManager, owner, target);

		const result = await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			restoreCalls: gitService.restoreCalls,
			deleteCalls: fileService.deleteCalls,
			refreshes,
			message: result.message,
		}, {
			restoreCalls: [{ workingDirectory: URI.file('/repo').toString(), paths: [target.fsPath], options: undefined }],
			deleteCalls: [],
			refreshes: [owner],
			message: { markdown: 'Discarded changes to `file.ts`.' },
		});
	});

	test('completes the operation without waiting for the Git-state refresh', async () => {
		const finishRefresh = new DeferredPromise<void>();
		let refreshCompleted = false;
		const { handler, stateManager, refreshes, session } = setup(disposables, {
			onDiscarded: async () => {
				await finishRefresh.p;
				refreshCompleted = true;
			},
		});
		const owner = buildDefaultChatUri(session.toString());
		const target = URI.file('/repo/src/file.ts');
		const channel = addUncommittedChangesetFile(stateManager, owner, target);

		// Resolves only if the operation does not wait for the still-pending refresh.
		await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);
		const stateWhenOperationCompleted = { refreshes: [...refreshes], refreshCompleted };
		await finishRefresh.complete();

		assert.deepStrictEqual(stateWhenOperationCompleted, { refreshes: [owner], refreshCompleted: false });
	});

	test('restores and refreshes a peer chat in its working directory', async () => {
		const { handler, gitService, fileService, stateManager, refreshes, session } = setup(disposables);
		const peer = buildChatUri(session.toString(), 'peer');
		const peerRoot = URI.file('/peer-repo');
		stateManager.addChat(session.toString(), peer, creationTimeChatStorageResource(session.toString(), peer, buildDefaultChatUri(session.toString())), { workingDirectories: [peerRoot.toString()] });
		gitService.repositoryRoots.set(peerRoot.toString(), peerRoot);
		const target = URI.file('/peer-repo/src/file.ts');
		const channel = addUncommittedChangesetFile(stateManager, peer, target);

		await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			restoreCalls: gitService.restoreCalls,
			deleteCalls: fileService.deleteCalls,
			refreshes,
		}, {
			restoreCalls: [{ workingDirectory: peerRoot.toString(), paths: [target.fsPath], options: undefined }],
			deleteCalls: [],
			refreshes: [peer],
		});
	});

	test('restores a modified Branch Changes file from its displayed baseline', async () => {
		const { handler, gitService, fileService, stateManager, refreshes, session } = setup(disposables);
		const owner = buildDefaultChatUri(session.toString());
		const channel = buildBranchChangesetUri(owner);
		const target = URI.file('/repo/src/file.ts');
		addChangesetFile(stateManager, channel, {
			before: {
				uri: target.toString(),
				content: { uri: buildGitBlobUri(owner, 'baseline-sha', 'src/file.ts', target.path) },
			},
			after: { uri: target.toString(), content: { uri: target.toString() } },
		});

		const result = await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			restoreCalls: gitService.restoreCalls,
			deleteCalls: fileService.deleteCalls,
			refreshes,
			message: result.message,
		}, {
			restoreCalls: [
				{ workingDirectory: URI.file('/repo').toString(), paths: ['src/file.ts'], options: { staged: true, ref: 'baseline-sha' } },
				{ workingDirectory: URI.file('/repo').toString(), paths: ['src/file.ts'], options: { ref: 'baseline-sha' } },
			],
			deleteCalls: [],
			refreshes: [owner],
			message: { markdown: 'Discarded changes to `file.ts`.' },
		});
	});

	test('deletes a tracked file added in Branch Changes and restores the index to an empty baseline', async () => {
		const { handler, gitService, fileService, stateManager, session } = setup(disposables);
		const owner = buildDefaultChatUri(session.toString());
		const channel = buildBranchChangesetUri(owner);
		const target = URI.file('/repo/src/added.ts');
		addChangesetFile(stateManager, channel, {
			after: { uri: target.toString(), content: { uri: target.toString() } },
		});

		await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			restoreCalls: gitService.restoreCalls,
			deleteCalls: fileService.deleteCalls,
		}, {
			restoreCalls: [{
				workingDirectory: URI.file('/repo').toString(),
				paths: ['src/added.ts'],
				options: { staged: true, ref: EMPTY_TREE_OBJECT },
			}],
			deleteCalls: [{ resource: target.toString(), useTrash: true }],
		});
	});

	test('restores a deleted Branch Changes file from its displayed baseline', async () => {
		const { handler, gitService, fileService, stateManager, session } = setup(disposables);
		const owner = buildDefaultChatUri(session.toString());
		const channel = buildBranchChangesetUri(owner);
		const target = URI.file('/repo/src/deleted.ts');
		addChangesetFile(stateManager, channel, {
			before: {
				uri: target.toString(),
				content: { uri: buildGitBlobUri(owner, 'baseline-sha', 'src/deleted.ts', target.path) },
			},
		});

		await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			restoreCalls: gitService.restoreCalls,
			deleteCalls: fileService.deleteCalls,
		}, {
			restoreCalls: [
				{ workingDirectory: URI.file('/repo').toString(), paths: ['src/deleted.ts'], options: { staged: true, ref: 'baseline-sha' } },
				{ workingDirectory: URI.file('/repo').toString(), paths: ['src/deleted.ts'], options: { ref: 'baseline-sha' } },
			],
			deleteCalls: [],
		});
	});

	test('removes the new path and restores the old path for a renamed Branch Changes file', async () => {
		const { handler, gitService, fileService, stateManager, session } = setup(disposables);
		const owner = buildDefaultChatUri(session.toString());
		const channel = buildBranchChangesetUri(owner);
		const before = URI.file('/repo/src/before.ts');
		const after = URI.file('/repo/src/after.ts');
		addChangesetFile(stateManager, channel, {
			before: {
				uri: before.toString(),
				content: { uri: buildGitBlobUri(owner, 'baseline-sha', 'src/before.ts', before.path) },
			},
			after: { uri: after.toString(), content: { uri: after.toString() } },
		});

		await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(after),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			restoreCalls: gitService.restoreCalls,
			deleteCalls: fileService.deleteCalls,
		}, {
			restoreCalls: [
				{ workingDirectory: URI.file('/repo').toString(), paths: ['src/before.ts'], options: { staged: true, ref: 'baseline-sha' } },
				{ workingDirectory: URI.file('/repo').toString(), paths: ['src/after.ts'], options: { staged: true, ref: EMPTY_TREE_OBJECT } },
				{ workingDirectory: URI.file('/repo').toString(), paths: ['src/before.ts'], options: { ref: 'baseline-sha' } },
			],
			deleteCalls: [{ resource: after.toString(), useTrash: true }],
		});
	});

	test('reverts a case-only rename in Branch Changes as a rename', async () => {
		const { handler, gitService, fileService, stateManager, session } = setup(disposables);
		const owner = buildDefaultChatUri(session.toString());
		const channel = buildBranchChangesetUri(owner);
		const before = URI.file('/repo/src/File.ts');
		const after = URI.file('/repo/src/file.ts');
		addChangesetFile(stateManager, channel, {
			before: {
				uri: before.toString(),
				content: { uri: buildGitBlobUri(owner, 'baseline-sha', 'src/File.ts', before.path) },
			},
			after: { uri: after.toString(), content: { uri: after.toString() } },
		});

		await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(after),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			restoreCalls: gitService.restoreCalls,
			deleteCalls: fileService.deleteCalls,
		}, {
			restoreCalls: [
				{ workingDirectory: URI.file('/repo').toString(), paths: ['src/File.ts'], options: { staged: true, ref: 'baseline-sha' } },
				{ workingDirectory: URI.file('/repo').toString(), paths: ['src/file.ts'], options: { staged: true, ref: EMPTY_TREE_OBJECT } },
				{ workingDirectory: URI.file('/repo').toString(), paths: ['src/File.ts'], options: { ref: 'baseline-sha' } },
			],
			deleteCalls: [{ resource: after.toString(), useTrash: true }],
		});
	});

	test('uses the repository containing the Branch Changes resource in a multi-root session', async () => {
		const firstWorkingDirectory = URI.file('/workspace/first');
		const secondWorkingDirectory = URI.file('/workspace/second');
		const firstRepository = URI.file('/repos/first');
		const secondRepository = URI.file('/repos/second');
		const { handler, gitService, stateManager, session } = setup(disposables, {
			workingDirectories: [firstWorkingDirectory, secondWorkingDirectory],
		});
		gitService.repositoryRoots.set(firstWorkingDirectory.toString(), firstRepository);
		gitService.repositoryRoots.set(secondWorkingDirectory.toString(), secondRepository);
		const owner = buildDefaultChatUri(session.toString());
		const channel = buildBranchChangesetUri(owner);
		const target = URI.file('/repos/second/src/file.ts');
		addChangesetFile(stateManager, channel, {
			before: {
				uri: target.toString(),
				content: { uri: buildGitBlobUri(owner, 'second-baseline', 'src/file.ts', target.path) },
			},
			after: { uri: target.toString(), content: { uri: target.toString() } },
		});

		await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual(gitService.restoreCalls, [
			{ workingDirectory: secondRepository.toString(), paths: ['src/file.ts'], options: { staged: true, ref: 'second-baseline' } },
			{ workingDirectory: secondRepository.toString(), paths: ['src/file.ts'], options: { ref: 'second-baseline' } },
		]);
	});

	test('rejects a resource that is not part of Branch Changes', async () => {
		const { handler, gitService, stateManager, session } = setup(disposables);
		const owner = buildDefaultChatUri(session.toString());
		const channel = buildBranchChangesetUri(owner);
		const changed = URI.file('/repo/src/changed.ts');
		addChangesetFile(stateManager, channel, {
			before: {
				uri: changed.toString(),
				content: { uri: buildGitBlobUri(owner, 'baseline-sha', 'src/changed.ts', changed.path) },
			},
			after: { uri: changed.toString(), content: { uri: changed.toString() } },
		});

		const error = await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(URI.file('/repo/src/other.ts')),
		}, CancellationToken.None).then(undefined, error => error);

		assert.deepStrictEqual({
			code: error.code,
			restoreCalls: gitService.restoreCalls,
		}, {
			code: JsonRpcErrorCodes.InvalidParams,
			restoreCalls: [],
		});
	});

	test('rejects a resource that is not part of Uncommitted Changes', async () => {
		const { handler, gitService, stateManager, session } = setup(disposables);
		const changed = URI.file('/repo/src/changed.ts');
		const channel = addUncommittedChangesetFile(stateManager, session.toString(), changed);

		const error = await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(URI.file('/repo/src/other.ts')),
		}, CancellationToken.None).then(undefined, error => error);

		assert.deepStrictEqual({
			code: error.code,
			restoreCalls: gitService.restoreCalls,
		}, {
			code: JsonRpcErrorCodes.InvalidParams,
			restoreCalls: [],
		});
	});

	test('deletes an untracked file using trash when supported', async () => {
		const { handler, gitService, fileService, stateManager, session } = setup(disposables);
		gitService.untrackedPaths = ['src/new.ts'];
		const target = URI.file('/repo/src/new.ts');
		const channel = addUncommittedChangesetFile(stateManager, session.toString(), target);

		const result = await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			restoreCalls: gitService.restoreCalls,
			deleteCalls: fileService.deleteCalls,
			message: result.message,
		}, {
			restoreCalls: [],
			deleteCalls: [{ resource: target.toString(), useTrash: true }],
			message: { markdown: 'Discarded changes to `new.ts`.' },
		});
	});

	test('deletes an untracked file when Git canonicalizes the repository root', async () => {
		const workingDirectory = URI.file('/var/folders/repo');
		const { handler, gitService, fileService, stateManager, session } = setup(disposables, { workingDirectory });
		gitService.repositoryRoot = URI.file('/private/var/folders/repo');
		gitService.untrackedPaths = ['src/new.ts'];
		const target = URI.file('/private/var/folders/repo/src/new.ts');
		const channel = addUncommittedChangesetFile(stateManager, session.toString(), target);

		await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			restoreCalls: gitService.restoreCalls,
			deleteCalls: fileService.deleteCalls,
		}, {
			restoreCalls: [],
			deleteCalls: [{ resource: target.toString(), useTrash: true }],
		});
	});

	test('deletes an untracked file without trash when unsupported', async () => {
		const { handler, gitService, fileService, stateManager, session } = setup(disposables);
		gitService.untrackedPaths = ['src/new.ts'];
		fileService.trashSupported = false;
		const target = URI.file('/repo/src/new.ts');
		const channel = addUncommittedChangesetFile(stateManager, session.toString(), target);

		await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			restoreCalls: gitService.restoreCalls,
			deleteCalls: fileService.deleteCalls,
		}, {
			restoreCalls: [],
			deleteCalls: [{ resource: target.toString(), useTrash: false }],
		});
	});

	test('rejects changesets that do not support discarding', async () => {
		const { handler, gitService, session } = setup(disposables);
		const target = URI.file('/repo/src/file.ts');

		let err: ProtocolError | undefined;
		try {
			await handler.invoke({
				channel: buildCompareTurnsChangesetUri(buildDefaultChatUri(session.toString()), 'turn-1', 'turn-2'),
				operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
				target: makeResourceTarget(target),
			}, CancellationToken.None);
		} catch (error) {
			err = error as ProtocolError;
		}

		assert.deepStrictEqual({
			code: err?.code,
			restoreCalls: gitService.restoreCalls.length,
		}, {
			code: JsonRpcErrorCodes.InvalidParams,
			restoreCalls: 0,
		});
	});

	test('throws AHP_SESSION_NOT_FOUND when the session is unknown', async () => {
		const { handler, gitService } = setup(disposables, { registerSession: false });
		const session = URI.parse('agent:/missing');
		const target = URI.file('/repo/src/file.ts');

		let err: ProtocolError | undefined;
		try {
			await handler.invoke({
				channel: buildUncommittedChangesetUri(session.toString()),
				operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
				target: makeResourceTarget(target),
			}, CancellationToken.None);
		} catch (error) {
			err = error as ProtocolError;
		}

		assert.deepStrictEqual({
			code: err?.code,
			restoreCalls: gitService.restoreCalls.length,
		}, {
			code: AHP_SESSION_NOT_FOUND,
			restoreCalls: 0,
		});
	});

	test('rejects invocations without a Resource target', async () => {
		const { handler, gitService, session } = setup(disposables);

		let err: ProtocolError | undefined;
		try {
			await handler.invoke({
				channel: buildUncommittedChangesetUri(session.toString()),
				operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			}, CancellationToken.None);
		} catch (error) {
			err = error as ProtocolError;
		}

		assert.deepStrictEqual({
			code: err?.code,
			restoreCalls: gitService.restoreCalls.length,
		}, {
			code: JsonRpcErrorCodes.InvalidParams,
			restoreCalls: 0,
		});
	});

	test('throws InternalError when the session has no working directory', async () => {
		const { handler, gitService, session } = setup(disposables, { withWorkingDirectory: false });
		const target = URI.file('/repo/src/file.ts');

		let err: ProtocolError | undefined;
		try {
			await handler.invoke({
				channel: buildUncommittedChangesetUri(session.toString()),
				operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
				target: makeResourceTarget(target),
			}, CancellationToken.None);
		} catch (error) {
			err = error as ProtocolError;
		}

		assert.deepStrictEqual({
			code: err?.code,
			restoreCalls: gitService.restoreCalls.length,
		}, {
			code: JsonRpcErrorCodes.InternalError,
			restoreCalls: 0,
		});
	});

	test('wraps git restore failures in a ProtocolError without recomputing the changeset', async () => {
		const { handler, gitService, stateManager, session } = setup(disposables);
		gitService.restoreError = new Error('git restore failed');
		const target = URI.file('/repo/src/file.ts');
		const channel = addUncommittedChangesetFile(stateManager, session.toString(), target);

		let err: ProtocolError | undefined;
		try {
			await handler.invoke({
				channel,
				operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
				target: makeResourceTarget(target),
			}, CancellationToken.None);
		} catch (error) {
			err = error as ProtocolError;
		}

		assert.deepStrictEqual({
			code: err?.code,
			messageContainsCause: err?.message.includes('git restore failed'),
			restoreCalls: gitService.restoreCalls.length,
		}, {
			code: JsonRpcErrorCodes.InternalError,
			messageContainsCause: true,
			restoreCalls: 1,
		});
	});

	test('honors cancellation before mutating the repository', async () => {
		const { handler, gitService, session } = setup(disposables);
		const cts = disposables.add(new CancellationTokenSource());
		cts.cancel();
		const target = URI.file('/repo/src/file.ts');

		await assert.rejects(
			() => handler.invoke({
				channel: buildUncommittedChangesetUri(session.toString()),
				operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
				target: makeResourceTarget(target),
			}, cts.token),
			/cancelled/i,
		);

		assert.deepStrictEqual({ restoreCalls: gitService.restoreCalls.length }, { restoreCalls: 0 });
	});
});

suite('AgentHostDiscardChangesOperationHandler - last turn', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const target = URI.file('/repo/src/file.ts');

	async function setupLastTurn(resource = target, workingDirectories?: readonly URI[]) {
		const harness = setup(disposables, { workingDirectories });
		const chat = buildDefaultChatUri(harness.session.toString());
		addTurn(harness.stateManager, chat, 'turn-1');
		harness.trackedDb.addEdit({
			turnId: 'turn-1', toolCallId: 'tc1', filePath: resource.fsPath, kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('a\nb\n'), afterContent: encodeString('a\nB\n'),
		});
		await harness.diskFileService.writeFile(resource, VSBuffer.fromString('a\nB\n'));
		return { ...harness, chat, channel: buildTurnChangesetUri(chat, 'turn-1') };
	}

	test('reverts the turn\'s edits to the file and records the discard', async () => {
		const { handler, diskFileService, trackedDb, discardedTurns, refreshes, chat, channel } = await setupLastTurn();

		const result = await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			content: (await diskFileService.readFile(target)).value.toString(),
			turnDiffs: await computeTurnDiffs('agent:/session', trackedDb, new TestDiffComputeService(), 'turn-1'),
			discardedTurns,
			refreshes,
			message: result.message,
		}, {
			content: 'a\nb\n',
			turnDiffs: [],
			discardedTurns: [{ owner: chat, turnIds: ['turn-1'] }],
			refreshes: [chat],
			message: { markdown: 'Discarded the last turn\'s changes to `file.ts`.' },
		});
	});

	test('deletes a file the last turn created and records the discard', async () => {
		const harness = setup(disposables);
		const chat = buildDefaultChatUri(harness.session.toString());
		addTurn(harness.stateManager, chat, 'turn-1');
		harness.trackedDb.addEdit({
			turnId: 'turn-1', toolCallId: 'tc1', filePath: target.fsPath, kind: FileEditKind.Create,
			addedLines: undefined, removedLines: undefined,
			beforeContent: undefined, afterContent: encodeString('new\n'),
		});
		await harness.diskFileService.writeFile(target, VSBuffer.fromString('new\n'));

		const result = await harness.handler.invoke({
			channel: buildTurnChangesetUri(chat, 'turn-1'),
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		const diffService = new TestDiffComputeService();
		assert.deepStrictEqual({
			exists: await harness.diskFileService.exists(target),
			turnDiffs: await computeTurnDiffs('agent:/session', harness.trackedDb, diffService, 'turn-1'),
			sessionDiffs: await computeSessionDiffs('agent:/session', harness.trackedDb, diffService),
			discardRows: (await harness.trackedDb.getAllFileEdits()).slice(1).map(row => row.kind),
			discardedTurns: harness.discardedTurns,
			message: result.message,
		}, {
			exists: false,
			turnDiffs: [],
			sessionDiffs: [],
			discardRows: [FileEditKind.Delete],
			discardedTurns: [{ owner: chat, turnIds: ['turn-1'] }],
			message: { markdown: 'Discarded the last turn\'s changes to `file.ts`.' },
		});
	});

	for (const deletedByAnotherActor of [false, true]) {
		test(`rolls back only its own deletion when recording a created-file discard fails (external deletion: ${deletedByAnotherActor})`, async () => {
			const { handler, diskFileService, trackedDb, stateManager, session } = setup(disposables);
			const chat = buildDefaultChatUri(session.toString());
			addTurn(stateManager, chat, 'turn-1');
			trackedDb.addEdit({
				turnId: 'turn-1', toolCallId: 'tc1', filePath: target.fsPath, kind: FileEditKind.Create,
				addedLines: undefined, removedLines: undefined,
				beforeContent: undefined, afterContent: encodeString('new\n'),
			});
			await diskFileService.writeFile(target, VSBuffer.fromString('new\n'));
			trackedDb.storeFileEdits = async (_edits, beforeCommit) => {
				if (deletedByAnotherActor) {
					await diskFileService.del(target);
				}
				await beforeCommit?.((toolCallId, filePath) => trackedDb.readFileEditContent(toolCallId, filePath));
				throw new Error('commit failed');
			};

			await assert.rejects(() => handler.invoke({
				channel: buildTurnChangesetUri(chat, 'turn-1'),
				operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
				target: makeResourceTarget(target),
			}, CancellationToken.None), /commit failed/);

			const content = await diskFileService.exists(target) ? (await diskFileService.readFile(target)).value.toString() : undefined;
			assert.deepStrictEqual({ content, recordedEdits: (await trackedDb.getAllFileEdits()).length }, {
				content: deletedByAnotherActor ? undefined : 'new\n',
				recordedEdits: 1,
			});
		});
	}

	test('rejects requests it can not apply without changing the file', async () => {
		const cases: Record<string, (harness: Awaited<ReturnType<typeof setupLastTurn>>) => Promise<{ channel?: string; target?: URI | null }>> = {
			missingTarget: async () => ({ target: null }),
			olderTurn: async ({ stateManager, chat }) => { addTurn(stateManager, chat, 'turn-2'); return {}; },
			turnInProgress: async ({ stateManager, chat }) => { startTurn(stateManager, chat, 'turn-2'); return {}; },
			runningTurnTargeted: async ({ stateManager, chat }) => { startTurn(stateManager, chat, 'turn-2'); return { channel: buildTurnChangesetUri(chat, 'turn-2') }; },
			fileNotInTurn: async () => ({ target: URI.file('/repo/src/other.ts') }),
			turnInSeveralChats: async ({ tracked }) => { tracked.database = undefined; return {}; },
			// Session Changes can't order one chat's discard against another chat's edits.
			editedByAnotherChat: async ({ tracked }) => {
				const otherChatDb = new TestSessionDatabase();
				otherChatDb.addEdit({
					turnId: 'peer-turn-1', toolCallId: 'ptc1', filePath: target.fsPath, kind: FileEditKind.Edit,
					addedLines: undefined, removedLines: undefined,
					beforeContent: encodeString('a\nB\n'), afterContent: encodeString('a\nB\nc\n'),
				});
				tracked.database = { ...tracked.database!, otherChatDatabases: [otherChatDb] };
				return {};
			},
			editedSameLinesAfterTurn: async ({ diskFileService }) => { await diskFileService.writeFile(target, VSBuffer.fromString('a\nBB\n')); return {}; },
			recordingFails: async ({ trackedDb }) => {
				trackedDb.storeFileEdits = async () => { throw new Error('database closed'); };
				return {};
			},
			// The file is put back when the discard can't be committed after the file changed.
			commitFails: async ({ trackedDb }) => {
				trackedDb.storeFileEdits = async (_edits, beforeCommit) => {
					await beforeCommit?.((toolCallId, filePath) => trackedDb.readFileEditContent(toolCallId, filePath));
					throw new Error('commit failed');
				};
				return {};
			},
			turnStartedWhileRecording: async ({ trackedDb, stateManager, chat }) => {
				const storeFileEdits = trackedDb.storeFileEdits.bind(trackedDb);
				trackedDb.storeFileEdits = (edits, beforeCommit) => storeFileEdits(edits, async readContent => {
					startTurn(stateManager, chat, 'turn-2');
					await beforeCommit?.(readContent);
				});
				return {};
			},
			turnStartedWhileComputing: async ({ trackedDb, stateManager, chat }) => {
				const readFileEditContent = trackedDb.readFileEditContent.bind(trackedDb);
				trackedDb.readFileEditContent = (toolCallId, filePath) => {
					startTurn(stateManager, chat, 'turn-2');
					return readFileEditContent(toolCallId, filePath);
				};
				return {};
			},
			// The content is written, but resolving the file afterwards fails.
			writeFailsAfterWriting: async ({ diskFileService }) => {
				const writeFile = diskFileService.writeFile.bind(diskFileService);
				let failed = false;
				diskFileService.writeFile = async (resource, content, options) => {
					const stat = await writeFile(resource, content, options);
					if (!failed) {
						failed = true;
						throw new Error('stat failed');
					}
					return stat;
				};
				return {};
			},
		};

		const results: Record<string, unknown> = {};
		for (const [name, arrange] of Object.entries(cases)) {
			const harness = await setupLastTurn();
			const overrides = await arrange(harness);
			const contentBefore = (await harness.diskFileService.readFile(target)).value.toString();
			let error: ProtocolError | undefined;
			try {
				await harness.handler.invoke({
					channel: overrides.channel ?? harness.channel,
					operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
					target: overrides.target === null ? undefined : makeResourceTarget(overrides.target ?? target),
				}, CancellationToken.None);
			} catch (e) {
				error = e as ProtocolError;
			}
			results[name] = {
				code: error?.code,
				unchanged: (await harness.diskFileService.readFile(target)).value.toString() === contentBefore,
				recordedEdits: (await harness.trackedDb.getAllFileEdits()).length,
				discardedTurns: harness.discardedTurns.length,
			};
		}

		const rejected = (code: number) => ({ code, unchanged: true, recordedEdits: 1, discardedTurns: 0 });
		// A changeset computed while the discard was being recorded may include the rolled back row.
		const rolledBack = (code: number) => ({ ...rejected(code), discardedTurns: 1 });
		assert.deepStrictEqual(results, {
			missingTarget: rejected(JsonRpcErrorCodes.InvalidParams),
			olderTurn: rejected(JsonRpcErrorCodes.InvalidParams),
			turnInProgress: rejected(JsonRpcErrorCodes.InvalidParams),
			runningTurnTargeted: rejected(JsonRpcErrorCodes.InvalidParams),
			fileNotInTurn: rejected(JsonRpcErrorCodes.InvalidParams),
			turnInSeveralChats: rejected(JsonRpcErrorCodes.InvalidParams),
			editedByAnotherChat: rejected(JsonRpcErrorCodes.InvalidParams),
			editedSameLinesAfterTurn: rejected(JsonRpcErrorCodes.InternalError),
			recordingFails: rolledBack(JsonRpcErrorCodes.InternalError),
			commitFails: rolledBack(JsonRpcErrorCodes.InternalError),
			turnStartedWhileRecording: rolledBack(JsonRpcErrorCodes.InvalidParams),
			turnStartedWhileComputing: rolledBack(JsonRpcErrorCodes.InvalidParams),
			writeFailsAfterWriting: rolledBack(JsonRpcErrorCodes.InternalError),
		});
	});

	test('keeps an edit the user made between two of the turn\'s tool calls', async () => {
		const harness = setup(disposables);
		const chat = buildDefaultChatUri(harness.session.toString());
		addTurn(harness.stateManager, chat, 'turn-1');
		const edit = (toolCallId: string, before: string, after: string) => harness.trackedDb.addEdit({
			turnId: 'turn-1', toolCallId, filePath: target.fsPath, kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString(before), afterContent: encodeString(after),
		});
		edit('tc1', 'a\nb\nc\n', 'A\nb\nc\n');
		// The user changed the second line between the two tool calls.
		edit('tc2', 'A\nB\nc\n', 'A\nB\nC\n');
		await harness.diskFileService.writeFile(target, VSBuffer.fromString('A\nB\nC\n'));

		await harness.handler.invoke({
			channel: buildTurnChangesetUri(chat, 'turn-1'),
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			content: (await harness.diskFileService.readFile(target)).value.toString(),
			turnDiffs: await computeTurnDiffs('agent:/session', harness.trackedDb, new TestDiffComputeService(), 'turn-1'),
		}, {
			content: 'a\nB\nc\n',
			turnDiffs: [],
		});
	});

	test('restores a file the turn deleted only when the discard can be recorded', async () => {
		const read = async (harness: ReturnType<typeof setup>) => {
			try {
				return (await harness.diskFileService.readFile(target)).value.toString();
			} catch {
				return undefined;
			}
		};
		const cases: Record<string, (harness: ReturnType<typeof setup>, chat: string) => void> = {
			recorded: () => { },
			recordingFails: ({ trackedDb }) => {
				trackedDb.storeFileEdits = async () => { throw new Error('database closed'); };
			},
			turnStartedWhileRecording: ({ trackedDb, stateManager }, chat) => {
				const storeFileEdits = trackedDb.storeFileEdits.bind(trackedDb);
				trackedDb.storeFileEdits = (edits, beforeCommit) => storeFileEdits(edits, async readContent => {
					startTurn(stateManager, chat, 'turn-2');
					await beforeCommit?.(readContent);
				});
			},
		};

		const results: Record<string, unknown> = {};
		for (const [name, arrange] of Object.entries(cases)) {
			const harness = setup(disposables);
			const chat = buildDefaultChatUri(harness.session.toString());
			addTurn(harness.stateManager, chat, 'turn-1');
			// The edit tracker records a file deleted by a tool as an edit to empty content.
			harness.trackedDb.addEdit({
				turnId: 'turn-1', toolCallId: 'tc1', filePath: target.fsPath, kind: FileEditKind.Edit,
				addedLines: undefined, removedLines: undefined,
				beforeContent: encodeString('old\n'), afterContent: encodeString(''),
			});
			arrange(harness, chat);
			let code: number | undefined;
			try {
				await harness.handler.invoke({
					channel: buildTurnChangesetUri(chat, 'turn-1'),
					operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
					target: makeResourceTarget(target),
				}, CancellationToken.None);
			} catch (e) {
				code = (e as ProtocolError).code;
			}
			results[name] = { code, content: await read(harness), recordedEdits: (await harness.trackedDb.getAllFileEdits()).length };
		}

		assert.deepStrictEqual(results, {
			recorded: { code: undefined, content: 'old\n', recordedEdits: 2 },
			recordingFails: { code: JsonRpcErrorCodes.InternalError, content: undefined, recordedEdits: 1 },
			turnStartedWhileRecording: { code: JsonRpcErrorCodes.InvalidParams, content: undefined, recordedEdits: 1 },
		});
	});

	test('allows non-Git files in the workspace and rejects files outside it', async () => {
		const workspaceRoot = URI.file('/workspace');
		const nonGitTarget = URI.joinPath(workspaceRoot, 'plain/file.ts');
		const outsideTarget = URI.file('/outside/file.ts');

		const allowed = await setupLastTurn(nonGitTarget, [workspaceRoot]);
		allowed.gitService.repositoryRoot = undefined;
		await allowed.handler.invoke({
			channel: allowed.channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(nonGitTarget),
		}, CancellationToken.None);

		const rejected = await setupLastTurn(outsideTarget, [workspaceRoot]);
		rejected.gitService.repositoryRoot = undefined;
		let error: ProtocolError | undefined;
		try {
			await rejected.handler.invoke({
				channel: rejected.channel,
				operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
				target: makeResourceTarget(outsideTarget),
			}, CancellationToken.None);
		} catch (e) {
			error = e as ProtocolError;
		}

		assert.deepStrictEqual({
			nonGitContent: (await allowed.diskFileService.readFile(nonGitTarget)).value.toString(),
			outsideContent: (await rejected.diskFileService.readFile(outsideTarget)).value.toString(),
			rejectedCode: error?.code,
		}, {
			nonGitContent: 'a\nb\n',
			outsideContent: 'a\nB\n',
			rejectedCode: JsonRpcErrorCodes.InvalidParams,
		});
	});
});

suite('AgentHostDiscardChangesOperationHandler - session changes', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const target = URI.file('/repo/src/file.ts');

	async function setupSessionChanges() {
		const harness = setup(disposables);
		const chat = buildDefaultChatUri(harness.session.toString());
		addTurn(harness.stateManager, chat, 'turn-1');
		addTurn(harness.stateManager, chat, 'turn-2');
		const edit = (turnId: string, toolCallId: string, before: string, after: string) => harness.trackedDb.addEdit({
			turnId, toolCallId, filePath: target.fsPath, kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString(before), afterContent: encodeString(after),
		});
		edit('turn-1', 'tc1', 'a\nb\nc\nd\ne\n', 'A\nb\nc\nd\ne\n');
		// The user changed the third line between the turns.
		edit('turn-2', 'tc2', 'A\nb\nC\nd\ne\n', 'A\nb\nC\nd\nE\n');
		await harness.diskFileService.writeFile(target, VSBuffer.fromString('A\nb\nC\nd\nE\n'));
		return { ...harness, chat, channel: buildSessionChangesetUri(harness.session.toString()) };
	}

	test('reverts every turn\'s edits to the file without Git, keeps changes made between turns, and records the discard', async () => {
		const { handler, gitService, diskFileService, trackedDb, discardedTurns, refreshes, chat, channel, session } = await setupSessionChanges();
		gitService.repositoryRoot = undefined;

		const result = await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		const diffService = new TestDiffComputeService();
		assert.deepStrictEqual({
			content: (await diskFileService.readFile(target)).value.toString(),
			sessionDiffs: await computeSessionDiffs('agent:/session', trackedDb, diffService),
			turnDiffs: [
				await computeTurnDiffs('agent:/session', trackedDb, diffService, 'turn-1'),
				await computeTurnDiffs('agent:/session', trackedDb, diffService, 'turn-2'),
			],
			discardedTurns,
			refreshes,
			message: result.message,
		}, {
			content: 'a\nb\nC\nd\ne\n',
			sessionDiffs: [],
			turnDiffs: [[], []],
			discardedTurns: [{ owner: chat, turnIds: ['turn-1', 'turn-2'] }],
			refreshes: [session.toString()],
			message: { markdown: 'Discarded the session\'s changes to `file.ts`.' },
		});
	});

	test('reverts accepted edits too, recording the discard without the rows that accepted them', async () => {
		const { handler, gitService, diskFileService, trackedDb, channel } = await setupSessionChanges();
		gitService.repositoryRoot = undefined;
		trackedDb.addEdit(createFileEditAcceptRecord('turn-2', target.fsPath, encodeString('A\nb\nC\nd\nE\n')));

		await handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		const rows = await trackedDb.getAllFileEdits();
		assert.deepStrictEqual({
			content: (await diskFileService.readFile(target)).value.toString(),
			sessionDiffs: await computeSessionDiffs('agent:/session', trackedDb, new TestDiffComputeService()),
			discardRows: rows.slice(3).map(row => row.turnId),
		}, {
			content: 'a\nb\nC\nd\ne\n',
			sessionDiffs: [],
			discardRows: ['turn-2', 'turn-1'],
		});
	});

	test('deletes a file the session created, along with later changes to it', async () => {
		const harness = setup(disposables);
		const chat = buildDefaultChatUri(harness.session.toString());
		addTurn(harness.stateManager, chat, 'turn-1');
		addTurn(harness.stateManager, chat, 'turn-2');
		harness.trackedDb.addEdit({
			turnId: 'turn-1', toolCallId: 'tc1', filePath: target.fsPath, kind: FileEditKind.Create,
			addedLines: undefined, removedLines: undefined,
			beforeContent: undefined, afterContent: encodeString('new\n'),
		});
		harness.trackedDb.addEdit({
			turnId: 'turn-2', toolCallId: 'tc2', filePath: target.fsPath, kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString('new\n'), afterContent: encodeString('new\nmore\n'),
		});
		// The user changed the file after the session's last edit.
		await harness.diskFileService.writeFile(target, VSBuffer.fromString('new\nmore\nuser\n'));

		const result = await harness.handler.invoke({
			channel: buildSessionChangesetUri(harness.session.toString()),
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		const diffService = new TestDiffComputeService();
		assert.deepStrictEqual({
			exists: await harness.diskFileService.exists(target),
			sessionDiffs: await computeSessionDiffs('agent:/session', harness.trackedDb, diffService),
			turnDiffs: [
				await computeTurnDiffs('agent:/session', harness.trackedDb, diffService, 'turn-1'),
				await computeTurnDiffs('agent:/session', harness.trackedDb, diffService, 'turn-2'),
			],
			discardedTurns: harness.discardedTurns,
			message: result.message,
		}, {
			exists: false,
			sessionDiffs: [],
			turnDiffs: [[], []],
			discardedTurns: [{ owner: chat, turnIds: ['turn-1', 'turn-2'] }],
			message: { markdown: 'Discarded the session\'s changes to `file.ts`.' },
		});
	});

	test('does not revert edits whose turn was discarded again, keeping later changes to the file', async () => {
		// One line per character, so each sequence reads as the file's lines.
		const toLines = (text: string) => `${text.split('').join('\n')}\n`;
		const sequences: Record<string, { readonly turn1: readonly (readonly [string, string])[]; readonly beforeTurn2: string; readonly turn2: readonly [string, string] }> = {
			// The user changed line 3 between turn 1's edits, which discarding turn 1 kept, then changed it back.
			userChangeUndoneAfterTurnDiscard: { turn1: [['abcdefg', 'Abcdefg'], ['AbCdefg', 'AbCdEfg']], beforeTurn2: 'abcdefg', turn2: ['abcdefg', 'abcdefG'] },
			// The user changed the line whose edit discarding turn 1 reverted.
			userChangedDiscardedLine: { turn1: [['abcde', 'Abcde']], beforeTurn2: 'Zbcde', turn2: ['Zbcde', 'ZbCde'] },
		};

		const results: Record<string, unknown> = {};
		for (const [name, sequence] of Object.entries(sequences)) {
			const harness = setup(disposables);
			const chat = buildDefaultChatUri(harness.session.toString());
			const read = async () => (await harness.diskFileService.readFile(target)).value.toString();
			const edit = (turnId: string, toolCallId: string, [before, after]: readonly [string, string]) => harness.trackedDb.addEdit({
				turnId, toolCallId, filePath: target.fsPath, kind: FileEditKind.Edit,
				addedLines: undefined, removedLines: undefined,
				beforeContent: encodeString(toLines(before)), afterContent: encodeString(toLines(after)),
			});

			addTurn(harness.stateManager, chat, 'turn-1');
			sequence.turn1.forEach((change, index) => edit('turn-1', `tc${index + 1}`, change));
			await harness.diskFileService.writeFile(target, VSBuffer.fromString(toLines(sequence.turn1[sequence.turn1.length - 1][1])));
			await harness.handler.invoke({
				channel: buildTurnChangesetUri(chat, 'turn-1'),
				operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
				target: makeResourceTarget(target),
			}, CancellationToken.None);
			const afterTurnDiscard = await read();

			await harness.diskFileService.writeFile(target, VSBuffer.fromString(toLines(sequence.beforeTurn2)));
			addTurn(harness.stateManager, chat, 'turn-2');
			edit('turn-2', 'tc-turn-2', sequence.turn2);
			await harness.diskFileService.writeFile(target, VSBuffer.fromString(toLines(sequence.turn2[1])));
			let code: number | undefined;
			try {
				await harness.handler.invoke({
					channel: buildSessionChangesetUri(harness.session.toString()),
					operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
					target: makeResourceTarget(target),
				}, CancellationToken.None);
			} catch (e) {
				code = (e as ProtocolError).code;
			}
			results[name] = {
				afterTurnDiscard,
				code,
				content: await read(),
				sessionDiffs: await computeSessionDiffs('agent:/session', harness.trackedDb, new TestDiffComputeService()),
			};
		}

		assert.deepStrictEqual(results, {
			userChangeUndoneAfterTurnDiscard: { afterTurnDiscard: toLines('abCdefg'), code: undefined, content: toLines('abcdefg'), sessionDiffs: [] },
			userChangedDiscardedLine: { afterTurnDiscard: toLines('abcde'), code: undefined, content: toLines('Zbcde'), sessionDiffs: [] },
		});
	});

	test('rejects requests it can not apply without changing the file', async () => {
		const peerEdit = () => {
			const peerDb = new TestSessionDatabase();
			peerDb.addEdit({
				turnId: 'peer-turn-1', toolCallId: 'ptc1', filePath: target.fsPath, kind: FileEditKind.Edit,
				addedLines: undefined, removedLines: undefined,
				beforeContent: encodeString('A\nb\nC\nd\nE\n'), afterContent: encodeString('A\nb\nC\nd\nE\nf\n'),
			});
			return peerDb;
		};
		const cases: Record<string, (harness: Awaited<ReturnType<typeof setupSessionChanges>>) => Promise<{ target?: URI | null }>> = {
			missingTarget: async () => ({ target: null }),
			turnRunning: async ({ stateManager, chat }) => { startTurn(stateManager, chat, 'turn-3'); return {}; },
			turnRunningInOtherChat: async ({ stateManager, session }) => {
				const peer = buildChatUri(session.toString(), 'peer');
				stateManager.addChat(session.toString(), peer, creationTimeChatStorageResource(session.toString(), peer, buildDefaultChatUri(session.toString())), {});
				startTurn(stateManager, peer, 'peer-turn-1');
				return {};
			},
			multiRoot: async ({ trackedSession }) => { trackedSession.workingDirectories = [URI.file('/repo').toString(), URI.file('/other').toString()]; return {}; },
			outsideWorkspace: async () => ({ target: URI.file('/outside/file.ts') }),
			fileNotInSession: async () => ({ target: URI.file('/repo/src/other.ts') }),
			outsideFolderScope: async ({ trackedSession }) => { trackedSession.folderScope = [URI.file('/elsewhere')]; return {}; },
			// Session Changes can't order one chat's discard against another chat's edits.
			changedBySeveralChats: async ({ trackedSession, session }) => {
				trackedSession.sources.push({ chat: buildChatUri(session.toString(), 'peer'), storage: buildChatUri(session.toString(), 'peer'), db: peerEdit() });
				return {};
			},
			editedByAnotherChat: async ({ trackedSession }) => {
				trackedSession.otherChatDatabases.push(peerEdit());
				return {};
			},
			renamed: async ({ trackedDb }) => {
				trackedDb.addEdit({
					turnId: 'turn-2', toolCallId: 'tc3', filePath: '/repo/src/moved.ts', originalPath: target.fsPath, kind: FileEditKind.Rename,
					addedLines: undefined, removedLines: undefined, beforeContent: undefined, afterContent: undefined,
				});
				return {};
			},
			editedSameLinesOutsideSession: async ({ diskFileService }) => { await diskFileService.writeFile(target, VSBuffer.fromString('AA\nb\nC\nd\nE\n')); return {}; },
			recordingFails: async ({ trackedDb }) => {
				trackedDb.storeFileEdits = async () => { throw new Error('database closed'); };
				return {};
			},
			// The file is put back when the discard can't be committed after the file changed.
			commitFails: async ({ trackedDb }) => {
				trackedDb.storeFileEdits = async (_edits, beforeCommit) => {
					await beforeCommit?.((toolCallId, filePath) => trackedDb.readFileEditContent(toolCallId, filePath));
					throw new Error('commit failed');
				};
				return {};
			},
			turnStartedWhileRecording: async ({ trackedDb, stateManager, chat }) => {
				const storeFileEdits = trackedDb.storeFileEdits.bind(trackedDb);
				trackedDb.storeFileEdits = (edits, beforeCommit) => storeFileEdits(edits, async readContent => {
					startTurn(stateManager, chat, 'turn-3');
					await beforeCommit?.(readContent);
				});
				return {};
			},
			// A turn that ran meanwhile could have recorded edits that the rows would hide.
			turnRanWhileRecording: async ({ trackedDb, stateManager, session }) => {
				const peer = buildChatUri(session.toString(), 'peer');
				stateManager.addChat(session.toString(), peer, creationTimeChatStorageResource(session.toString(), peer, buildDefaultChatUri(session.toString())), {});
				const storeFileEdits = trackedDb.storeFileEdits.bind(trackedDb);
				trackedDb.storeFileEdits = (edits, beforeCommit) => storeFileEdits(edits, async readContent => {
					addTurn(stateManager, peer, 'peer-turn-1');
					await beforeCommit?.(readContent);
				});
				return {};
			},
			turnStartedWhileComputing: async ({ trackedDb, stateManager, chat }) => {
				const readFileEditContent = trackedDb.readFileEditContent.bind(trackedDb);
				let started = false;
				trackedDb.readFileEditContent = (toolCallId, filePath) => {
					if (!started) {
						started = true;
						startTurn(stateManager, chat, 'turn-3');
					}
					return readFileEditContent(toolCallId, filePath);
				};
				return {};
			},
			// The content is written, but resolving the file afterwards fails.
			writeFailsAfterWriting: async ({ diskFileService }) => {
				const writeFile = diskFileService.writeFile.bind(diskFileService);
				let failed = false;
				diskFileService.writeFile = async (resource, content, options) => {
					const stat = await writeFile(resource, content, options);
					if (!failed) {
						failed = true;
						throw new Error('stat failed');
					}
					return stat;
				};
				return {};
			},
		};

		const results: Record<string, unknown> = {};
		for (const [name, arrange] of Object.entries(cases)) {
			const harness = await setupSessionChanges();
			const overrides = await arrange(harness);
			const contentBefore = (await harness.diskFileService.readFile(target)).value.toString();
			const editsBefore = (await harness.trackedDb.getAllFileEdits()).length;
			let error: ProtocolError | undefined;
			try {
				await harness.handler.invoke({
					channel: harness.channel,
					operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
					target: overrides.target === null ? undefined : makeResourceTarget(overrides.target ?? target),
				}, CancellationToken.None);
			} catch (e) {
				error = e as ProtocolError;
			}
			results[name] = {
				code: error?.code,
				unchanged: (await harness.diskFileService.readFile(target)).value.toString() === contentBefore,
				noEditsRecorded: (await harness.trackedDb.getAllFileEdits()).length === editsBefore,
				discardedTurns: harness.discardedTurns.length,
			};
		}

		const rejected = (code: number) => ({ code, unchanged: true, noEditsRecorded: true, discardedTurns: 0 });
		// A changeset computed while the discard was being recorded may include the rolled back rows.
		const rolledBack = (code: number) => ({ ...rejected(code), discardedTurns: 1 });
		assert.deepStrictEqual(results, {
			missingTarget: rejected(JsonRpcErrorCodes.InvalidParams),
			turnRunning: rejected(JsonRpcErrorCodes.InvalidParams),
			turnRunningInOtherChat: rejected(JsonRpcErrorCodes.InvalidParams),
			multiRoot: rejected(JsonRpcErrorCodes.InvalidParams),
			outsideWorkspace: rejected(JsonRpcErrorCodes.InvalidParams),
			fileNotInSession: rejected(JsonRpcErrorCodes.InvalidParams),
			outsideFolderScope: rejected(JsonRpcErrorCodes.InvalidParams),
			changedBySeveralChats: rejected(JsonRpcErrorCodes.InvalidParams),
			editedByAnotherChat: rejected(JsonRpcErrorCodes.InvalidParams),
			renamed: rejected(JsonRpcErrorCodes.InvalidParams),
			editedSameLinesOutsideSession: rejected(JsonRpcErrorCodes.InternalError),
			recordingFails: rolledBack(JsonRpcErrorCodes.InternalError),
			commitFails: rolledBack(JsonRpcErrorCodes.InternalError),
			turnStartedWhileRecording: rolledBack(JsonRpcErrorCodes.InvalidParams),
			turnRanWhileRecording: rolledBack(JsonRpcErrorCodes.InvalidParams),
			turnStartedWhileComputing: rolledBack(JsonRpcErrorCodes.InvalidParams),
			writeFailsAfterWriting: rolledBack(JsonRpcErrorCodes.InternalError),
		});
	});
});

suite('AgentHostDiscardChangesOperationHandler - working set', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const target = URI.file('/repo/src/file.ts');

	/** Six lines, with the given zero-based lines replaced. */
	function lines(changes: Record<number, string> = {}): string {
		return ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].map((line, index) => changes[index] ?? line).join('\n') + '\n';
	}

	function setupWorkingSet() {
		const harness = setup(disposables);
		harness.gitService.repositoryRoot = undefined;
		const chat = buildDefaultChatUri(harness.session.toString());
		addTurn(harness.stateManager, chat, 'turn-1');
		addTurn(harness.stateManager, chat, 'turn-2');
		const edit = (turnId: string, toolCallId: string, before: string, after: string) => harness.trackedDb.addEdit({
			turnId, toolCallId, filePath: target.fsPath, kind: FileEditKind.Edit,
			addedLines: undefined, removedLines: undefined,
			beforeContent: encodeString(before), afterContent: encodeString(after),
		});
		const accept = (turnId: string, content: string) => harness.trackedDb.addEdit(createFileEditAcceptRecord(turnId, target.fsPath, encodeString(content)));
		const discard = (range?: { readonly range: TextRange; readonly side?: 'before' | 'after' }, channel = buildWorkingSetChangesetUri(harness.session.toString()), nonce?: string) => harness.handler.invoke({
			channel,
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: {
				resource: target.toString(),
				...(range ? { kind: ChangesetOperationTargetKind.Range, ...range } : { kind: ChangesetOperationTargetKind.Resource }),
				...(nonce !== undefined ? { nonce } : {}),
			},
		}, CancellationToken.None);
		const diffService = new InProcessDiffComputeService();
		const describe = async () => ({
			content: (await harness.diskFileService.readFile(target)).value.toString(),
			workingSet: (await computeWorkingSetDiffs([{ sessionUri: harness.session.toString(), db: harness.trackedDb }], diffService)).length,
			session: (await computeSessionDiffs(harness.session.toString(), harness.trackedDb, diffService)).length,
			turns: [
				(await computeTurnDiffs(harness.session.toString(), harness.trackedDb, diffService, 'turn-1')).length,
				(await computeTurnDiffs(harness.session.toString(), harness.trackedDb, diffService, 'turn-2')).length,
			],
		});
		return { ...harness, chat, edit, accept, discard, describe };
	}

	test('discards changes while a turn runs only when the provider\'s edit tool calls wait for it, and tells the agent', async () => {
		const { edit, discard, describe, diskFileService, stateManager, chat, fileEditCoordinator, session } = setupWorkingSet();
		edit('turn-2', 'tc1', lines(), lines({ 0: 'L1', 4: 'L5' }));
		await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'L1', 4: 'L5' })));
		startTurn(stateManager, chat, 'turn-3');
		const reported: unknown[] = [];
		disposables.add(fileEditCoordinator.onDidDiscardFileEdits(edits => reported.push({ storage: edits.storage, path: edits.resource.path, lines: edits.lines, deleted: edits.deleted })));
		const shown = 'tc1';

		const uncoordinated = await discard(undefined, undefined, shown).then(() => undefined, (err: Error) => err.message);
		disposables.add(fileEditCoordinator.registerCoordinatedProvider('copilot'));
		const channel = buildWorkingSetChangesetUri(session.toString());
		stateManager.registerChangeset(channel);
		stateManager.dispatchServerAction(channel, {
			type: ActionType.ChangesetFileSet,
			file: { id: target.toString(), edit: { after: { uri: target.toString(), content: { uri: target.toString() } } }, nonce: shown },
		});
		const result = await discard({ range: { start: { line: 4, character: 0 }, end: { line: 5, character: 0 } }, side: 'after' }, undefined, shown);

		assert.deepStrictEqual({ uncoordinated, message: result.message, after: await describe(), reported }, {
			uncoordinated: 'Changes can\'t be discarded while a turn is running.',
			message: { markdown: 'Discarded the changes to `file.ts` in the given range.' },
			after: { content: lines({ 0: 'L1' }), workingSet: 1, session: 1, turns: [0, 1] },
			reported: [{ storage: session.toString(), path: target.path, lines: { startLineNumber: 5, endLineNumberExclusive: 6 }, deleted: false }],
		});
	});

	test('accepts an omitted nonce for coordinated Undo during a turn', async () => {
		const { edit, discard, describe, diskFileService, stateManager, chat, fileEditCoordinator } = setupWorkingSet();
		edit('turn-2', 'tc1', lines(), lines({ 0: 'L1' }));
		await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'L1' })));
		startTurn(stateManager, chat, 'turn-3');
		disposables.add(fileEditCoordinator.registerCoordinatedProvider('copilot'));
		await discard();

		assert.deepStrictEqual(await describe(), { content: lines(), workingSet: 0, session: 0, turns: [0, 0] });
	});

	test('waits for the agent to finish writing the file, then refuses changes that its edit updated after they were shown', async () => {
		const { edit, discard, describe, diskFileService, stateManager, chat, fileEditCoordinator } = setupWorkingSet();
		edit('turn-2', 'tc1', lines(), lines({ 0: 'L1' }));
		await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'L1' })));
		startTurn(stateManager, chat, 'turn-3');
		disposables.add(fileEditCoordinator.registerCoordinatedProvider('copilot'));
		const log: string[] = [];

		const writing = await fileEditCoordinator.beginEdit(target);
		let staleCode: number | undefined;
		const stale = discard(undefined, undefined, 'tc1').then(() => 'discarded', (err: ProtocolError) => {
			staleCode = err.code;
			return err.message;
		});
		void stale.then(outcome => log.push(`first undo: ${outcome}`));
		await timeout(0);
		log.push('agent records its edit');
		await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'L1', 4: 'L5' })));
		edit('turn-3', 'tc2', lines({ 0: 'L1' }), lines({ 0: 'L1', 4: 'L5' }));
		writing.dispose();
		await stale;
		const retry = await discard(undefined, undefined, 'tc2');

		assert.deepStrictEqual({ log, staleCode, retry: retry.message, after: await describe() }, {
			staleCode: AhpErrorCodes.Conflict,
			log: [
				'agent records its edit',
				'first undo: The changes to \'file.ts\' were updated after they were shown. Try again.',
			],
			retry: { markdown: 'Discarded the changes to `file.ts` that have not been accepted.' },
			after: { content: lines(), workingSet: 0, session: 0, turns: [0, 0] },
		});
	});

	test('reverts only the changes made since the file was accepted, keeping accepted changes and changes outside the session', async () => {
		const { edit, accept, discard, describe, diskFileService, discardedTurns, chat } = setupWorkingSet();
		edit('turn-1', 'tc1', lines(), lines({ 0: 'L1' }));
		accept('turn-1', lines({ 0: 'L1' }));
		edit('turn-2', 'tc2', lines({ 0: 'L1' }), lines({ 0: 'L1', 4: 'L5' }));
		// The user changed the third line after the last edit.
		await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'L1', 2: 'U3', 4: 'L5' })));
		const before = await describe();

		const result = await discard();

		assert.deepStrictEqual({ before, after: await describe(), discardedTurns, message: result.message }, {
			before: { content: lines({ 0: 'L1', 2: 'U3', 4: 'L5' }), workingSet: 1, session: 1, turns: [1, 1] },
			after: { content: lines({ 0: 'L1', 2: 'U3' }), workingSet: 0, session: 1, turns: [1, 0] },
			discardedTurns: [{ owner: chat, turnIds: ['turn-1', 'turn-2'] }],
			message: { markdown: 'Discarded the changes to `file.ts` that have not been accepted.' },
		});
	});

	test('deletes a file the session created unless its creation was accepted', async () => {
		const results: Record<string, unknown> = {};
		for (const [name, acceptCreation] of [['notAccepted', false], ['accepted', true]] as const) {
			const { trackedDb, edit, accept, discard, diskFileService, session } = setupWorkingSet();
			trackedDb.addEdit({
				turnId: 'turn-1', toolCallId: 'tc1', filePath: target.fsPath, kind: FileEditKind.Create,
				addedLines: undefined, removedLines: undefined,
				beforeContent: undefined, afterContent: encodeString(lines()),
			});
			if (acceptCreation) {
				accept('turn-1', lines());
			}
			edit('turn-2', 'tc2', lines(), lines({ 0: 'L1' }));
			await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'L1' })));

			const result = await discard();

			results[name] = {
				content: await diskFileService.readFile(target).then(file => file.value.toString(), () => undefined),
				workingSet: (await computeWorkingSetDiffs([{ sessionUri: session.toString(), db: trackedDb }], new InProcessDiffComputeService())).length,
				message: result.message,
			};
		}

		assert.deepStrictEqual(results, {
			notAccepted: { content: undefined, workingSet: 0, message: { markdown: 'Discarded the changes to `file.ts` that have not been accepted.' } },
			accepted: { content: lines(), workingSet: 0, message: { markdown: 'Discarded the changes to `file.ts` that have not been accepted.' } },
		});
	});

	test('restores accepted changes that discarding their turn reverted afterwards', async () => {
		const { edit, accept, discard, describe, diskFileService, trackedDb } = setupWorkingSet();
		edit('turn-1', 'tc1', lines(), lines({ 0: 'L1' }));
		accept('turn-1', lines({ 0: 'L1' }));
		trackedDb.addEdit(createFileEditDiscardRecord('turn-1', target.fsPath, { start: encodeString(lines()), end: encodeString(lines({ 0: 'L1' })) }));
		await diskFileService.writeFile(target, VSBuffer.fromString(lines()));
		const before = await describe();

		await discard();

		assert.deepStrictEqual({ before, after: await describe() }, {
			before: { content: lines(), workingSet: 1, session: 0, turns: [0, 0] },
			after: { content: lines({ 0: 'L1' }), workingSet: 0, session: 1, turns: [1, 0] },
		});
	});

	test('keeps the user\'s changes between the discarded edits and leaves nothing in the working set', async () => {
		const { edit, accept, discard, describe, diskFileService, trackedDb } = setupWorkingSet();
		edit('turn-1', 'tc1', lines(), lines({ 0: 'L1' }));
		accept('turn-1', lines({ 0: 'L1' }));
		edit('turn-2', 'tc2', lines({ 0: 'L1' }), lines({ 0: 'L1', 4: 'L5' }));
		// The user changed the third line between the turn's edits.
		edit('turn-2', 'tc3', lines({ 0: 'L1', 2: 'U3', 4: 'L5' }), lines({ 0: 'L1', 2: 'U3', 4: 'L5', 5: 'L6' }));
		await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'L1', 2: 'U3', 4: 'L5', 5: 'L6' })));
		const before = await describe();

		await discard();

		const rows = await trackedDb.getAllFileEdits();
		assert.deepStrictEqual({ before, after: await describe(), recorded: rows.slice(4).map(row => `${row.turnId}:${isFileEditAcceptRecord(row) ? 'accept' : 'discard'}`) }, {
			before: { content: lines({ 0: 'L1', 2: 'U3', 4: 'L5', 5: 'L6' }), workingSet: 1, session: 1, turns: [1, 1] },
			after: { content: lines({ 0: 'L1', 2: 'U3' }), workingSet: 0, session: 1, turns: [1, 0] },
			recorded: ['turn-2:discard', 'turn-2:accept'],
		});
	});

	for (const restored of [false, true]) {
		test(`session discard still reverts accepted changes after a working set discard (restored: ${restored})`, async () => {
			const { edit, accept, discard, describe, diskFileService, trackedDb, handler, session } = setupWorkingSet();
			edit('turn-1', 'tc1', lines(), lines({ 0: 'L1' }));
			accept('turn-1', lines({ 0: 'L1' }));
			if (restored) {
				trackedDb.addEdit(createFileEditDiscardRecord('turn-1', target.fsPath, { start: encodeString(lines()), end: encodeString(lines({ 0: 'L1' })) }));
				await diskFileService.writeFile(target, VSBuffer.fromString(lines()));
			} else {
				edit('turn-1', 'tc2', lines({ 0: 'L1' }), lines({ 0: 'L1', 4: 'L5' }));
				await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'L1', 4: 'L5' })));
			}
			await discard();
			const afterWorkingSetDiscard = await describe();

			await handler.invoke({
				channel: buildSessionChangesetUri(session.toString()),
				operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
				target: makeResourceTarget(target),
			}, CancellationToken.None);

			assert.deepStrictEqual({ afterWorkingSetDiscard, afterSessionDiscard: await describe() }, {
				afterWorkingSetDiscard: { content: lines({ 0: 'L1' }), workingSet: 0, session: 1, turns: [1, 0] },
				afterSessionDiscard: { content: lines(), workingSet: 1, session: 0, turns: [0, 0] },
			});
		});
	}

	for (const nonce of [undefined, 'tc1']) {
		test(`leaves a file alone when its changes were kept after its unaccepted changes were read (nonce=${nonce})`, async () => {
			const { edit, accept, discard, describe, diskFileService, trackedDb } = setupWorkingSet();
			edit('turn-1', 'tc1', lines(), lines({ 0: 'L1' }));
			await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'L1' })));
			// Another client keeps the file's changes while Undo prepares the revert.
			const storeFileEdits = trackedDb.storeFileEdits.bind(trackedDb);
			trackedDb.storeFileEdits = (edits, beforeCommit) => {
				accept('turn-1', lines({ 0: 'L1' }));
				return storeFileEdits(edits, beforeCommit);
			};

			let error: ProtocolError | undefined;
			try {
				await discard(undefined, undefined, nonce);
			} catch (e) {
				error = e as ProtocolError;
			}

			assert.deepStrictEqual({ code: error?.code, message: error?.message, state: await describe(), rows: (await trackedDb.getAllFileEdits()).map(row => isFileEditAcceptRecord(row) ? 'accept' : row.toolCallId) }, {
				code: nonce === undefined ? JsonRpcErrorCodes.InvalidParams : AhpErrorCodes.Conflict,
				message: nonce === undefined ? '\'file.ts\' changed while its changes were being discarded. Try again.' : 'The changes to \'file.ts\' were updated after they were shown. Try again.',
				state: { content: lines({ 0: 'L1' }), workingSet: 0, session: 1, turns: [1, 0] },
				rows: ['tc1', 'accept'],
			});
		});
	}

	/** A range on the zero-based lines from `start` through `end`. */
	function lineRange(start: number, end = start): TextRange {
		return { start: { line: start, character: 0 }, end: { line: end, character: 2 } };
	}

	test('reverts only the hunks that a range touches, keeping the other changes and the user\'s, in the turn of the file\'s last edit', async () => {
		const { edit, discard, describe, diskFileService, trackedDb, discardedTurns, chat } = setupWorkingSet();
		edit('turn-1', 'tc1', lines(), lines({ 0: 'L1' }));
		edit('turn-2', 'tc2', lines({ 0: 'L1' }), lines({ 0: 'L1', 4: 'L5' }));
		// The user changed the third line after the last edit.
		await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'L1', 2: 'U3', 4: 'L5' })));

		const result = await discard({ range: lineRange(0) });

		const rows = await trackedDb.getAllFileEdits();
		assert.deepStrictEqual({
			after: await describe(),
			recorded: rows.slice(2).map(row => `${row.turnId}:${isFileEditAcceptRecord(row) ? 'accept' : 'discard'}`),
			discardedTurns,
			message: result.message,
		}, {
			// The second turn's changeset now also reverts the first turn's change.
			after: { content: lines({ 2: 'U3', 4: 'L5' }), workingSet: 1, session: 1, turns: [1, 1] },
			recorded: ['turn-2:discard'],
			discardedTurns: [{ owner: chat, turnIds: ['turn-1', 'turn-2'] }],
			message: { markdown: 'Discarded the changes to `file.ts` in the given range.' },
		});
	});

	test('discards every change that has not been accepted when a range touches every hunk', async () => {
		const { edit, discard, describe, diskFileService } = setupWorkingSet();
		edit('turn-1', 'tc1', lines(), lines({ 0: 'L1', 4: 'L5' }));
		await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'L1', 4: 'L5' })));

		const result = await discard({ range: lineRange(0, 5) });

		assert.deepStrictEqual({ after: await describe(), message: result.message }, {
			after: { content: lines(), workingSet: 0, session: 0, turns: [0, 0] },
			message: { markdown: 'Discarded the changes to `file.ts` that have not been accepted.' },
		});
	});

	test('reverts one hunk of a file whose line endings the session converted, keeping the conversion and the other hunk', async () => {
		const { edit, discard, describe, diskFileService } = setupWorkingSet();
		edit('turn-1', 'tc1', 'one\r\ntwo\r\nthree\r\nfour\r\nfive\r\n', 'one\nTWO\nthree\nfour\nFIVE\n');
		await diskFileService.writeFile(target, VSBuffer.fromString('one\nTWO\nthree\nfour\nFIVE\n'));

		const result = await discard({ range: lineRange(1) });

		assert.deepStrictEqual({ after: await describe(), message: result.message }, {
			after: { content: 'one\ntwo\nthree\nfour\nFIVE\n', workingSet: 1, session: 1, turns: [1, 0] },
			message: { markdown: 'Discarded the changes to `file.ts` in the given range.' },
		});
	});

	test('reverts the changes that a partial accept left out, keeping the accepted ones', async () => {
		const { edit, discard, describe, diskFileService, trackedDb } = setupWorkingSet();
		edit('turn-1', 'tc1', lines(), lines({ 0: 'L1', 4: 'L5' }));
		trackedDb.addEdit(createPartialFileEditAcceptRecord('turn-1', target.fsPath, encodeString(lines({ 0: 'L1' })), encodeString(lines({ 0: 'L1', 4: 'L5' }))));
		await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'L1', 4: 'L5' })));
		const before = await describe();

		await discard();

		assert.deepStrictEqual({ before, after: await describe() }, {
			before: { content: lines({ 0: 'L1', 4: 'L5' }), workingSet: 1, session: 1, turns: [1, 0] },
			after: { content: lines({ 0: 'L1' }), workingSet: 0, session: 1, turns: [1, 0] },
		});
	});

	test('rejects a range it can not discard without changing the file', async () => {
		const cases: Record<string, (context: ReturnType<typeof setupWorkingSet>) => Promise<{ readonly range?: TextRange; readonly channel?: string }>> = {
			created: async ({ trackedDb }) => {
				trackedDb.addEdit({
					turnId: 'turn-1', toolCallId: 'tc1', filePath: target.fsPath, kind: FileEditKind.Create,
					addedLines: undefined, removedLines: undefined,
					beforeContent: undefined, afterContent: encodeString(lines()),
				});
				return {};
			},
			noChangeInRange: async ({ edit }) => {
				edit('turn-1', 'tc1', lines(), lines({ 0: 'L1' }));
				return { range: lineRange(3) };
			},
			// The user changed the same line after the edit.
			overlapping: async ({ edit, diskFileService }) => {
				edit('turn-1', 'tc1', lines(), lines({ 0: 'L1', 4: 'L5' }));
				await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'U1', 4: 'L5' })));
				return {};
			},
			sessionChanges: async ({ edit, session }) => {
				edit('turn-1', 'tc1', lines(), lines({ 0: 'L1', 4: 'L5' }));
				return { channel: buildSessionChangesetUri(session.toString()) };
			},
		};
		const results: Record<string, unknown> = {};
		for (const [name, arrange] of Object.entries(cases)) {
			const context = setupWorkingSet();
			const { range, channel } = await arrange(context);
			let error: ProtocolError | undefined;
			try {
				await context.discard({ range: range ?? lineRange(0) }, channel);
			} catch (e) {
				error = e as ProtocolError;
			}
			results[name] = { code: error?.code, message: error?.message, rows: (await context.trackedDb.getAllFileEdits()).length };
		}

		assert.deepStrictEqual(results, {
			created: { code: JsonRpcErrorCodes.InvalidParams, message: 'Changes to \'file.ts\' can only be discarded for the whole file.', rows: 1 },
			noChangeInRange: { code: JsonRpcErrorCodes.InvalidParams, message: '\'file.ts\' has no changes to discard in the given range.', rows: 1 },
			overlapping: { code: JsonRpcErrorCodes.InternalError, message: 'Couldn\'t discard the changes to \'file.ts\' that have not been accepted because the same lines were changed outside of the session.', rows: 1 },
			sessionChanges: { code: JsonRpcErrorCodes.InvalidParams, message: 'Operation \'discard-changes\' requires a resource target.', rows: 1 },
		});
	});

	test('rejects a file whose changes were all accepted without changing it', async () => {
		const { edit, accept, discard, describe, diskFileService, trackedDb } = setupWorkingSet();
		edit('turn-1', 'tc1', lines(), lines({ 0: 'L1' }));
		accept('turn-1', lines({ 0: 'L1' }));
		await diskFileService.writeFile(target, VSBuffer.fromString(lines({ 0: 'L1' })));

		let error: ProtocolError | undefined;
		try {
			await discard();
		} catch (e) {
			error = e as ProtocolError;
		}

		assert.deepStrictEqual({ code: error?.code, message: error?.message, state: await describe(), rows: (await trackedDb.getAllFileEdits()).length }, {
			code: JsonRpcErrorCodes.InvalidParams,
			message: '\'file.ts\' has no changes that have not been accepted.',
			state: { content: lines({ 0: 'L1' }), workingSet: 0, session: 1, turns: [1, 0] },
			rows: 2,
		});
	});
});

suite('AgentHostDiscardChangesOperationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('offers discard on branch, uncommitted, and session changes, and on the last turn only, including while it runs', () => {
		const { stateManager, session } = setup(disposables);
		const chat = buildDefaultChatUri(session.toString());
		addTurn(stateManager, chat, 'turn-1');
		addTurn(stateManager, chat, 'turn-2');
		const contribution = disposables.add(new AgentHostDiscardChangesOperationContribution(stateManager, new (mock<IInstantiationService>())()));
		const confirmations = (changesetUri: string, changesetKind: ChangesetKind, uncommittedChanges = 1) => contribution
			.getOperations({ sessionKey: session.toString(), changesetUri, changesetKind, gitState: { uncommittedChanges } })
			.map(operation => `${operation.id}: ${operation.confirmation}`);
		const lastTurnConfirmation = 'discard-changes: Are you sure you want to discard the last turn\'s changes to \'{0}\'? Changes made outside of the last turn will be kept, except in a file the last turn created, which is deleted along with any later changes to it. This action cannot be undone.';

		const completed = {
			branch: confirmations(buildBranchChangesetUri(chat), ChangesetKind.Branch, 0),
			uncommitted: confirmations(buildUncommittedChangesetUri(chat), ChangesetKind.Uncommitted),
			cleanUncommitted: confirmations(buildUncommittedChangesetUri(chat), ChangesetKind.Uncommitted, 0),
			lastTurn: confirmations(buildTurnChangesetUri(chat, 'turn-2'), ChangesetKind.Turn),
			olderTurn: confirmations(buildTurnChangesetUri(chat, 'turn-1'), ChangesetKind.Turn),
			session: confirmations(buildSessionChangesetUri(session.toString()), ChangesetKind.Session),
			workingSet: confirmations(buildWorkingSetChangesetUri(session.toString()), ChangesetKind.WorkingSet),
		};
		startTurn(stateManager, chat, 'turn-3');
		const running = {
			runningTurn: confirmations(buildTurnChangesetUri(chat, 'turn-3'), ChangesetKind.Turn),
			previousTurn: confirmations(buildTurnChangesetUri(chat, 'turn-2'), ChangesetKind.Turn),
		};

		assert.deepStrictEqual({ completed, running }, {
			completed: {
				branch: ['discard-changes: Are you sure you want to discard the changes in \'{0}\'? This action cannot be undone.'],
				uncommitted: ['discard-changes: Are you sure you want to discard the changes in \'{0}\'? This action cannot be undone.'],
				cleanUncommitted: [],
				lastTurn: [lastTurnConfirmation],
				olderTurn: [],
				session: ['discard-changes: Are you sure you want to discard the session\'s changes to \'{0}\'? Changes made outside of the session will be kept, except in a file the session created, which is deleted along with any later changes to it. This action cannot be undone.'],
				workingSet: ['discard-changes: undefined'],
			},
			running: {
				runningTurn: [lastTurnConfirmation],
				previousTurn: [],
			},
		});
	});

	test('offers discarding the hunks of a range only on the Working Set', () => {
		const { stateManager, session } = setup(disposables);
		const chat = buildDefaultChatUri(session.toString());
		const contribution = disposables.add(new AgentHostDiscardChangesOperationContribution(stateManager, new (mock<IInstantiationService>())()));
		const scopes = (changesetUri: string, changesetKind: ChangesetKind) => contribution
			.getOperations({ sessionKey: session.toString(), changesetUri, changesetKind, gitState: { uncommittedChanges: 1 } })
			.map(operation => operation.scopes);

		assert.deepStrictEqual({
			workingSet: scopes(buildWorkingSetChangesetUri(session.toString()), ChangesetKind.WorkingSet),
			session: scopes(buildSessionChangesetUri(session.toString()), ChangesetKind.Session),
			uncommitted: scopes(buildUncommittedChangesetUri(chat), ChangesetKind.Uncommitted),
		}, {
			workingSet: [['resource', 'range']],
			session: [['resource']],
			uncommitted: [['resource']],
		});
	});

	test('offers discard on session changes unless they span more than one folder', () => {
		const { stateManager, session } = setup(disposables);
		const contribution = disposables.add(new AgentHostDiscardChangesOperationContribution(stateManager, new (mock<IInstantiationService>())()));
		const operationIds = (owner: string) => contribution
			.getOperations({ sessionKey: session.toString(), changesetUri: buildSessionChangesetUri(owner), changesetKind: ChangesetKind.Session, gitState: { uncommittedChanges: 0 } })
			.map(operation => operation.id);

		const singleFolder = operationIds(session.toString());
		const peer = buildChatUri(session.toString(), 'peer');
		stateManager.addChat(session.toString(), peer, creationTimeChatStorageResource(session.toString(), peer, buildDefaultChatUri(session.toString())), { workingDirectories: [URI.file('/peer-repo').toString()] });

		assert.deepStrictEqual({
			singleFolder,
			sessionAcrossFolders: operationIds(session.toString()),
			peerChat: operationIds(peer),
		}, {
			singleFolder: ['discard-changes'],
			sessionAcrossFolders: [],
			peerChat: ['discard-changes'],
		});
	});
});
