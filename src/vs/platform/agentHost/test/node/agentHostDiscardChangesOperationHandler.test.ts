/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../files/common/files.js';
import { NullLogService } from '../../../log/common/log.js';
import { EMPTY_TREE_OBJECT, type IAgentHostGitService, type IBranch, type IDefaultBranch } from '../../common/agentHostGitService.js';
import { buildBranchChangesetUri, buildSessionChangesetUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationParams } from '../../common/state/protocol/channels-changeset/commands.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { buildChatUri, buildDefaultChatUri, SessionStatus, type ISessionFileDiff } from '../../common/state/sessionState.js';
import { AgentHostDiscardChangesOperationHandler } from '../../node/agentHostDiscardChangesOperationHandler.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { buildGitBlobUri } from '../../node/gitDiffContent.js';

class TestGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	readonly restoreCalls: { workingDirectory: string; paths: readonly string[]; options?: { readonly staged?: boolean; readonly ref?: string } }[] = [];
	restoreError: Error | undefined;
	repositoryRoot = URI.file('/repo');
	readonly repositoryRoots = new Map<string, URI | undefined>();
	untrackedPaths: readonly string[] = [];

	async getCurrentBranch(): Promise<string | undefined> { return undefined; }
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

function setup(disposables: Pick<DisposableStore, 'add'>, opts?: { readonly withWorkingDirectory?: boolean; readonly workingDirectory?: URI; readonly workingDirectories?: readonly URI[]; readonly registerSession?: boolean; readonly onDiscarded?: (sessionKey: string) => Promise<void> }): { handler: AgentHostDiscardChangesOperationHandler; gitService: TestGitService; fileService: TestFileService; stateManager: AgentHostStateManager; refreshes: string[]; session: URI } {
	const gitService = new TestGitService();
	const fileService = new TestFileService();
	const refreshes: string[] = [];
	const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
	const session = URI.parse('agent:/session');
	const workingDirectories = opts?.workingDirectories ?? [opts?.workingDirectory ?? URI.file('/repo')];
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
		gitService,
		fileService,
		new NullLogService(),
		stateManager,
	);
	return { handler, gitService, fileService, stateManager, refreshes, session };
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

	test('rejects channels that are not branch or uncommitted changeset URIs', async () => {
		const { handler, gitService, session } = setup(disposables);
		const target = URI.file('/repo/src/file.ts');

		let err: ProtocolError | undefined;
		try {
			await handler.invoke({
				channel: buildSessionChangesetUri(session.toString()),
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
