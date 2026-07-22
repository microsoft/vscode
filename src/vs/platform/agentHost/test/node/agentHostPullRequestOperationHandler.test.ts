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
import { GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE, type IAgentService } from '../../common/agentService.js';
import { buildSessionChangesetUri } from '../../common/changesetUri.js';
import { withSessionGitHubState, withSessionGitState, type ISessionFileDiff, MessageKind, ResponsePartKind, SessionStatus, TurnState, type Turn } from '../../common/state/sessionState.js';
import type { IAgentHostGitService, IDefaultBranch, IPushOptions } from '../../common/agentHostGitService.js';
import { AgentHostPullRequestOperationHandler } from '../../node/agentHostPullRequestOperationHandler.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { AutoMergeMethod, CreatedPullRequest, IAgentHostOctoKitService } from '../../node/shared/agentHostOctoKitService.js';
import type { ICopilotApiService, ICopilotApiServiceRequestOptions, ICopilotUtilityChatCompletionRequest } from '../../node/shared/copilotApiService.js';
import type Anthropic from '@anthropic-ai/sdk';
import type { CCAModel } from '@vscode/copilot-api';

class TestCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	readonly calls: { token: string; request: ICopilotUtilityChatCompletionRequest; options?: ICopilotApiServiceRequestOptions }[] = [];
	response = 'Generated PR title\n\nGenerated PR description.';
	error: Error | undefined;

	messages(_githubToken: string, _request: Anthropic.MessageCreateParamsStreaming, _options?: ICopilotApiServiceRequestOptions): AsyncGenerator<Anthropic.MessageStreamEvent>;
	messages(_githubToken: string, _request: Anthropic.MessageCreateParamsNonStreaming, _options?: ICopilotApiServiceRequestOptions): Promise<Anthropic.Message>;
	messages(): AsyncGenerator<Anthropic.MessageStreamEvent> | Promise<Anthropic.Message> {
		throw new Error('not used');
	}
	async countTokens(): Promise<Anthropic.MessageTokensCount> { throw new Error('not used'); }
	async models(): Promise<CCAModel[]> { return []; }
	async responses(): Promise<Response> { throw new Error('not used'); }
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

class TestGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	readonly calls: string[] = [];
	uncommitted = false;
	upstream = false;
	branchChanges: readonly ISessionFileDiff[] | undefined = [{ after: { uri: 'file:///repo/file.ts', content: { uri: 'file:///repo/file.ts' } } }];

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
	async hasUpstream(): Promise<boolean> {
		this.calls.push('hasUpstream');
		return this.upstream;
	}
	async pull(): Promise<void> { }
	async push(_workingDirectory: URI, options: IPushOptions): Promise<void> {
		this.calls.push(`push:${options.ref}:${options.setUpstream}`);
	}
	async getSessionGitState(): Promise<undefined> { return undefined; }
	async computeSessionFileDiffs(): Promise<readonly ISessionFileDiff[] | undefined> {
		this.calls.push('computeSessionFileDiffs');
		return this.branchChanges;
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
	async getFetchRemoteUrls(): Promise<undefined> { return undefined; }
	async getUntrackedPaths(): Promise<[]> { return []; }
	async getBranchDiffSafetyInfo(): Promise<undefined> { return undefined; }
	async getDiffPatchBetweenRefs(): Promise<undefined> { return undefined; }
}

class TestOctoKitService implements IAgentHostOctoKitService {
	declare readonly _serviceBrand: undefined;

	readonly calls: string[] = [];
	existing: CreatedPullRequest | undefined;
	existingAfterCreateFailure: CreatedPullRequest | undefined;
	createError: Error | undefined;
	findAfterCreateError: Error | undefined;
	autoMergeError: Error | undefined;
	created: CreatedPullRequest = { url: 'https://github.com/microsoft/vscode/pull/123', number: 123, nodeId: 'PR_node_123' };
	lastTitle: string | undefined;
	lastBody: string | undefined;

	async createPullRequest(_owner: string, _repo: string, title: string, body: string, _head: string, _base: string, draft: boolean, _token: string, _signal: AbortSignal): Promise<CreatedPullRequest> {
		this.calls.push(`createPullRequest:${draft}`);
		this.lastTitle = title;
		this.lastBody = body;
		if (this.createError) {
			throw this.createError;
		}
		return this.created;
	}
	async findPullRequestByHeadBranch(_owner: string, _repo: string, branch: string, _token: string, _signal: AbortSignal): Promise<CreatedPullRequest | undefined> {
		this.calls.push(`findPullRequestByHeadBranch:${branch}`);
		if (this.calls.some(call => call.startsWith('createPullRequest:'))) {
			if (this.findAfterCreateError) {
				throw this.findAfterCreateError;
			}
			return this.existingAfterCreateFailure;
		}
		return this.existing;
	}
	async enablePullRequestAutoMerge(pullRequestId: string, mergeMethod: AutoMergeMethod, _token: string, _signal: AbortSignal): Promise<void> {
		this.calls.push(`enablePullRequestAutoMerge:${pullRequestId}:${mergeMethod}`);
		if (this.autoMergeError) {
			throw this.autoMergeError;
		}
	}
}

function createAgentService(withCopilotToken = false): IAgentService {
	return {
		getAuthToken: resource => {
			if (resource.resource === GITHUB_REPO_PROTECTED_RESOURCE.resource) {
				return 'gh-token';
			}
			if (withCopilotToken && resource.resource === GITHUB_COPILOT_PROTECTED_RESOURCE.resource) {
				return 'copilot-token';
			}
			return undefined;
		},
	} as IAgentService;
}

function setup(disposables: Pick<DisposableStore, 'add'>, gitService: TestGitService, octoKitService: TestOctoKitService, options?: { copilotApiService?: TestCopilotApiService; withCopilotToken?: boolean; turns?: Turn[]; draft?: boolean; autoMergeMethod?: AutoMergeMethod }): { handler: AgentHostPullRequestOperationHandler; session: URI; createdEvents: string[]; copilotApiService: TestCopilotApiService } {
	const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
	const session = URI.parse('agent:/session');
	const createdEvents: string[] = [];
	stateManager.createSession({
		resource: session.toString(),
		provider: 'copilot',
		title: 'Session',
		status: SessionStatus.Idle,
		createdAt: new Date(1).toISOString(),
		modifiedAt: new Date(1).toISOString(),
		workingDirectory: URI.file('/repo').toString(),
	});
	// Git state and GitHub state now share the single `_meta` bag.
	const sessionMeta = withSessionGitHubState(withSessionGitState(undefined, {
		hasGitHubRemote: true,
		githubOwner: 'microsoft',
		githubRepo: 'vscode',
		branchName: 'feature/test',
		baseBranchName: 'main',
	}), {
		owner: 'microsoft',
		repo: 'vscode',
	});
	stateManager.setSessionMeta(session.toString(), sessionMeta);
	const copilotApiService = options?.copilotApiService ?? new TestCopilotApiService();
	return {
		handler: new AgentHostPullRequestOperationHandler(
			options?.draft ?? false,
			options?.autoMergeMethod,
			sessionKey => {
				const state = stateManager.getSessionState(sessionKey);
				if (state && options?.turns) {
					return { ...state, turns: options.turns };
				}
				return state;
			},
			event => createdEvents.push(`${event.sessionKey}:${event.pullRequestUrl}`),
			createAgentService(options?.withCopilotToken), gitService, octoKitService, createTestGitHubEndpointService(), copilotApiService, new NullLogService()),
		session,
		createdEvents,
		copilotApiService,
	};
}

suite('AgentHostPullRequestOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	// Matches the Copilot CLI Agent Window behavior: if the session has
	// uncommitted work, Create PR first commits that work, then pushes the
	// branch, then asks GitHub to create the PR.
	test('commits uncommitted changes before pushing and creating a pull request', async () => {
		const gitService = new TestGitService();
		gitService.uncommitted = true;
		const octoKitService = new TestOctoKitService();
		const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService);

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			gitCalls: gitService.calls,
			octoCalls: octoKitService.calls,
			createdEvents,
		}, {
			message: { markdown: 'Created pull request [#123](https://github.com/microsoft/vscode/pull/123).' },
			gitCalls: [
				'hasUncommittedChanges',
				'commitAll:Agent Host changes for feature/test',
				'computeSessionFileDiffs',
				'hasUpstream',
				'push:feature/test:true',
			],
			octoCalls: [
				'findPullRequestByHeadBranch:feature/test',
				'createPullRequest:false',
			],
			createdEvents: ['agent:/session:https://github.com/microsoft/vscode/pull/123'],
		});
	});

	// GitHub returns 422 when a PR already exists for the branch. The handler
	// should preflight the branch and return/open the existing PR instead of
	// trying to create a duplicate.
	test('returns an existing pull request without creating a duplicate', async () => {
		const gitService = new TestGitService();
		const octoKitService = new TestOctoKitService();
		octoKitService.existing = { url: 'https://github.com/microsoft/vscode/pull/7', number: 7 };
		const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService);

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			octoCalls: octoKitService.calls,
			followUp: result.followUp,
			createdEvents,
		}, {
			message: { markdown: 'Pull request [#7](https://github.com/microsoft/vscode/pull/7) already exists.' },
			octoCalls: ['findPullRequestByHeadBranch:feature/test'],
			followUp: { content: { uri: 'https://github.com/microsoft/vscode/pull/7', contentType: 'text/html' }, external: true },
			createdEvents: ['agent:/session:https://github.com/microsoft/vscode/pull/7'],
		});
	});

	// A visible PR button can race with refreshed git state. If the backend
	// discovers that the branch has no file changes, it should stop before
	// calling GitHub so the user gets a local, actionable failure.
	test('does not call GitHub when there are no branch changes', async () => {
		const gitService = new TestGitService();
		gitService.branchChanges = [];
		const octoKitService = new TestOctoKitService();
		const { handler, session } = setup(disposables, gitService, octoKitService);

		await assert.rejects(
			() => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None),
			/no branch changes/,
		);
		assert.deepStrictEqual(octoKitService.calls, []);
	});

	test('does not push or call GitHub when branch changes cannot be computed', async () => {
		const gitService = new TestGitService();
		gitService.branchChanges = undefined;
		const octoKitService = new TestOctoKitService();
		const { handler, session } = setup(disposables, gitService, octoKitService);

		await assert.rejects(
			() => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None),
			/Could not compute branch changes/,
		);

		assert.deepStrictEqual({ gitCalls: gitService.calls, octoCalls: octoKitService.calls }, {
			gitCalls: ['hasUncommittedChanges', 'computeSessionFileDiffs'],
			octoCalls: [],
		});
	});

	test('returns existing pull request found after create failure', async () => {
		const gitService = new TestGitService();
		const octoKitService = new TestOctoKitService();
		octoKitService.createError = new Error('Validation Failed');
		octoKitService.existingAfterCreateFailure = { url: 'https://github.com/microsoft/vscode/pull/8', number: 8 };
		const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService);

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		assert.deepStrictEqual({ message: result.message, octoCalls: octoKitService.calls, createdEvents }, {
			message: { markdown: 'Pull request [#8](https://github.com/microsoft/vscode/pull/8) already exists.' },
			octoCalls: ['findPullRequestByHeadBranch:feature/test', 'createPullRequest:false', 'findPullRequestByHeadBranch:feature/test'],
			createdEvents: ['agent:/session:https://github.com/microsoft/vscode/pull/8'],
		});
	});

	test('preserves create failure when existing pull request recovery fails', async () => {
		const gitService = new TestGitService();
		const octoKitService = new TestOctoKitService();
		octoKitService.createError = new Error('create failed');
		octoKitService.findAfterCreateError = new Error('find failed');
		const { handler, session } = setup(disposables, gitService, octoKitService);

		await assert.rejects(
			() => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None),
			/create failed/,
		);
	});

	test('honors cancellation before mutating the repository', async () => {
		const gitService = new TestGitService();
		const octoKitService = new TestOctoKitService();
		const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService);
		const cts = new CancellationTokenSource();
		disposables.add(cts);
		cts.cancel();

		await assert.rejects(
			() => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, cts.token),
			/Pull request operation was cancelled/,
		);

		assert.deepStrictEqual({ gitCalls: gitService.calls, octoCalls: octoKitService.calls, createdEvents }, {
			gitCalls: [],
			octoCalls: [],
			createdEvents: [],
		});
	});

	// When a Copilot token is available, the handler asks the utility model
	// for a title/description, feeding it the main session conversation (only
	// the markdown text of requests/responses — reasoning, tool calls, and
	// subagents are excluded) plus the changed-file summary.
	test('generates the PR title and description from the conversation via the model', async () => {
		const gitService = new TestGitService();
		const octoKitService = new TestOctoKitService();
		const turns: Turn[] = [{
			id: 'turn-1',
			message: { text: 'Add retry logic to the uploader', origin: { kind: MessageKind.User } },
			responseParts: [
				{ kind: ResponsePartKind.Reasoning, id: 'r1', content: 'SECRET_REASONING_SHOULD_BE_EXCLUDED' },
				{ kind: ResponsePartKind.Markdown, id: 'm1', content: 'I added exponential backoff to the uploader.' },
			],
			usage: undefined,
			state: TurnState.Complete,
		}];
		const { handler, session, copilotApiService } = setup(disposables, gitService, octoKitService, { withCopilotToken: true, turns });

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		const userContent = copilotApiService.calls[0]?.request.messages.find(m => m.role === 'user')?.content ?? '';
		assert.deepStrictEqual({
			message: result.message,
			token: copilotApiService.calls[0]?.token,
			title: octoKitService.lastTitle,
			body: octoKitService.lastBody,
			includesUserRequest: userContent.includes('Add retry logic to the uploader'),
			includesAgentResponse: userContent.includes('I added exponential backoff to the uploader.'),
			excludesReasoning: !userContent.includes('SECRET_REASONING_SHOULD_BE_EXCLUDED'),
		}, {
			message: { markdown: 'Created pull request [#123](https://github.com/microsoft/vscode/pull/123).' },
			token: 'copilot-token',
			title: 'Generated PR title',
			body: 'Generated PR description.',
			includesUserRequest: true,
			includesAgentResponse: true,
			excludesReasoning: true,
		});
	});

	// Without a Copilot token the model is never called and the handler falls
	// back to the branch-name based title/description.
	test('falls back to branch-name title and description without a Copilot token', async () => {
		const gitService = new TestGitService();
		const octoKitService = new TestOctoKitService();
		const { handler, session, copilotApiService } = setup(disposables, gitService, octoKitService);

		await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		assert.deepStrictEqual({
			utilityCalls: copilotApiService.calls.length,
			title: octoKitService.lastTitle,
			body: octoKitService.lastBody,
		}, {
			utilityCalls: 0,
			title: 'feature: test',
			body: 'Created from `feature/test` targeting `main`.',
		});
	});

	// Model failures must not block PR creation — the handler falls back to the
	// branch-name based title/description.
	test('falls back to branch-name title and description when generation fails', async () => {
		const gitService = new TestGitService();
		const octoKitService = new TestOctoKitService();
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.error = new Error('utility model unavailable');
		const { handler, session } = setup(disposables, gitService, octoKitService, { withCopilotToken: true, copilotApiService });

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			title: octoKitService.lastTitle,
			body: octoKitService.lastBody,
		}, {
			message: { markdown: 'Created pull request [#123](https://github.com/microsoft/vscode/pull/123).' },
			title: 'feature: test',
			body: 'Created from `feature/test` targeting `main`.',
		});
	});

	// The auto-merge variants create the PR and then ask GitHub to enable
	// auto-merge with the requested merge method, reporting it in the result.
	test('enables auto-merge with the requested merge method after creating the pull request', async () => {
		const gitService = new TestGitService();
		const octoKitService = new TestOctoKitService();
		const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService, { autoMergeMethod: 'SQUASH' });

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_SQUASH }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			octoCalls: octoKitService.calls,
			createdEvents,
		}, {
			message: { markdown: 'Created pull request [#123](https://github.com/microsoft/vscode/pull/123) with auto-merge (squash) enabled.' },
			octoCalls: [
				'findPullRequestByHeadBranch:feature/test',
				'createPullRequest:false',
				'enablePullRequestAutoMerge:PR_node_123:SQUASH',
			],
			createdEvents: ['agent:/session:https://github.com/microsoft/vscode/pull/123'],
		});
	});

	// Enabling auto-merge is best-effort: a failure (e.g. the repository does
	// not allow the merge method) must not fail PR creation.
	test('reports but does not fail when auto-merge cannot be enabled', async () => {
		const gitService = new TestGitService();
		const octoKitService = new TestOctoKitService();
		octoKitService.autoMergeError = new Error('Auto-merge is not allowed for this repository');
		const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService, { autoMergeMethod: 'MERGE' });

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_MERGE }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			createdEvents,
		}, {
			message: { markdown: 'Created pull request [#123](https://github.com/microsoft/vscode/pull/123), but auto-merge could not be enabled: Auto-merge is not allowed for this repository' },
			createdEvents: ['agent:/session:https://github.com/microsoft/vscode/pull/123'],
		});
	});

	// Without a pull request node id we cannot issue the GraphQL mutation, so
	// auto-merge is reported as not enabled rather than silently skipped.
	test('reports when the pull request node id is missing for auto-merge', async () => {
		const gitService = new TestGitService();
		const octoKitService = new TestOctoKitService();
		octoKitService.created = { url: 'https://github.com/microsoft/vscode/pull/55', number: 55 };
		const { handler, session } = setup(disposables, gitService, octoKitService, { autoMergeMethod: 'REBASE' });

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_REBASE }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			enableCalled: octoKitService.calls.some(call => call.startsWith('enablePullRequestAutoMerge:')),
		}, {
			message: { markdown: 'Created pull request [#55](https://github.com/microsoft/vscode/pull/55), but auto-merge could not be enabled: the pull request identifier was not returned by GitHub.' },
			enableCalled: false,
		});
	});
});
