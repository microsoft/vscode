/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../files/common/files.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildSessionChangesetUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationParams } from '../../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { SessionStatus, type ISessionFileDiff } from '../../common/state/sessionState.js';
import { AgentHostDiscardChangesOperationHandler } from '../../node/agentHostDiscardChangesOperationHandler.js';
import type { IAgentHostGitService, IBranch, IDefaultBranch } from '../../common/agentHostGitService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

class TestGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	readonly restoreCalls: { workingDirectory: string; paths: readonly string[]; options?: { readonly staged?: boolean; readonly ref?: string } }[] = [];
	restoreError: Error | undefined;
	repositoryRoot = URI.file('/repo');
	untrackedPaths: readonly string[] = [];

	async getCurrentBranch(): Promise<string | undefined> { return undefined; }
	async getDefaultBranch(): Promise<IDefaultBranch | undefined> { return undefined; }
	async getBranch(): Promise<IBranch | undefined> { return undefined; }
	async getRefs(): Promise<IBranch[]> { return []; }
	async getBranches(): Promise<IBranch[]> { return []; }
	async getRepositoryRoot(): Promise<URI | undefined> { return this.repositoryRoot; }
	async getWorktreeRoots(): Promise<URI[]> { return []; }
	async addWorktree(): Promise<void> { }
	async copyWorktreeIncludeFiles(): Promise<void> { }
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

function setup(disposables: Pick<DisposableStore, 'add'>, opts?: { readonly withWorkingDirectory?: boolean; readonly workingDirectory?: URI; readonly registerSession?: boolean }): { handler: AgentHostDiscardChangesOperationHandler; gitService: TestGitService; fileService: TestFileService; session: URI } {
	const gitService = new TestGitService();
	const fileService = new TestFileService();
	const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
	const session = URI.parse('agent:/session');
	if (opts?.registerSession !== false) {
		stateManager.createSession({
			resource: session.toString(),
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
			workingDirectories: opts?.withWorkingDirectory === false ? undefined : [(opts?.workingDirectory ?? URI.file('/repo')).toString()],
		});
	}
	const handler = new AgentHostDiscardChangesOperationHandler(
		sessionKey => stateManager.getSessionState(sessionKey),
		gitService,
		fileService,
		new NullLogService(),
	);
	return { handler, gitService, fileService, session };
}

function makeResourceTarget(resource: URI): InvokeChangesetOperationParams['target'] {
	// `ChangesetOperationTarget.resource` is typed as the protocol `URI` (a
	// branded string), not the workbench `URI` class.
	return { kind: ChangesetOperationTargetKind.Resource, resource: resource.toString() as unknown as InvokeChangesetOperationParams['channel'] };
}

suite('AgentHostDiscardChangesOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('restores the targeted file on success', async () => {
		const { handler, gitService, fileService, session } = setup(disposables);
		const target = URI.file('/repo/src/file.ts');

		const result = await handler.invoke({
			channel: buildUncommittedChangesetUri(session.toString()),
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			restoreCalls: gitService.restoreCalls,
			deleteCalls: fileService.deleteCalls,
			message: result.message,
		}, {
			restoreCalls: [{ workingDirectory: URI.file('/repo').toString(), paths: [target.fsPath], options: undefined }],
			deleteCalls: [],
			message: { markdown: 'Discarded changes to `file.ts`.' },
		});
	});

	test('deletes an untracked file using trash when supported', async () => {
		const { handler, gitService, fileService, session } = setup(disposables);
		gitService.untrackedPaths = ['src/new.ts'];
		const target = URI.file('/repo/src/new.ts');

		const result = await handler.invoke({
			channel: buildUncommittedChangesetUri(session.toString()),
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
		const { handler, gitService, fileService, session } = setup(disposables, { workingDirectory });
		gitService.repositoryRoot = URI.file('/private/var/folders/repo');
		gitService.untrackedPaths = ['src/new.ts'];
		const target = URI.file('/private/var/folders/repo/src/new.ts');

		await handler.invoke({
			channel: buildUncommittedChangesetUri(session.toString()),
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
		const { handler, gitService, fileService, session } = setup(disposables);
		gitService.untrackedPaths = ['src/new.ts'];
		fileService.trashSupported = false;
		const target = URI.file('/repo/src/new.ts');

		await handler.invoke({
			channel: buildUncommittedChangesetUri(session.toString()),
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

	test('rejects channels that are not uncommitted-changeset URIs', async () => {
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
		const { handler, gitService, session } = setup(disposables);
		gitService.restoreError = new Error('git restore failed');
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
