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
import { buildChatUri, buildDefaultChatUri, SessionStatus, withSessionGitState, type ISessionFileDiff } from '../../common/state/sessionState.js';
import type { IDefaultBranch } from '../../common/agentHostGitService.js';
import { TestAgentHostGitService } from '../common/testAgentHostGitService.js';
import { AgentHostCommitOperationHandler } from '../../node/agentHostCommitOperationHandler.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { CopilotApiError, type ICopilotApiService, type ICopilotApiServiceRequestOptions, type ICopilotUtilityChatCompletionRequest } from '../../node/shared/copilotApiService.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE, type IAgentHostAuthTokenRequest } from '../../common/agent.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { AgentHostAuthenticationService, type IAgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';

class TestGitService extends TestAgentHostGitService {
	readonly calls: string[] = [];
	readonly workingDirectories: string[] = [];
	uncommitted = true;
	currentBranchName: string | undefined = 'feature/test';
	currentBranch: string | undefined = 'feature/test';
	diffs: readonly ISessionFileDiff[] | undefined = [{
		after: { uri: 'file:///repo/file.ts', content: { uri: 'file:///repo/file.ts' } },
		diff: { added: 1, removed: 0 },
	}];

	override async getCurrentBranch(): Promise<string | undefined> { return this.currentBranch; }
	async getCurrentBranchName(): Promise<string | undefined> { return this.currentBranchName; }
	override async getDefaultBranch(): Promise<IDefaultBranch | undefined> { return { name: 'main', startPoint: 'main' }; }
	override async getRepositoryRoot(): Promise<URI | undefined> { return URI.file('/repo'); }
	override async hasUncommittedChanges(workingDirectory: URI): Promise<boolean> {
		this.calls.push('hasUncommittedChanges');
		this.workingDirectories.push(workingDirectory.toString());
		return this.uncommitted;
	}
	override async commitAll(workingDirectory: URI, message: string): Promise<void> {
		this.calls.push(`commitAll:${message}`);
		this.workingDirectories.push(workingDirectory.toString());
		this.uncommitted = false;
	}
	override async computeSessionFileDiffs(workingDirectory: URI): Promise<readonly ISessionFileDiff[] | undefined> {
		this.calls.push('computeSessionFileDiffs');
		this.workingDirectories.push(workingDirectory.toString());
		return this.diffs;
	}
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

function createAuthenticationService(disposables: Pick<DisposableStore, 'add'>, token: string | undefined): IAgentHostAuthenticationService {
	return disposables.add(new class extends AgentHostAuthenticationService {
		override getAuthToken(request: Parameters<IAgentHostAuthenticationService['getAuthToken']>[0], source?: Parameters<IAgentHostAuthenticationService['getAuthToken']>[1]) {
			return source ? source.getCredential(request)?.token : token;
		}
	}(new NullLogService()));
}

function setup(disposables: Pick<DisposableStore, 'add'>, gitService: TestGitService, copilotApiService: TestCopilotApiService): { handler: AgentHostCommitOperationHandler; session: URI; stateManager: AgentHostStateManager } {
	const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
	const session = URI.parse('agent:/session');
	stateManager.createSession({
		resource: session.toString(),
		provider: 'copilot',
		title: 'Session',
		status: SessionStatus.Idle,
		createdAt: new Date(1).toISOString(),
		modifiedAt: new Date(1).toISOString(),
		workingDirectories: [URI.file('/repo').toString()],
		defaultChat: buildDefaultChatUri(session.toString()),
	});
	stateManager.setSessionMeta(session.toString(), withSessionGitState(undefined, {
		branchName: 'feature/test',
		uncommittedChanges: 1,
	}));
	return {
		handler: new AgentHostCommitOperationHandler(sessionKey => stateManager.getSessionState(sessionKey), createAuthenticationService(disposables, 'gh-repo-token'), createTestGitHubEndpointService(), gitService, copilotApiService, new NullLogService(), stateManager),
		session,
		stateManager,
	};
}

suite('AgentHostCommitOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const available of [false, true]) {
		test(`uses only the requester credential for commit generation (${available ? 'available' : 'missing'})`, async () => {
			const git = new TestGitService();
			const api = new TestCopilotApiService();
			const { handler, session } = setup(disposables, git, api);
			const requests: IAgentHostAuthTokenRequest[] = [];
			const operation = handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None, {
				getCredential: request => {
					requests.push(request);
					return available ? { resource: request.resource, token: 'requester-token', expiresAt: undefined, revision: 1 } : undefined;
				},
			});
			if (available) {
				await operation;
			} else {
				await assert.rejects(operation, { code: AHP_AUTH_REQUIRED });
			}
			assert.deepStrictEqual({ requests, tokens: api.calls.map(call => call.token) }, {
				requests: [
					{ resource: GITHUB_REPO_PROTECTED_RESOURCE.resource, session: session.toString() },
					{ resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource, session: session.toString() },
				],
				tokens: available ? ['requester-token'] : [],
			});
		});
	}

	test('generates a commit message and commits all changes', async () => {
		const gitService = new TestGitService();
		const copilotApiService = new TestCopilotApiService();
		const { handler, session } = setup(disposables, gitService, copilotApiService);

		const result = await handler.invoke({ channel: buildUncommittedChangesetUri(buildDefaultChatUri(session.toString())), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			gitCalls: gitService.calls,
			completion: copilotApiService.calls.map(call => ({ token: call.token, fileIncluded: call.request.messages.some(message => message.content.includes('file.ts')) })),
		}, {
			message: { markdown: 'Committed changes with message: `Update session changes`' },
			gitCalls: ['hasUncommittedChanges', 'computeSessionFileDiffs', 'commitAll:Update session changes'],
			completion: [{ token: 'gh-repo-token', fileIncluded: true }],
		});
	});

	test('runs a peer-chat operation in the peer working directory', async () => {
		const gitService = new TestGitService();
		const { handler, session, stateManager } = setup(disposables, gitService, new TestCopilotApiService());
		const peer = buildChatUri(session.toString(), 'peer');
		stateManager.addChat(session.toString(), peer, creationTimeChatStorageResource(session.toString(), peer, buildDefaultChatUri(session.toString())), { workingDirectories: [URI.file('/peer-repo').toString()] });

		await handler.invoke({ channel: buildUncommittedChangesetUri(peer), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);

		assert.deepStrictEqual(gitService.workingDirectories, ['file:///peer-repo', 'file:///peer-repo', 'file:///peer-repo']);
	});

	test('commits changes from a detached HEAD', async () => {
		const gitService = new TestGitService();
		gitService.currentBranchName = undefined;
		gitService.currentBranch = 'abc1234';
		const copilotApiService = new TestCopilotApiService();
		const { handler, session } = setup(disposables, gitService, copilotApiService);

		const result = await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			prompt: copilotApiService.calls[0]?.request.messages[1]?.content,
			gitCalls: gitService.calls,
		}, {
			message: { markdown: 'Committed changes with message: `Update session changes`' },
			prompt: `Repository: repo\nBranch: abc1234\nChanged files:\n- Create: ${URI.file('/repo/file.ts').fsPath} (+1 -0)`,
			gitCalls: ['hasUncommittedChanges', 'computeSessionFileDiffs', 'commitAll:Update session changes'],
		});
	});

	test('returns no-op success without generating a message or committing when the working tree is clean', async () => {
		const gitService = new TestGitService();
		gitService.uncommitted = false;
		const copilotApiService = new TestCopilotApiService();
		const { handler, session } = setup(disposables, gitService, copilotApiService);

		const result = await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);

		assert.deepStrictEqual({ message: result.message, gitCalls: gitService.calls, completionCalls: copilotApiService.calls.length }, {
			message: { markdown: 'No uncommitted changes to commit.' },
			gitCalls: ['hasUncommittedChanges'],
			completionCalls: 0,
		});
	});

	test('honors cancellation before mutating the repository', async () => {
		const gitService = new TestGitService();
		const copilotApiService = new TestCopilotApiService();
		const { handler, session } = setup(disposables, gitService, copilotApiService);
		const cts = disposables.add(new CancellationTokenSource());
		cts.cancel();

		await assert.rejects(
			() => handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, cts.token),
			/Commit operation was cancelled/,
		);

		assert.deepStrictEqual({ gitCalls: gitService.calls, completionCalls: copilotApiService.calls.length }, {
			gitCalls: [],
			completionCalls: 0,
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
		const { handler, session } = setup(disposables, gitService, copilotApiService);

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
		}, {
			code: AHP_AUTH_REQUIRED,
			data: [GITHUB_COPILOT_PROTECTED_RESOURCE],
			gitCalls: ['hasUncommittedChanges', 'computeSessionFileDiffs'],
			completionCalls: 1,
		});
	});

	test('maps Copilot API auth failures to AHP_AUTH_REQUIRED before committing', async () => {
		const gitService = new TestGitService();
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.error = new Error('Copilot API authorization failed: 403 Forbidden');
		const { handler, session } = setup(disposables, gitService, copilotApiService);

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
		}, {
			code: AHP_AUTH_REQUIRED,
			data: [GITHUB_COPILOT_PROTECTED_RESOURCE],
			gitCalls: ['hasUncommittedChanges', 'computeSessionFileDiffs'],
			completionCalls: 1,
		});
	});
});
