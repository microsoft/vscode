/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type Anthropic from '@anthropic-ai/sdk';
import type { CCAModel } from '@vscode/copilot-api';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { SessionStatus, withSessionGitState, type ISessionFileDiff } from '../../common/state/sessionState.js';
import type { IAgentHostGitService, IDefaultBranch } from '../../common/agentHostGitService.js';
import { AgentHostCommitOperationHandler } from '../../node/agentHostCommitOperationHandler.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { CopilotApiError, type ICopilotApiService, type ICopilotApiServiceRequestOptions, type ICopilotUtilityChatCompletionRequest } from '../../node/shared/copilotApiService.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE, IAgentService } from '../../common/agentService.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ChangesSummary } from '../../common/state/protocol/state.js';
import type { IAgentHostChangesetService, IPersistedChangesetMetadata, IRestoredChangesetDiffs, StaticChangesetKind } from '../../common/agentHostChangesetService.js';

class TestGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	readonly calls: string[] = [];
	uncommitted = true;
	diffs: readonly ISessionFileDiff[] | undefined = [{
		after: { uri: 'file:///repo/file.ts', content: { uri: 'file:///repo/file.ts' } },
		diff: { added: 1, removed: 0 },
	}];

	async getCurrentBranch(): Promise<string | undefined> { return 'feature/test'; }
	async getDefaultBranch(): Promise<IDefaultBranch | undefined> { return { name: 'main', startPoint: 'main' }; }
	async getBranches(): Promise<string[]> { return []; }
	async getRepositoryRoot(): Promise<URI | undefined> { return URI.file('/repo'); }
	async getWorktreeRoots(): Promise<URI[]> { return []; }
	async addWorktree(): Promise<void> { }
	async copyWorktreeIncludeFiles(): Promise<void> { }
	async addExistingWorktree(): Promise<void> { }
	async removeWorktree(): Promise<void> { }
	async branchExists(): Promise<boolean> { return false; }
	async hasUncommittedChanges(): Promise<boolean> {
		this.calls.push('hasUncommittedChanges');
		return this.uncommitted;
	}
	async commitAll(_workingDirectory: URI, message: string): Promise<void> {
		this.calls.push(`commitAll:${message}`);
		this.uncommitted = false;
	}
	async restore(): Promise<void> { }
	async hasUpstream(): Promise<boolean> { return false; }
	async pull(): Promise<void> { }
	async push(): Promise<void> { }
	async getSessionGitState(): Promise<undefined> { return undefined; }
	async computeSessionFileDiffs(): Promise<readonly ISessionFileDiff[] | undefined> {
		this.calls.push('computeSessionFileDiffs');
		return this.diffs;
	}
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
}

class TestCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	readonly calls: { token: string; request: ICopilotUtilityChatCompletionRequest; options?: ICopilotApiServiceRequestOptions }[] = [];
	response = '```text\nUpdate session changes\n```';
	error: Error | undefined;

	messages(_githubToken: string, request: Anthropic.MessageCreateParamsStreaming, _options?: ICopilotApiServiceRequestOptions): AsyncGenerator<Anthropic.MessageStreamEvent>;
	messages(_githubToken: string, request: Anthropic.MessageCreateParamsNonStreaming, _options?: ICopilotApiServiceRequestOptions): Promise<Anthropic.Message>;
	messages(): AsyncGenerator<Anthropic.MessageStreamEvent> | Promise<Anthropic.Message> {
		throw new Error('not used');
	}
	responses(
		githubToken: string,
		body: string,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<Response> {
		throw new Error('not used');
	}
	async countTokens(): Promise<Anthropic.MessageTokensCount> { throw new Error('not used'); }
	async models(): Promise<CCAModel[]> { return []; }
	async resolveRestrictedTelemetryContext() { return { restrictedTelemetryEnabled: false, trackingId: undefined, telemetryEndpoint: undefined }; }
	async resolveApiEndpoint() { return undefined; }
	async utilityChatCompletion(githubToken: string, request: ICopilotUtilityChatCompletionRequest, options?: ICopilotApiServiceRequestOptions): Promise<string> {
		this.calls.push({ token: githubToken, request, options });
		if (this.error) {
			throw this.error;
		}
		return this.response;
	}
}

class TestChangesetService implements IAgentHostChangesetService {
	declare readonly _serviceBrand: undefined;

	readonly calls: string[] = [];
	registerStaticChangesets(): void { }
	restoreStaticChangeset(_session: string, _kind: StaticChangesetKind, _diffs: readonly ISessionFileDiff[]): void { }
	parsePersistedStaticChangesets(_sessionUri: string, _metadata: IPersistedChangesetMetadata): IRestoredChangesetDiffs { return {}; }
	applyPersistedStaticChangesets(_sessionUri: string, _diffs: IRestoredChangesetDiffs): void { }
	restorePersistedStaticChangesets(_sessionUri: string, _metadata: IPersistedChangesetMetadata): IRestoredChangesetDiffs { return {}; }
	persistChangesSummary(_sessionUri: string, _summary: ChangesSummary): void { }
	isStaticChangesetComputeActive(): boolean { return false; }
	getListMetadataKeys(_sessionUri: string): Record<string, true> | undefined { return undefined; }
	computeListEntryChanges(_sessionUri: string, _metadata: Record<string, string | undefined>): ChangesSummary | undefined { return undefined; }
	refreshChangesetCatalog(session: string): void { this.calls.push(`refreshChangesets:${session}`); }
	refreshBranchChangeset(session: string): void { this.calls.push(`refreshBranch:${session}`); }
	refreshSessionChangeset(session: string): void { this.calls.push(`refreshSession:${session}`); }
	onWorkingDirectoryAvailable(_session: string): void { }
	recomputeSubscribedChangesets(_session: string): void { }
	onSessionDisposed(_session: string): void { }
	async computeUncommittedChangeset(session: string): Promise<string> { this.calls.push(`computeUncommitted:${session}`); return `${session}/changeset/uncommitted`; }
	async computeTurnChangeset(_session: string, _turnId: string): Promise<string> { return ''; }
	async computeCompareTurnsChangeset(_session: string, _originalTurnId: string, _modifiedTurnId: string): Promise<string> { return ''; }
	onToolCallEditsApplied(_session: string, _turnId: string): void { }
	onTurnComplete(_session: string, _turnId: string | undefined): void { }
	onSessionTruncated(_session: string): void { }
}

function createAgentService(token: string | undefined): IAgentService {
	return {
		getAuthToken: () => token,
	} as Partial<IAgentService> as IAgentService;
}

function setup(disposables: Pick<DisposableStore, 'add'>, gitService: TestGitService, copilotApiService: TestCopilotApiService, changesets: TestChangesetService, options?: { readonly onCommittedError?: Error }): { handler: AgentHostCommitOperationHandler; session: URI; committedSessions: string[] } {
	const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
	const session = URI.parse('agent:/session');
	const committedSessions: string[] = [];
	stateManager.createSession({
		resource: session.toString(),
		provider: 'copilot',
		title: 'Session',
		status: SessionStatus.Idle,
		createdAt: new Date(1).toISOString(),
		modifiedAt: new Date(1).toISOString(),
		workingDirectory: URI.file('/repo').toString(),
	});
	stateManager.setSessionMeta(session.toString(), withSessionGitState(undefined, {
		branchName: 'feature/test',
		uncommittedChanges: 1,
	}));
	return {
		handler: new AgentHostCommitOperationHandler(sessionKey => stateManager.getSessionState(sessionKey), async sessionKey => {
			committedSessions.push(sessionKey);
			changesets.calls.push(`onCommitted:${sessionKey}`);
			if (options?.onCommittedError) {
				throw options.onCommittedError;
			}
		}, createAgentService('gh-repo-token'), createTestGitHubEndpointService(), gitService, copilotApiService, new NullLogService()),
		session,
		committedSessions,
	};
}

suite('AgentHostCommitOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test.skip('generates a commit message, commits all changes, and refreshes changesets', async () => {
		const gitService = new TestGitService();
		const copilotApiService = new TestCopilotApiService();
		const changesets = new TestChangesetService();
		const { handler, session, committedSessions } = setup(disposables, gitService, copilotApiService, changesets);

		const result = await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			gitCalls: gitService.calls,
			completion: copilotApiService.calls.map(call => ({ token: call.token, fileIncluded: call.request.messages.some(message => message.content.includes('file.ts')) })),
			changesetCalls: changesets.calls,
			committedSessions,
		}, {
			message: { markdown: 'Committed changes with message: `Update session changes`' },
			gitCalls: ['hasUncommittedChanges', 'computeSessionFileDiffs', 'commitAll:Update session changes'],
			completion: [{ token: 'gh-repo-token', fileIncluded: true }],
			changesetCalls: ['onCommitted:agent:/session', 'computeUncommitted:agent:/session', 'refreshSession:agent:/session'],
			committedSessions: ['agent:/session'],
		});
	});

	test('returns no-op success without generating a message or committing when the working tree is clean', async () => {
		const gitService = new TestGitService();
		gitService.uncommitted = false;
		const copilotApiService = new TestCopilotApiService();
		const changesets = new TestChangesetService();
		const { handler, session } = setup(disposables, gitService, copilotApiService, changesets);

		const result = await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);

		assert.deepStrictEqual({ message: result.message, gitCalls: gitService.calls, completionCalls: copilotApiService.calls.length, changesetCalls: changesets.calls }, {
			message: { markdown: 'No uncommitted changes to commit.' },
			gitCalls: ['hasUncommittedChanges'],
			completionCalls: 0,
			changesetCalls: [],
		});
	});

	test.skip('returns success when post-commit refresh fails', async () => {
		const gitService = new TestGitService();
		const copilotApiService = new TestCopilotApiService();
		const changesets = new TestChangesetService();
		const { handler, session, committedSessions } = setup(disposables, gitService, copilotApiService, changesets, { onCommittedError: new Error('refresh failed') });

		const result = await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			gitCalls: gitService.calls,
			changesetCalls: changesets.calls,
			committedSessions,
		}, {
			message: { markdown: 'Committed changes with message: `Update session changes`' },
			gitCalls: ['hasUncommittedChanges', 'computeSessionFileDiffs', 'commitAll:Update session changes'],
			changesetCalls: ['onCommitted:agent:/session', 'computeUncommitted:agent:/session', 'refreshSession:agent:/session'],
			committedSessions: ['agent:/session'],
		});
	});

	test('honors cancellation before mutating the repository', async () => {
		const gitService = new TestGitService();
		const copilotApiService = new TestCopilotApiService();
		const changesets = new TestChangesetService();
		const { handler, session } = setup(disposables, gitService, copilotApiService, changesets);
		const cts = disposables.add(new CancellationTokenSource());
		cts.cancel();

		await assert.rejects(
			() => handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, cts.token),
			/Commit operation was cancelled/,
		);

		assert.deepStrictEqual({ gitCalls: gitService.calls, completionCalls: copilotApiService.calls.length, changesetCalls: changesets.calls }, {
			gitCalls: [],
			completionCalls: 0,
			changesetCalls: [],
		});
	});

	test('maps stale Copilot auth failures to AHP_AUTH_REQUIRED before committing', async () => {
		const gitService = new TestGitService();
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.error = new CopilotApiError(401, {
			type: 'error',
			error: { type: 'authentication_error', message: 'bad token' },
			request_id: null,
		});
		const changesets = new TestChangesetService();
		const { handler, session, committedSessions } = setup(disposables, gitService, copilotApiService, changesets);

		let err: ProtocolError | undefined;
		try {
			await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);
		} catch (error) {
			err = error as ProtocolError;
		}

		assert.deepStrictEqual({
			code: err?.code,
			data: err?.data,
			gitCalls: gitService.calls,
			completionCalls: copilotApiService.calls.length,
			changesetCalls: changesets.calls,
			committedSessions,
		}, {
			code: AHP_AUTH_REQUIRED,
			data: [GITHUB_COPILOT_PROTECTED_RESOURCE],
			gitCalls: ['hasUncommittedChanges', 'computeSessionFileDiffs'],
			completionCalls: 1,
			changesetCalls: [],
			committedSessions: [],
		});
	});

	test('maps Copilot token mint auth failures to AHP_AUTH_REQUIRED before committing', async () => {
		const gitService = new TestGitService();
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.error = new Error('Copilot session token mint failed: 403 Forbidden');
		const changesets = new TestChangesetService();
		const { handler, session, committedSessions } = setup(disposables, gitService, copilotApiService, changesets);

		let err: ProtocolError | undefined;
		try {
			await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);
		} catch (error) {
			err = error as ProtocolError;
		}

		assert.deepStrictEqual({
			code: err?.code,
			data: err?.data,
			gitCalls: gitService.calls,
			completionCalls: copilotApiService.calls.length,
			changesetCalls: changesets.calls,
			committedSessions,
		}, {
			code: AHP_AUTH_REQUIRED,
			data: [GITHUB_COPILOT_PROTECTED_RESOURCE],
			gitCalls: ['hasUncommittedChanges', 'computeSessionFileDiffs'],
			completionCalls: 1,
			changesetCalls: [],
			committedSessions: [],
		});
	});
});
