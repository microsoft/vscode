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
import type { IAgentHostGitService } from '../../node/agentHostGitService.js';
import { AgentHostCommitOperationHandler } from '../../node/agentHostCommitOperationHandler.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { IAgentHostChangesetService, IPersistedChangesetMetadata, IRestoredChangesetDiffs, StaticChangesetKind } from '../../node/agentHostChangesetService.js';
import type { ICopilotApiService, ICopilotApiServiceRequestOptions, ICopilotUtilityChatCompletionRequest } from '../../node/shared/copilotApiService.js';
import { IAgentService } from '../../common/agentService.js';

class TestGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	readonly calls: string[] = [];
	uncommitted = true;
	diffs: readonly ISessionFileDiff[] | undefined = [{
		after: { uri: 'file:///repo/file.ts', content: { uri: 'file:///repo/file.ts' } },
		diff: { added: 1, removed: 0 },
	}];

	async isInsideWorkTree(): Promise<boolean> { return true; }
	async getCurrentBranch(): Promise<string | undefined> { return 'feature/test'; }
	async getDefaultBranch(): Promise<string | undefined> { return 'main'; }
	async getBranches(): Promise<string[]> { return []; }
	async getRepositoryRoot(): Promise<URI | undefined> { return URI.file('/repo'); }
	async getWorktreeRoots(): Promise<URI[]> { return []; }
	async addWorktree(): Promise<void> { }
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
	async hasUpstream(): Promise<boolean> { return false; }
	async pushBranch(): Promise<void> { }
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
	async computeFileDiffsBetweenRefs(): Promise<readonly ISessionFileDiff[] | undefined> { return undefined; }
}

class TestCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	readonly calls: { token: string; request: ICopilotUtilityChatCompletionRequest; options?: ICopilotApiServiceRequestOptions }[] = [];
	response = '```text\nUpdate session changes\n```';

	messages(_githubToken: string, request: Anthropic.MessageCreateParamsStreaming, _options?: ICopilotApiServiceRequestOptions): AsyncGenerator<Anthropic.MessageStreamEvent>;
	messages(_githubToken: string, request: Anthropic.MessageCreateParamsNonStreaming, _options?: ICopilotApiServiceRequestOptions): Promise<Anthropic.Message>;
	messages(): AsyncGenerator<Anthropic.MessageStreamEvent> | Promise<Anthropic.Message> {
		throw new Error('not used');
	}
	async countTokens(): Promise<Anthropic.MessageTokensCount> { throw new Error('not used'); }
	async models(): Promise<CCAModel[]> { return []; }
	async utilityChatCompletion(githubToken: string, request: ICopilotUtilityChatCompletionRequest, options?: ICopilotApiServiceRequestOptions): Promise<string> {
		this.calls.push({ token: githubToken, request, options });
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
	isStaticChangesetComputeActive(): boolean { return false; }
	refreshUncommittedChangeset(session: string): void { this.calls.push(`refreshUncommitted:${session}`); }
	refreshSessionChangeset(session: string): void { this.calls.push(`refreshSession:${session}`); }
	async computeTurnChangeset(_session: string, _turnId: string): Promise<string> { return ''; }
	async computeCompareTurnsChangeset(_session: string, _originalTurnId: string, _modifiedTurnId: string): Promise<string> { return ''; }
	onToolCallEditsApplied(_session: string, _turnId: string): void { }
	onTurnComplete(_session: string, _turnId: string | undefined): void { }
	onSessionTruncated(_session: string): void { }
	setTurnSubscriberProbe(_probe: (session: string, turnId: string) => boolean): void { }
}

function createAgentService(token: string | undefined): IAgentService {
	return {
		getAuthToken: () => token,
	} as Partial<IAgentService> as IAgentService;
}

function setup(disposables: Pick<DisposableStore, 'add'>, gitService: TestGitService, copilotApiService: TestCopilotApiService, changesets: TestChangesetService): { handler: AgentHostCommitOperationHandler; session: URI; committedSessions: string[] } {
	const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
	const session = URI.parse('agent:/session');
	const committedSessions: string[] = [];
	stateManager.createSession({
		resource: session.toString(),
		provider: 'copilot',
		title: 'Session',
		status: SessionStatus.Idle,
		createdAt: 1,
		modifiedAt: 1,
		workingDirectory: URI.file('/repo').toString(),
	});
	stateManager.setSessionMeta(session.toString(), withSessionGitState(undefined, {
		branchName: 'feature/test',
		uncommittedChanges: 1,
	}));
	return {
		handler: new AgentHostCommitOperationHandler(sessionKey => stateManager.getSessionState(sessionKey), async sessionKey => { committedSessions.push(sessionKey); }, createAgentService('gh-repo-token'), gitService, copilotApiService, changesets, new NullLogService()),
		session,
		committedSessions,
	};
}

suite('AgentHostCommitOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('generates a commit message, commits all changes, and refreshes changesets', async () => {
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
			changesetCalls: ['refreshUncommitted:agent:/session', 'refreshSession:agent:/session'],
			committedSessions: ['agent:/session'],
		});
	});

	test('does not generate a message or commit when the working tree is clean', async () => {
		const gitService = new TestGitService();
		gitService.uncommitted = false;
		const copilotApiService = new TestCopilotApiService();
		const changesets = new TestChangesetService();
		const { handler, session } = setup(disposables, gitService, copilotApiService, changesets);

		await assert.rejects(
			() => handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None),
			/no uncommitted changes/,
		);

		assert.deepStrictEqual({ gitCalls: gitService.calls, completionCalls: copilotApiService.calls.length, changesetCalls: changesets.calls }, {
			gitCalls: ['hasUncommittedChanges'],
			completionCalls: 0,
			changesetCalls: [],
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
});
