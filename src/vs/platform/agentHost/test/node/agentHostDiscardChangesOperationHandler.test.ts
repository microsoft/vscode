/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildSessionChangesetUri, buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationParams } from '../../common/state/protocol/channels-changeset/commands.js';
import { ChangesSummary } from '../../common/state/protocol/state.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { SessionStatus, type ISessionFileDiff } from '../../common/state/sessionState.js';
import { AgentHostDiscardChangesOperationHandler } from '../../node/agentHostDiscardChangesOperationHandler.js';
import type { IAgentHostGitService } from '../../node/agentHostGitService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { IAgentHostChangesetService, IPersistedChangesetMetadata, IRestoredChangesetDiffs } from '../../common/agentHostChangesetService.js';

class TestGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	readonly restoreCalls: { workingDirectory: string; paths: readonly string[]; options?: { readonly staged?: boolean; readonly ref?: string } }[] = [];
	restoreError: Error | undefined;

	async isInsideWorkTree(): Promise<boolean> { return true; }
	async getCurrentBranch(): Promise<string | undefined> { return undefined; }
	async getDefaultBranch(): Promise<string | undefined> { return undefined; }
	async getBranches(): Promise<string[]> { return []; }
	async getRepositoryRoot(): Promise<URI | undefined> { return undefined; }
	async getWorktreeRoots(): Promise<URI[]> { return []; }
	async addWorktree(): Promise<void> { }
	async addExistingWorktree(): Promise<void> { }
	async removeWorktree(): Promise<void> { }
	async branchExists(): Promise<boolean> { return false; }
	async hasUncommittedChanges(): Promise<boolean> { return true; }
	async commitAll(): Promise<void> { }
	async restore(workingDirectory: URI, paths: readonly string[], options?: { readonly staged?: boolean; readonly ref?: string }): Promise<void> {
		this.restoreCalls.push({ workingDirectory: workingDirectory.toString(), paths, options });
		if (this.restoreError) {
			throw this.restoreError;
		}
	}
	async hasUpstream(): Promise<boolean> { return false; }
	async pushBranch(): Promise<void> { }
	async getSessionGitState(): Promise<undefined> { return undefined; }
	async computeSessionFileDiffs(): Promise<readonly ISessionFileDiff[] | undefined> { return undefined; }
	async showBlob(): Promise<undefined> { return undefined; }
	async captureWorkingTreeAsTree(): Promise<undefined> { return undefined; }
	async commitTree(): Promise<undefined> { return undefined; }
	async updateRef(): Promise<void> { }
	async deleteRefs(): Promise<void> { }
	async revParse(): Promise<string | undefined> { return undefined; }
	async computeFileDiffsBetweenRefs(): Promise<readonly ISessionFileDiff[] | undefined> { return undefined; }
}

class TestChangesetService implements IAgentHostChangesetService {
	declare readonly _serviceBrand: undefined;

	readonly calls: string[] = [];
	registerStaticChangesets(): void { }
	restoreStaticChangeset(): void { }
	parsePersistedStaticChangesets(_sessionUri: string, _metadata: IPersistedChangesetMetadata): IRestoredChangesetDiffs { return {}; }
	applyPersistedStaticChangesets(): void { }
	restorePersistedStaticChangesets(_sessionUri: string, _metadata: IPersistedChangesetMetadata): IRestoredChangesetDiffs { return {}; }
	persistChangesSummary(_sessionUri: string, _summary: ChangesSummary): void { }
	isStaticChangesetComputeActive(): boolean { return false; }
	getListMetadataKeys(_sessionUri: string): Record<string, true> | undefined { return undefined; }
	computeListEntryChanges(_sessionUri: string, _metadata: Record<string, string | undefined>): ChangesSummary | undefined { return undefined; }
	refreshBranchChangeset(): void { }
	refreshSessionChangeset(): void { }
	onWorkingDirectoryAvailable(): void { }
	recomputeSubscribedChangesets(): void { }
	onSessionDisposed(): void { }
	async computeUncommittedChangeset(session: string): Promise<string> {
		this.calls.push(`computeUncommitted:${session}`);
		return `${session}/changeset/uncommitted`;
	}
	async computeTurnChangeset(): Promise<string> { return ''; }
	async computeCompareTurnsChangeset(): Promise<string> { return ''; }
	onToolCallEditsApplied(): void { }
	onTurnComplete(): void { }
	onSessionTruncated(): void { }
}

function setup(disposables: Pick<DisposableStore, 'add'>, opts?: { readonly withWorkingDirectory?: boolean; readonly registerSession?: boolean }): { handler: AgentHostDiscardChangesOperationHandler; gitService: TestGitService; changesets: TestChangesetService; session: URI } {
	const gitService = new TestGitService();
	const changesets = new TestChangesetService();
	const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
	const session = URI.parse('agent:/session');
	if (opts?.registerSession !== false) {
		stateManager.createSession({
			resource: session.toString(),
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: 1,
			modifiedAt: 1,
			workingDirectory: opts?.withWorkingDirectory === false ? undefined : URI.file('/repo').toString(),
		});
	}
	const handler = new AgentHostDiscardChangesOperationHandler(
		sessionKey => stateManager.getSessionState(sessionKey),
		changesets,
		gitService,
		new NullLogService(),
	);
	return { handler, gitService, changesets, session };
}

function makeResourceTarget(resource: URI): InvokeChangesetOperationParams['target'] {
	// `ChangesetOperationTarget.resource` is typed as the protocol `URI` (a
	// branded string), not the workbench `URI` class.
	return { kind: ChangesetOperationTargetKind.Resource, resource: resource.toString() as unknown as InvokeChangesetOperationParams['channel'] };
}

suite('AgentHostDiscardChangesOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('restores the targeted file and recomputes the uncommitted changeset on success', async () => {
		const { handler, gitService, changesets, session } = setup(disposables);
		const target = URI.file('/repo/src/file.ts');

		const result = await handler.invoke({
			channel: buildUncommittedChangesetUri(session.toString()),
			operationId: AgentHostDiscardChangesOperationHandler.OPERATION_DISCARD_CHANGES,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			restoreCalls: gitService.restoreCalls,
			changesetCalls: changesets.calls,
			message: result.message,
		}, {
			restoreCalls: [{ workingDirectory: URI.file('/repo').toString(), paths: [target.fsPath], options: undefined }],
			changesetCalls: [`computeUncommitted:${session.toString()}`],
			message: { markdown: 'Discarded changes to `file.ts`.' },
		});
	});

	test('rejects channels that are not uncommitted-changeset URIs', async () => {
		const { handler, gitService, changesets, session } = setup(disposables);
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
			changesetCalls: changesets.calls.length,
		}, {
			code: JsonRpcErrorCodes.InvalidParams,
			restoreCalls: 0,
			changesetCalls: 0,
		});
	});

	test('throws AHP_SESSION_NOT_FOUND when the session is unknown', async () => {
		const { handler, gitService, changesets } = setup(disposables, { registerSession: false });
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
			changesetCalls: changesets.calls.length,
		}, {
			code: AHP_SESSION_NOT_FOUND,
			restoreCalls: 0,
			changesetCalls: 0,
		});
	});

	test('rejects invocations without a Resource target', async () => {
		const { handler, gitService, changesets, session } = setup(disposables);

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
			changesetCalls: changesets.calls.length,
		}, {
			code: JsonRpcErrorCodes.InvalidParams,
			restoreCalls: 0,
			changesetCalls: 0,
		});
	});

	test('throws InternalError when the session has no working directory', async () => {
		const { handler, gitService, changesets, session } = setup(disposables, { withWorkingDirectory: false });
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
			changesetCalls: changesets.calls.length,
		}, {
			code: JsonRpcErrorCodes.InternalError,
			restoreCalls: 0,
			changesetCalls: 0,
		});
	});

	test('wraps git restore failures in a ProtocolError without recomputing the changeset', async () => {
		const { handler, gitService, changesets, session } = setup(disposables);
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
			changesetCalls: changesets.calls.length,
		}, {
			code: JsonRpcErrorCodes.InternalError,
			messageContainsCause: true,
			restoreCalls: 1,
			changesetCalls: 0,
		});
	});

	test('honors cancellation before mutating the repository', async () => {
		const { handler, gitService, changesets, session } = setup(disposables);
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

		assert.deepStrictEqual({ restoreCalls: gitService.restoreCalls.length, changesetCalls: changesets.calls.length }, { restoreCalls: 0, changesetCalls: 0 });
	});
});
