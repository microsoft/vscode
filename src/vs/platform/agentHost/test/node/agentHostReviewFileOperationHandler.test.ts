/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildBranchChangesetUri, buildSessionChangesetUri } from '../../common/changesetUri.js';
import { META_DIFF_BASE_BRANCH } from '../../common/agentHostGitService.js';
import type { IAgentHostReviewService } from '../../common/agentHostReviewService.js';
import { ChangesetOperationTargetKind, type InvokeChangesetOperationParams } from '../../common/state/protocol/channels-changeset/commands.js';
import { AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { SessionStatus, } from '../../common/state/sessionState.js';
import { AgentHostReviewFileOperationHandler } from '../../node/agentHostReviewFileOperationHandler.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createNoopChangesetService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

interface IRecordedCall {
	readonly session: string;
	readonly workingDirectory: string;
	readonly baseBranch: string | undefined;
	readonly resource: string;
}

class TestReviewService implements IAgentHostReviewService {
	declare readonly _serviceBrand: undefined;

	readonly markCalls: IRecordedCall[] = [];
	readonly unmarkCalls: IRecordedCall[] = [];
	error: Error | undefined;

	async markFileReviewed(session: string, workingDirectory: URI, baseBranch: string | undefined, resource: URI): Promise<void> {
		this.markCalls.push({ session, workingDirectory: workingDirectory.toString(), baseBranch, resource: resource.toString() });
		if (this.error) { throw this.error; }
	}

	async markFileUnreviewed(session: string, workingDirectory: URI, baseBranch: string | undefined, resource: URI): Promise<void> {
		this.unmarkCalls.push({ session, workingDirectory: workingDirectory.toString(), baseBranch, resource: resource.toString() });
		if (this.error) { throw this.error; }
	}

	async getReviewedPaths(): Promise<ReadonlySet<string>> {
		return new Set();
	}

	async copyReviewedRef(): Promise<void> { }
}

function makeResourceTarget(resource: URI): InvokeChangesetOperationParams['target'] {
	return { kind: ChangesetOperationTargetKind.Resource, resource: resource.toString() as unknown as InvokeChangesetOperationParams['channel'] };
}

function setup(disposables: Pick<DisposableStore, 'add'>, opts?: { readonly reviewed?: boolean; readonly withWorkingDirectory?: boolean; readonly registerSession?: boolean; readonly baseBranch?: string }): { handler: AgentHostReviewFileOperationHandler; reviewService: TestReviewService; refreshedSessions: string[]; session: URI } {
	const reviewService = new TestReviewService();
	const database = new TestSessionDatabase();
	if (opts?.baseBranch) {
		database.setMetadata(META_DIFF_BASE_BRANCH, opts.baseBranch);
	}
	const sessionDataService = createSessionDataService(database);
	const refreshedSessions: string[] = [];
	const changesetService = createNoopChangesetService();
	changesetService.refreshBranchChangeset = session => { refreshedSessions.push(session); };
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
			workingDirectory: opts?.withWorkingDirectory === false ? undefined : URI.file('/repo').toString(),
		});
	}
	const handler = new AgentHostReviewFileOperationHandler(
		opts?.reviewed ?? true,
		sessionKey => stateManager.getSessionState(sessionKey),
		reviewService,
		changesetService,
		sessionDataService,
		new NullLogService(),
	);
	return { handler, reviewService, refreshedSessions, session };
}

suite('AgentHostReviewFileOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('marks the targeted file as reviewed, passing the resolved base branch', async () => {
		const { handler, reviewService, refreshedSessions, session } = setup(disposables, { reviewed: true, baseBranch: 'main' });
		const target = URI.file('/repo/src/file.ts');

		const result = await handler.invoke({
			channel: buildBranchChangesetUri(session.toString()),
			operationId: AgentHostReviewFileOperationHandler.OPERATION_MARK_AS_REVIEWED,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			markCalls: reviewService.markCalls,
			unmarkCalls: reviewService.unmarkCalls,
			refreshedSessions,
			message: result.message,
		}, {
			markCalls: [{ session: session.toString(), workingDirectory: URI.file('/repo').toString(), baseBranch: 'main', resource: target.toString() }],
			unmarkCalls: [],
			refreshedSessions: [session.toString()],
			message: { markdown: 'Marked `file.ts` as reviewed.' },
		});
	});

	test('clears the reviewed mark for the targeted file', async () => {
		const { handler, reviewService, refreshedSessions, session } = setup(disposables, { reviewed: false });
		const target = URI.file('/repo/src/file.ts');

		const result = await handler.invoke({
			channel: buildBranchChangesetUri(session.toString()),
			operationId: AgentHostReviewFileOperationHandler.OPERATION_MARK_AS_UNREVIEWED,
			target: makeResourceTarget(target),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			markCalls: reviewService.markCalls,
			unmarkCalls: reviewService.unmarkCalls,
			refreshedSessions,
			message: result.message,
		}, {
			markCalls: [],
			unmarkCalls: [{ session: session.toString(), workingDirectory: URI.file('/repo').toString(), baseBranch: undefined, resource: target.toString() }],
			refreshedSessions: [session.toString()],
			message: { markdown: 'Removed the reviewed mark from `file.ts`.' },
		});
	});

	test('rejects channels that are not branch-changeset URIs', async () => {
		const { handler, reviewService, session } = setup(disposables);

		let err: ProtocolError | undefined;
		try {
			await handler.invoke({
				channel: buildSessionChangesetUri(session.toString()),
				operationId: AgentHostReviewFileOperationHandler.OPERATION_MARK_AS_REVIEWED,
				target: makeResourceTarget(URI.file('/repo/src/file.ts')),
			}, CancellationToken.None);
		} catch (error) {
			err = error as ProtocolError;
		}

		assert.deepStrictEqual({ code: err?.code, marks: reviewService.markCalls.length }, { code: JsonRpcErrorCodes.InvalidParams, marks: 0 });
	});

	test('throws AHP_SESSION_NOT_FOUND when the session is unknown', async () => {
		const { handler, reviewService } = setup(disposables, { registerSession: false });
		const session = URI.parse('agent:/missing');

		let err: ProtocolError | undefined;
		try {
			await handler.invoke({
				channel: buildBranchChangesetUri(session.toString()),
				operationId: AgentHostReviewFileOperationHandler.OPERATION_MARK_AS_REVIEWED,
				target: makeResourceTarget(URI.file('/repo/src/file.ts')),
			}, CancellationToken.None);
		} catch (error) {
			err = error as ProtocolError;
		}

		assert.deepStrictEqual({ code: err?.code, marks: reviewService.markCalls.length }, { code: AHP_SESSION_NOT_FOUND, marks: 0 });
	});

	test('rejects invocations without a Resource target', async () => {
		const { handler, reviewService, session } = setup(disposables);

		let err: ProtocolError | undefined;
		try {
			await handler.invoke({
				channel: buildBranchChangesetUri(session.toString()),
				operationId: AgentHostReviewFileOperationHandler.OPERATION_MARK_AS_REVIEWED,
				target: undefined,
			}, CancellationToken.None);
		} catch (error) {
			err = error as ProtocolError;
		}

		assert.deepStrictEqual({ code: err?.code, marks: reviewService.markCalls.length }, { code: JsonRpcErrorCodes.InvalidParams, marks: 0 });
	});
});
