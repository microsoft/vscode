/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import type { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE } from '../../common/agent.js';
import { getWorkingDirectoryKey, getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { buildBranchChangesetUri, buildFolderChangesetOwnerUri, buildSessionChangesetUri } from '../../common/changesetUri.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { buildChatUri, buildDefaultChatUri, withSessionGitHubState, withSessionGitState, type ISessionFileDiff, type ISessionGitState, MessageKind, ResponsePartKind, SessionStatus, TurnState, type Turn } from '../../common/state/sessionState.js';
import type { IAgentHostGitService, IBranch, IDefaultBranch, IPushOptions } from '../../common/agentHostGitService.js';
import { AgentHostPullRequestOperationHandler } from '../../node/agentHostPullRequestOperationHandler.js';
import { createTestGitHubEndpointService } from './testGitHubEndpointService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { CreatedPullRequest, CreatePullRequestOptions, EnablePullRequestAutoMergeOptions } from '../../../github/common/githubPullRequestMutationService.js';
import { PullRequestMergeMethod } from '../../../github/common/githubPullRequestService.js';
import { GitHubPullRequestLookup, GitHubRepositoryMergeCapabilities, GitHubRepositoryRef } from '../../../github/common/githubQueryService.js';
import { IGitHubQuery } from '../../../github/common/githubQueryServiceImpl.js';
import { IGitHubClient } from '../../../github/common/githubService.js';
import { GitHubFetch, GitHubRequestTimeoutError } from '../../../github/common/githubTypes.js';
import { IPullRequestMutations } from '../../../github/common/pullRequestMutationService.js';
import { AgentHostGitHubService } from '../../node/agentHostGitHubService.js';
import { createTestGitHubClient, createTestGitHubService, createTestPullRequest } from './testGitHubService.js';
import type { ICopilotApiService, ICopilotApiServiceRequestOptions, ICopilotUtilityChatCompletionRequest } from '../../node/shared/copilotApiService.js';
import type Anthropic from '@anthropic-ai/sdk';
import type { CCAModel } from '@vscode/copilot-api';
import type { IAgentHostAuthenticationService, IAgentHostAuthTokenChangeEvent } from '../../node/agentHostAuthenticationService.js';
import type { IAgentBranchNameGenerator, IAgentBranchNameGeneratorRequest } from '../../node/shared/agentBranchNameGenerator.js';
import { mock } from '../../../../base/test/common/mock.js';
import { AgentMergeConfigKey, readAgentMergeSessionState, type AgentMergeConfiguration, type AgentMergeControllerState, type AgentMergeSessionOverrides } from '../../common/agentMerge.js';
import type { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { createPullRequestConversationMeta, createPullRequestOperationMeta, createPullRequestValidationMeta, PREPARE_PULL_REQUEST_OPERATION_ID, readPullRequestDetailsResult, type IPullRequestCreateOptions } from '../../common/meta/agentPullRequestOperationMeta.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';

class TestCopilotApiService implements ICopilotApiService {
	declare readonly _serviceBrand: undefined;

	readonly calls: { token: string; request: ICopilotUtilityChatCompletionRequest; options?: ICopilotApiServiceRequestOptions }[] = [];
	response = 'Generated PR title\n\nGenerated PR description.';
	error: Error | undefined;
	onUtilityChatCompletion: (() => void) | undefined;

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
		this.onUtilityChatCompletion?.();
		if (this.error) {
			throw this.error;
		}
		return this.response;
	}
}

class TestBranchNameGenerator implements IAgentBranchNameGenerator {
	declare readonly _serviceBrand: undefined;
	readonly requests: IAgentBranchNameGeneratorRequest[] = [];

	async generateBranchName(request: IAgentBranchNameGeneratorRequest): Promise<string> {
		this.requests.push(request);
		const branchName = `${request.branchPrefix ?? ''}agents/add-retry-logic`;
		await request.branchNameCollides?.(branchName);
		return branchName;
	}
}

class TestGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	readonly calls: string[] = [];
	readonly requestedBaseBranches: Array<string | undefined> = [];
	readonly workingDirectories: string[] = [];
	readonly pushOptions: IPushOptions[] = [];
	uncommitted = false;
	upstream = false;
	gitState: ISessionGitState | undefined;
	gitStateAfterBranchCreation: ISessionGitState | undefined;
	createdBranch: string | undefined;
	onMutation: ((operation: string) => void) | undefined;
	branchChanges: readonly ISessionFileDiff[] | undefined = [{ after: { uri: 'file:///repo/file.ts', content: { uri: 'file:///repo/file.ts' } } }];

	async getCurrentBranch(): Promise<string | undefined> { return 'feature/test'; }
	async getDefaultBranch(): Promise<IDefaultBranch | undefined> { return { name: 'main', startPoint: 'main' }; }
	async getBranch(): Promise<IBranch | undefined> { return undefined; }
	async getRefs(): Promise<IBranch[]> { return []; }
	async getBranches(): Promise<IBranch[]> { return []; }
	async getRepositoryRoot(): Promise<URI | undefined> { return URI.file('/repo'); }
	async getWorktreeRoots(): Promise<URI[]> { return []; }
	async addWorktree(): Promise<void> { }
	async copyWorktreeIncludeFiles(): Promise<void> { }
	async symlinkWorktreeFolders(): Promise<readonly string[]> { return []; }
	async addExistingWorktree(): Promise<void> { }
	async removeWorktree(): Promise<void> { }
	async branchExists(_repositoryRoot: URI, branchName: string): Promise<boolean> {
		this.calls.push(`branchExists:${branchName}`);
		return false;
	}
	async createBranch(_workingDirectory: URI, branchName: string): Promise<void> {
		this.onMutation?.('createBranch');
		this.calls.push(`createBranch:${branchName}`);
		this.createdBranch = branchName;
	}
	async checkout(): Promise<void> { }
	async hasUncommittedChanges(): Promise<boolean> {
		this.calls.push('hasUncommittedChanges');
		return this.uncommitted;
	}
	async createStash(): Promise<void> { }
	async commitAll(_workingDirectory: URI, message: string): Promise<void> {
		this.onMutation?.('commitAll');
		this.calls.push(`commitAll:${message}`);
		this.uncommitted = false;
	}
	async mergeBranch(): Promise<string> { return ''; }
	async restore(): Promise<void> { }
	async hasUpstream(): Promise<boolean> {
		this.calls.push('hasUpstream');
		return this.upstream;
	}
	async fetch(): Promise<void> { }
	async pull(): Promise<void> { }
	async push(_workingDirectory: URI, options: IPushOptions): Promise<void> {
		this.onMutation?.('push');
		this.calls.push(`push:${options.ref}:${options.setUpstream}`);
		this.pushOptions.push(options);
	}
	async getSessionGitState(workingDirectory: URI, baseBranchName?: string): Promise<ISessionGitState | undefined> {
		this.workingDirectories.push(workingDirectory.toString());
		this.requestedBaseBranches.push(baseBranchName);
		return this.createdBranch ? this.gitStateAfterBranchCreation : this.gitState;
	}
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

class TestGitHubClient extends mock<IGitHubClient>() {
	readonly calls: string[] = [];
	existing: GitHubPullRequestLookup | undefined;
	existingAfterCreateFailure: GitHubPullRequestLookup | undefined;
	createError: Error | undefined;
	findAfterCreateError: Error | undefined;
	autoMergeError: Error | undefined;
	repositoryCapabilities: GitHubRepositoryMergeCapabilities = { autoMergeAllowed: true, mergeMethods: ['MERGE', 'SQUASH', 'REBASE'] };
	capabilitiesError: Error | undefined;
	onMutation: ((operation: string) => void) | undefined;
	created = createTestPullRequest(123, { id: 'PR_node_123' });
	lastTitle: string | undefined;
	lastBody: string | undefined;
	lastHead: string | undefined;
	lastBase: string | undefined;
	readonly findRequests: { branch: string; headOwner: string | undefined }[] = [];

	override readonly credentials = createTestGitHubClient().credentials;
	override readonly query = new class extends mock<IGitHubQuery>() {
		constructor(private readonly client: TestGitHubClient) { super(); }

		override async findPullRequestByHeadBranch(_ref: GitHubRepositoryRef, branch: string, headOwner: string | undefined): Promise<GitHubPullRequestLookup | undefined> {
			this.client.calls.push(`findPullRequestByHeadBranch:${branch}`);
			this.client.findRequests.push({ branch, headOwner });
			if (this.client.calls.some(call => call.startsWith('createPullRequest:'))) {
				if (this.client.findAfterCreateError) {
					throw this.client.findAfterCreateError;
				}
				return this.client.existingAfterCreateFailure;
			}
			return this.client.existing;
		}

		override async getRepositoryMergeCapabilities({ owner, repo }: GitHubRepositoryRef): Promise<GitHubRepositoryMergeCapabilities> {
			this.client.calls.push(`getRepositoryMergeCapabilities:${owner}/${repo}`);
			if (this.client.capabilitiesError) {
				throw this.client.capabilitiesError;
			}
			return this.client.repositoryCapabilities;
		}
	}(this);
	override readonly mutations = new class extends mock<IPullRequestMutations>() {
		constructor(private readonly client: TestGitHubClient) { super(); }

		override async createPullRequest(_ref: GitHubRepositoryRef, { title, body, head, base, draft }: CreatePullRequestOptions): Promise<CreatedPullRequest> {
			this.client.onMutation?.('createPullRequest');
			this.client.calls.push(`createPullRequest:${draft}`);
			this.client.lastTitle = title;
			this.client.lastBody = body;
			this.client.lastHead = head;
			this.client.lastBase = base;
			if (this.client.createError) {
				throw this.client.createError;
			}
			return { ...this.client.created, title };
		}

		override async enableAutoMerge(_ref: GitHubRepositoryRef, { pullRequestId, method }: EnablePullRequestAutoMergeOptions): Promise<void> {
			this.client.onMutation?.('enableAutoMerge');
			this.client.calls.push(`enableAutoMerge:${pullRequestId}:${method}`);
			if (this.client.autoMergeError) {
				throw this.client.autoMergeError;
			}
		}
	}(this);
}

function createAuthenticationService(withCopilotToken = false): IAgentHostAuthenticationService {
	return {
		_serviceBrand: undefined,
		onDidChangeAuthToken: Event.None,
		getAuthAccount: () => undefined,
		getAuthToken: resource => {
			if (resource.resource === GITHUB_REPO_PROTECTED_RESOURCE.resource) {
				return 'gh-token';
			}
			if (withCopilotToken && resource.resource === GITHUB_COPILOT_PROTECTED_RESOURCE.resource) {
				return 'copilot-token';
			}
			return undefined;
		},
	};
}

function setup(disposables: Pick<DisposableStore, 'add'>, gitService: TestGitService, gitHubClient: IGitHubClient, options?: { copilotApiService?: TestCopilotApiService; withCopilotToken?: boolean; turns?: Turn[]; draft?: boolean; autoMergeMethod?: PullRequestMergeMethod; enableAgentMerge?: boolean; agentMergeAvailable?: boolean; sessionAgentMergeEnabled?: boolean; agentMergeDefaults?: Partial<AgentMergeConfiguration>; agentMergeOverrides?: AgentMergeSessionOverrides; agentMergeControllerState?: AgentMergeControllerState; baseBranch?: string; branchPrefix?: string; workingDirectory?: string; logService?: ILogService }): { handler: AgentHostPullRequestOperationHandler; session: URI; stateManager: AgentHostStateManager; createdEvents: string[]; createdOwners: string[]; createdBranches: string[]; sessionConfigUpdates: Record<string, unknown>[]; sessionConfigValues: Record<string, unknown>; copilotApiService: TestCopilotApiService; branchNameGenerator: TestBranchNameGenerator } {
	const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
	const session = URI.parse('agent:/session');
	const createdEvents: string[] = [];
	const createdOwners: string[] = [];
	const createdBranches: string[] = [];
	const sessionConfigUpdates: Record<string, unknown>[] = [];
	stateManager.createSession({
		resource: session.toString(),
		provider: 'copilot',
		title: 'Session',
		status: SessionStatus.Idle,
		createdAt: new Date(1).toISOString(),
		modifiedAt: new Date(1).toISOString(),
		workingDirectories: [URI.file('/repo').toString()],
	});
	if (options?.baseBranch || options?.branchPrefix) {
		stateManager.setSessionConfig(session.toString(), {
			schema: { type: 'object', properties: {} },
			values: {
				[SessionConfigKey.Isolation]: 'worktree',
				...(options.baseBranch ? { [SessionConfigKey.Branch]: options.baseBranch } : {}),
				...(options.branchPrefix ? { [SessionConfigKey.WorktreeBranchPrefix]: options.branchPrefix } : {}),
			},
		});
	}
	// Git state and GitHub state now share the single `_meta` bag.
	const sessionMeta = withSessionGitHubState(withSessionGitState(undefined, {
		hasGitHubRemote: true,
		githubOwner: 'microsoft',
		githubRepo: 'vscode',
		branchName: 'feature/test',
		baseBranchName: options?.baseBranch ?? 'main',
	}), URI.file('/repo').toString(), {
		owner: 'microsoft',
		repo: 'vscode',
	});
	stateManager.setSessionMeta(session.toString(), sessionMeta);
	const copilotApiService = options?.copilotApiService ?? new TestCopilotApiService();
	const branchNameGenerator = new TestBranchNameGenerator();
	const sessionConfigValues: Record<string, unknown> = {
		...(options?.sessionAgentMergeEnabled !== undefined || options?.agentMergeOverrides ? {
			[SessionConfigKey.AgentMerge]: {
				enabled: options?.sessionAgentMergeEnabled ?? false,
				...(options?.agentMergeOverrides ? { overrides: options.agentMergeOverrides } : {}),
			},
		} : {}),
		...(options?.agentMergeControllerState ? { [SessionConfigKey.AgentMergeController]: options.agentMergeControllerState } : {}),
	};
	const rootValues: Readonly<Record<string, unknown>> = {
		[AgentMergeConfigKey.Enabled]: options?.agentMergeAvailable ?? options?.enableAgentMerge ?? false,
		[AgentMergeConfigKey.AddressReviews]: options?.agentMergeDefaults?.addressReviews,
		[AgentMergeConfigKey.FixCI]: options?.agentMergeDefaults?.fixCI,
		[AgentMergeConfigKey.ResolveConflicts]: options?.agentMergeDefaults?.resolveConflicts,
		[AgentMergeConfigKey.MergePullRequest]: options?.agentMergeDefaults?.mergePullRequest,
		[AgentMergeConfigKey.MergeMethod]: options?.agentMergeDefaults?.mergeMethod,
		[AgentMergeConfigKey.ReplyAttribution]: options?.agentMergeDefaults?.replyAttribution,
	};
	const configurationService = new class extends mock<IAgentConfigurationService>() {
		override getRootValue(_schema: never, key: string) {
			return rootValues[key] as never;
		}
		override getSessionConfigValues(): Record<string, unknown> {
			return sessionConfigValues;
		}
		override updateSessionConfig(_session: string, patch: Record<string, unknown>): void {
			Object.assign(sessionConfigValues, patch);
			sessionConfigUpdates.push(patch);
		}
	}();
	return {
		handler: new AgentHostPullRequestOperationHandler(
			options?.draft ?? false,
			options?.autoMergeMethod,
			options?.enableAgentMerge ?? false,
			sessionKey => {
				const state = stateManager.getSessionState(sessionKey);
				// `turns` describe the default chat; peer chats keep their own.
				const turns = sessionKey === buildDefaultChatUri(session.toString()) || sessionKey === session.toString() ? options?.turns : undefined;
				if (state && (turns || options?.workingDirectory)) {
					return { ...state, ...(turns ? { turns } : {}), ...(options?.workingDirectory ? { workingDirectories: [options.workingDirectory] } : {}) };
				}
				return state;
			},
			async () => options?.baseBranch ?? 'main',
			async event => {
				createdEvents.push(`${event.sessionKey}:${event.pullRequestUrl}`);
				createdOwners.push(event.ownerUri);
				createdBranches.push(event.branchName);
			},
			createAuthenticationService(options?.withCopilotToken), gitService, createTestGitHubService(gitHubClient), createTestGitHubEndpointService(), copilotApiService, branchNameGenerator, configurationService, options?.logService ?? new NullLogService(), stateManager),
		session,
		stateManager,
		createdEvents,
		createdOwners,
		createdBranches,
		sessionConfigUpdates,
		sessionConfigValues,
		copilotApiService,
		branchNameGenerator,
	};
}

function agentMergeFolderPatch(session: URI, state: { readonly enabled: boolean; readonly overrides?: AgentMergeSessionOverrides }, workingDirectory = URI.file('/repo').toString(), chat = buildDefaultChatUri(session.toString())): Record<string, unknown> {
	return {
		[SessionConfigKey.AgentMergeFolders]: {
			[getWorkingDirectoryKey(workingDirectory)]: {
				...state,
				...(state.enabled ? { chat } : {}),
			},
		},
		[SessionConfigKey.AgentMergeControllerFolders]: {},
		...(workingDirectory === URI.file('/repo').toString() ? {
			[SessionConfigKey.AgentMerge]: undefined,
			[SessionConfigKey.AgentMergeController]: undefined,
		} : {}),
	};
}

suite('AgentHostPullRequestOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createNetworkClient(fetch: GitHubFetch): IGitHubClient {
		const service = disposables.add(new AgentHostGitHubService({ fetch }, createAuthenticationService(), createTestGitHubEndpointService(), new NullLogService(), NullTelemetryService));
		return disposables.add(service.acquireRepositoryClient(new AbortController().signal)).object;
	}

	const submittedOptions: IPullRequestCreateOptions = {
		title: '  My edited title  ',
		description: '\nMy edited description.\n',
		draft: false,
		agentMerge: false,
	};

	for (const operation of ['create', 'validate']) {
		for (const changed of ['branch', 'repository', 'base', 'working directory', 'head owner', 'upstream', 'unavailable git state', 'detached head', 'removed remote']) {
			test(`${operation} rejects a changed ${changed} before any mutation`, async () => {
				const gitService = new TestGitService();
				gitService.gitState = { branchName: 'feature/test', githubOwner: 'microsoft', githubRepo: 'vscode' };
				gitService.uncommitted = true;
				const gitHubClient = new TestGitHubClient();
				const configuration = { baseBranch: 'main', workingDirectory: URI.file('/repo').toString(), withCopilotToken: true, sessionAgentMergeEnabled: true };
				const { handler, session, sessionConfigUpdates, createdEvents, copilotApiService } = setup(disposables, gitService, gitHubClient, configuration);
				const channel = buildSessionChangesetUri(session.toString());
				const prepared = readPullRequestDetailsResult(await handler.prepare({ channel, operationId: PREPARE_PULL_REQUEST_OPERATION_ID }, CancellationToken.None));
				const expectedContext = prepared.context;
				assert.ok(expectedContext);
				switch (changed) {
					case 'branch': gitService.gitState = { ...gitService.gitState, branchName: 'other' }; break;
					case 'repository': gitService.gitState = { ...gitService.gitState, githubRepo: 'other' }; break;
					case 'base': configuration.baseBranch = 'release'; break;
					case 'working directory': configuration.workingDirectory = URI.file('/another-repo').toString(); break;
					case 'head owner': gitService.gitState = { ...gitService.gitState, githubHeadOwner: 'contributor' }; break;
					case 'upstream': gitService.gitState = { ...gitService.gitState, upstreamBranchName: 'fork/other' }; break;
					case 'unavailable git state': gitService.gitState = undefined; break;
					case 'detached head': gitService.gitState = { ...gitService.gitState, isDetachedHead: true }; break;
					case 'removed remote': gitService.gitState = { ...gitService.gitState, hasGitHubRemote: false }; break;
				}
				gitService.calls.length = 0;
				gitHubClient.calls.length = 0;
				await assert.rejects(() => operation === 'create'
					? handler.invoke({ channel, operationId: 'create-pr', _meta: createPullRequestOperationMeta({ ...submittedOptions, expectedContext }) }, CancellationToken.None)
					: handler.prepare({ channel, operationId: PREPARE_PULL_REQUEST_OPERATION_ID, _meta: createPullRequestValidationMeta(expectedContext) }, CancellationToken.None),
					/Reopen Create PR/);
				assert.deepStrictEqual({ git: gitService.calls, github: gitHubClient.calls, sessionConfigUpdates, createdEvents, generations: copilotApiService.calls.length },
					{ git: [], github: [], sessionConfigUpdates: [], createdEvents: [], generations: 1 });
			});
		}
	}

	test('validates unchanged identity without regenerating details or mutating state', async () => {
		const gitService = new TestGitService();
		gitService.gitState = { branchName: 'feature/test' };
		gitService.uncommitted = true;
		const gitHubClient = new TestGitHubClient();
		const { handler, session, sessionConfigUpdates, copilotApiService } = setup(disposables, gitService, gitHubClient, { withCopilotToken: true });
		const channel = buildSessionChangesetUri(session.toString());
		const prepared = readPullRequestDetailsResult(await handler.prepare({ channel, operationId: PREPARE_PULL_REQUEST_OPERATION_ID }, CancellationToken.None));
		assert.ok(prepared.context);
		gitService.calls.length = 0;
		gitHubClient.calls.length = 0;
		const result = await handler.prepare({ channel, operationId: PREPARE_PULL_REQUEST_OPERATION_ID, _meta: createPullRequestValidationMeta(prepared.context) }, CancellationToken.None);
		assert.deepStrictEqual({ result, git: gitService.calls, github: gitHubClient.calls, sessionConfigUpdates, generations: copilotApiService.calls.length },
			{ result: {}, git: [], github: [], sessionConfigUpdates: [], generations: 1 });
	});

	test('creates a new branch from the prepared base branch after validating its identity', async () => {
		const gitService = new TestGitService();
		gitService.gitState = { branchName: 'main' };
		gitService.uncommitted = true;
		const { handler, session, createdEvents, branchNameGenerator } = setup(disposables, gitService, new TestGitHubClient(), { withCopilotToken: true });
		const channel = buildSessionChangesetUri(session.toString());
		const prepared = readPullRequestDetailsResult(await handler.prepare({ channel, operationId: PREPARE_PULL_REQUEST_OPERATION_ID }, CancellationToken.None));
		await handler.invoke({ channel, operationId: 'create-pr', _meta: createPullRequestOperationMeta({ ...submittedOptions, expectedContext: prepared.context }) }, CancellationToken.None);
		assert.deepStrictEqual({ branch: gitService.createdBranch, generatedBranches: branchNameGenerator.requests.length, created: createdEvents.length },
			{ branch: 'agents/add-retry-logic', generatedBranches: 1, created: 1 });
	});

	test('prepares a pull request from the default-chat folder branch', async () => {
		const gitService = new TestGitService();
		gitService.gitState = { branchName: 'feature/test', githubOwner: 'microsoft', githubRepo: 'vscode' };
		const { handler, session } = setup(disposables, gitService, new TestGitHubClient(), { withCopilotToken: true });
		const workingDirectory = URI.file('/repo').toString();
		const owner = buildFolderChangesetOwnerUri(session.toString(), getWorkingDirectoryScopeId([workingDirectory]));

		await handler.prepare({
			channel: buildBranchChangesetUri(owner),
			operationId: PREPARE_PULL_REQUEST_OPERATION_ID,
		}, CancellationToken.None);

		assert.deepStrictEqual(gitService.workingDirectories, [workingDirectory]);
	});

	test('prepares and creates a pull request from another folder and enables that folder Agent Merge', async () => {
		const gitService = new TestGitService();
		gitService.gitState = { branchName: 'feature/tools', githubOwner: 'contoso', githubRepo: 'tools' };
		const gitHubClient = new TestGitHubClient();
		const { handler, session, stateManager, createdOwners, sessionConfigUpdates } = setup(disposables, gitService, gitHubClient, { withCopilotToken: true, agentMergeAvailable: true, sessionAgentMergeEnabled: true });
		const otherFolder = URI.file('/other').toString();
		const peerChat = buildChatUri(session.toString(), 'peer');
		stateManager.addChat(session.toString(), peerChat, { workingDirectories: [otherFolder] });
		const owner = buildFolderChangesetOwnerUri(session.toString(), getWorkingDirectoryScopeId([otherFolder]));
		const channel = buildBranchChangesetUri(owner);

		const prepared = readPullRequestDetailsResult(await handler.prepare({ channel, operationId: PREPARE_PULL_REQUEST_OPERATION_ID }, CancellationToken.None));
		await handler.invoke({ channel, operationId: 'create-pr', _meta: createPullRequestOperationMeta({ ...submittedOptions, agentMerge: true }) }, CancellationToken.None);

		assert.deepStrictEqual({
			repository: prepared.repository,
			workingDirectory: prepared.context?.workingDirectory,
			agentMergeAvailable: prepared.agentMergeAvailable,
			createdOwners,
			sessionConfigUpdates,
		}, {
			repository: 'contoso/tools',
			workingDirectory: otherFolder,
			agentMergeAvailable: true,
			createdOwners: [owner],
			sessionConfigUpdates: [agentMergeFolderPatch(session, { enabled: true }, otherFolder, peerChat)],
		});
	});

	suite('conversation of the chat Create PR was opened from', () => {
		const repo = URI.file('/repo').toString();
		const userTurn = (text: string): Turn => ({
			id: `turn-${text}`,
			message: { text, origin: { kind: MessageKind.User } },
			responseParts: [],
			usage: undefined,
			state: TurnState.Complete,
		});
		const conversations = ['Implement chat move functionality in Agent Host Protocol', 'Implement VS Code chat moves', 'Another folder conversation', 'Another session conversation'];

		function setupSharedFolder() {
			const gitService = new TestGitService();
			gitService.gitState = { branchName: 'feature/test', githubOwner: 'microsoft', githubRepo: 'vscode' };
			const gitHubClient = new TestGitHubClient();
			const context = setup(disposables, gitService, gitHubClient, { withCopilotToken: true, turns: [userTurn(conversations[0])] });
			const { session, stateManager } = context;
			const peerChat = buildChatUri(session.toString(), 'peer');
			stateManager.addChat(session.toString(), peerChat, { turns: [userTurn(conversations[1])], workingDirectories: [repo] });
			const otherFolderChat = buildChatUri(session.toString(), 'other-folder');
			stateManager.addChat(session.toString(), otherFolderChat, { turns: [userTurn(conversations[2])], workingDirectories: [URI.file('/other').toString()] });
			const otherSession = 'agent:/other-session';
			stateManager.createSession({ resource: otherSession, provider: 'copilot', title: 'Other', status: SessionStatus.Idle, createdAt: new Date(1).toISOString(), modifiedAt: new Date(1).toISOString(), workingDirectories: [repo] });
			const otherSessionChat = buildChatUri(otherSession, 'peer');
			stateManager.addChat(otherSession, otherSessionChat, { turns: [userTurn(conversations[3])], workingDirectories: [repo] });
			const channel = buildBranchChangesetUri(buildFolderChangesetOwnerUri(session.toString(), getWorkingDirectoryScopeId([repo])));
			const generatedFrom = () => {
				const prompt = context.copilotApiService.calls.at(-1)?.request.messages.find(m => m.role === 'user')?.content ?? '';
				return conversations.filter(conversation => prompt.includes(conversation));
			};
			return { ...context, gitService, gitHubClient, channel, generatedFrom, chats: { peerChat, otherFolderChat, otherSessionChat } };
		}

		test('prepare generates from the requested chat only when it works in the changeset folder of the same session', async () => {
			const { handler, channel, gitService, generatedFrom, chats } = setupSharedFolder();
			const results: Record<string, string[]> = {};
			for (const [name, chat] of [['none', undefined], ['peer', chats.peerChat], ['another folder', chats.otherFolderChat], ['another session', chats.otherSessionChat], ['not a chat', 'agent:/session']] as const) {
				await handler.prepare({ channel, operationId: PREPARE_PULL_REQUEST_OPERATION_ID, ...(chat ? { _meta: createPullRequestConversationMeta(chat) } : {}) }, CancellationToken.None);
				results[name] = generatedFrom();
			}

			assert.deepStrictEqual({ results, workingDirectories: [...new Set(gitService.workingDirectories)] }, {
				results: {
					'none': [conversations[0]],
					'peer': [conversations[1]],
					'another folder': [conversations[0]],
					'another session': [conversations[0]],
					'not a chat': [conversations[0]],
				},
				workingDirectories: [repo],
			});
		});

		test('create generates missing details and branch names from the requested chat', async () => {
			const { handler, channel, gitService, gitHubClient, branchNameGenerator, generatedFrom, chats } = setupSharedFolder();
			gitService.gitState = { ...gitService.gitState, branchName: 'main' };
			gitService.uncommitted = true;

			await handler.invoke({ channel, operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR, _meta: createPullRequestConversationMeta(chats.peerChat) }, CancellationToken.None);

			assert.deepStrictEqual({
				generatedFrom: generatedFrom(),
				branchNameMessage: branchNameGenerator.requests[0]?.message,
				title: gitHubClient.lastTitle,
			}, {
				generatedFrom: [conversations[1]],
				branchNameMessage: conversations[1],
				title: 'Generated PR title',
			});
		});

		test('rejects a malformed conversation chat', async () => {
			const { handler, channel } = setupSharedFolder();
			await assert.rejects(
				handler.prepare({ channel, operationId: PREPARE_PULL_REQUEST_OPERATION_ID, _meta: { 'vscode.pullRequestConversation': { chat: 42 } } }, CancellationToken.None),
				(error: unknown) => error instanceof ProtocolError && error.code === JsonRpcErrorCodes.InvalidParams,
			);
		});
	});

	for (const agentMergeAvailable of [false, true]) {
		test(`prepares details without changing a dirty base branch when Agent Merge availability is ${agentMergeAvailable}`, async () => {
			const gitService = new TestGitService();
			gitService.uncommitted = true;
			gitService.gitState = { branchName: 'release', baseBranchName: 'release' };
			const gitHubClient = new TestGitHubClient();
			gitHubClient.repositoryCapabilities = { autoMergeAllowed: false, mergeMethods: ['SQUASH'] };
			const { handler, session, createdEvents, sessionConfigUpdates, branchNameGenerator, copilotApiService } = setup(disposables, gitService, gitHubClient, {
				withCopilotToken: true,
				agentMergeAvailable,
				sessionAgentMergeEnabled: true,
				baseBranch: 'release',
				turns: [{
					id: 'turn-1',
					message: { text: 'Add retries', origin: { kind: MessageKind.User } },
					responseParts: [
						{ kind: ResponsePartKind.Markdown, id: 'response', content: 'Added exponential backoff.' },
						{ kind: ResponsePartKind.Reasoning, id: 'reasoning', content: 'PRIVATE_REASONING' },
					],
					state: TurnState.Complete,
					usage: undefined,
				}],
			});

			const result = await handler.prepare({ channel: buildSessionChangesetUri(session.toString()), operationId: PREPARE_PULL_REQUEST_OPERATION_ID }, CancellationToken.None);
			const prompt = copilotApiService.calls[0].request.messages.find(message => message.role === 'user')?.content ?? '';

			assert.deepStrictEqual({
				details: readPullRequestDetailsResult(result),
				message: result.message,
				gitCalls: gitService.calls,
				requestedBaseBranches: gitService.requestedBaseBranches,
				uncommitted: gitService.uncommitted,
				octoCalls: gitHubClient.calls,
				createdEvents,
				sessionConfigUpdates,
				branchRequests: branchNameGenerator.requests,
				includesContext: prompt.includes('Add retries') && prompt.includes('Added exponential backoff.') && prompt.includes('file.ts'),
				includesReasoning: prompt.includes('PRIVATE_REASONING'),
			}, {
				details: {
					title: 'Generated PR title',
					description: 'Generated PR description.',
					branchName: 'release',
					baseBranchName: 'release',
					repository: 'microsoft/vscode',
					context: { workingDirectory: URI.file('/repo').toString(), repository: 'microsoft/vscode', branchName: 'release', baseBranchName: 'release' },
					autoMergeAllowed: false,
					mergeMethods: ['SQUASH'],
					agentMergeAvailable,
					...(agentMergeAvailable ? { agentMergeOptions: { addressReviews: true, fixCI: true, resolveConflicts: true, mergePullRequest: 'never' } } : {}),
				},
				message: undefined,
				gitCalls: ['computeSessionFileDiffs'],
				requestedBaseBranches: ['release'],
				uncommitted: true,
				octoCalls: ['getRepositoryMergeCapabilities:microsoft/vscode'],
				createdEvents: [],
				sessionConfigUpdates: [],
				branchRequests: [],
				includesContext: true,
				includesReasoning: false,
			});
		});
	}

	test('preparation exposes effective session Agent Merge choices without writing configuration', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		const { handler, session, sessionConfigUpdates } = setup(disposables, gitService, gitHubClient, {
			withCopilotToken: true,
			agentMergeAvailable: true,
			agentMergeDefaults: { addressReviews: false, fixCI: true, resolveConflicts: false, mergePullRequest: 'always', mergeMethod: 'rebase' },
			agentMergeOverrides: { fixCI: false, mergePullRequest: 'ifUnchanged' },
		});
		const result = await handler.prepare({ channel: buildSessionChangesetUri(session.toString()), operationId: PREPARE_PULL_REQUEST_OPERATION_ID }, CancellationToken.None);
		assert.deepStrictEqual({ options: readPullRequestDetailsResult(result).agentMergeOptions, sessionConfigUpdates }, {
			options: { addressReviews: false, fixCI: false, resolveConflicts: false, mergePullRequest: 'ifUnchanged' },
			sessionConfigUpdates: [],
		});
	});

	for (const reason of ['missing token', 'model failure', 'invalid response']) {
		test(`preparation reports ${reason} with empty editable fields and still allows manual creation`, async () => {
			const gitService = new TestGitService();
			const gitHubClient = new TestGitHubClient();
			const copilotApiService = new TestCopilotApiService();
			if (reason === 'model failure') {
				copilotApiService.error = new Error('Utility model unavailable');
			} else if (reason === 'invalid response') {
				copilotApiService.response = '\n \t';
			}
			const { handler, session } = setup(disposables, gitService, gitHubClient, { withCopilotToken: reason !== 'missing token', copilotApiService });
			const channel = buildSessionChangesetUri(session.toString());

			const details = readPullRequestDetailsResult(await handler.prepare({ channel, operationId: PREPARE_PULL_REQUEST_OPERATION_ID }, CancellationToken.None));
			const callsBeforeCreate = { git: [...gitService.calls], octo: [...gitHubClient.calls], utility: copilotApiService.calls.length };
			await handler.invoke({ channel, operationId: 'create-pr', _meta: createPullRequestOperationMeta(submittedOptions) }, CancellationToken.None);

			assert.deepStrictEqual({
				title: details.title,
				description: details.description,
				hasGenerationError: !!details.generationError,
				callsBeforeCreate,
				submittedTitle: gitHubClient.lastTitle,
				submittedBody: gitHubClient.lastBody,
				utilityCalls: copilotApiService.calls.length,
			}, {
				title: '',
				description: '',
				hasGenerationError: true,
				callsBeforeCreate: {
					git: ['computeSessionFileDiffs'],
					octo: ['getRepositoryMergeCapabilities:microsoft/vscode'],
					utility: reason === 'missing token' ? 0 : 1,
				},
				submittedTitle: submittedOptions.title,
				submittedBody: submittedOptions.description,
				utilityCalls: reason === 'missing token' ? 0 : 1,
			});
		});
	}

	for (const response of [
		{ name: 'pull-only access without merge flags', status: 200, body: { permissions: { pull: true, push: false } } },
		{ name: 'unavailable repository settings', status: 403, body: { message: 'Forbidden' } },
	]) {
		test(`preparation retains generated details and Agent Merge options with ${response.name}`, async () => {
			const gitService = new TestGitService();
			const warnings: string[] = [];
			const logService = new class extends NullLogService {
				override warn(message: string): void { warnings.push(message); }
			}();
			const gitHubClient = createNetworkClient(async input => new URL(String(input)).pathname === '/user'
				? new Response('{"id":1}')
				: new Response(JSON.stringify(response.body), { status: response.status }));
			const { handler, session, sessionConfigUpdates, createdEvents } = setup(disposables, gitService, gitHubClient, {
				withCopilotToken: true, agentMergeAvailable: true, logService,
			});

			const result = await handler.prepare({ channel: buildSessionChangesetUri(session.toString()), operationId: PREPARE_PULL_REQUEST_OPERATION_ID }, CancellationToken.None);
			assert.deepStrictEqual({ details: readPullRequestDetailsResult(result), gitCalls: gitService.calls, sessionConfigUpdates, createdEvents, warnings }, {
				details: {
					title: 'Generated PR title',
					description: 'Generated PR description.',
					branchName: 'feature/test',
					baseBranchName: 'main',
					repository: 'microsoft/vscode',
					context: { workingDirectory: URI.file('/repo').toString(), repository: 'microsoft/vscode', branchName: 'feature/test', baseBranchName: 'main' },
					autoMergeAllowed: false,
					mergeMethods: [],
					agentMergeAvailable: true,
					agentMergeOptions: { addressReviews: true, fixCI: true, resolveConflicts: true, mergePullRequest: 'never' },
				},
				gitCalls: ['computeSessionFileDiffs'],
				sessionConfigUpdates: [],
				createdEvents: [],
				warnings: ['[AgentHostPullRequestOperationHandler] Could not read repository merge settings; GitHub auto-merge is unavailable during PR preparation.'],
			});
		});
	}

	test('failed capability lookup does not prevent manual creation or bypass auto-merge validation', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		gitHubClient.capabilitiesError = new Error('Repository access denied');
		const { handler, session } = setup(disposables, gitService, gitHubClient, { withCopilotToken: true });
		const channel = buildSessionChangesetUri(session.toString());
		await handler.prepare({ channel, operationId: PREPARE_PULL_REQUEST_OPERATION_ID }, CancellationToken.None);
		const beforeCreate = [...gitService.calls];
		await assert.rejects(() => handler.invoke({
			channel, operationId: 'create-pr', _meta: createPullRequestOperationMeta({ ...submittedOptions, autoMergeMethod: 'SQUASH' }),
		}, CancellationToken.None), /Repository access denied/);
		const afterRejectedAutoMerge = [...gitService.calls];
		await handler.invoke({ channel, operationId: 'create-pr', _meta: createPullRequestOperationMeta(submittedOptions) }, CancellationToken.None);
		assert.deepStrictEqual({ beforeCreate, afterRejectedAutoMerge, title: gitHubClient.lastTitle, body: gitHubClient.lastBody }, {
			beforeCreate: ['computeSessionFileDiffs'],
			afterRejectedAutoMerge: ['computeSessionFileDiffs'],
			title: submittedOptions.title,
			body: submittedOptions.description,
		});
	});

	test('preparation propagates cancellation during capability lookup', async () => {
		const gitService = new TestGitService();
		const source = disposables.add(new CancellationTokenSource());
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}();
		const gitHubClient = createNetworkClient(async input => {
			if (new URL(String(input)).pathname === '/user') {
				return new Response('{"id":1}');
			}
			source.cancel();
			throw new Error('Request aborted');
		});
		const { handler, session, copilotApiService, sessionConfigUpdates, createdEvents } = setup(disposables, gitService, gitHubClient, { withCopilotToken: true, logService });

		await assert.rejects(() => handler.prepare({ channel: buildSessionChangesetUri(session.toString()), operationId: PREPARE_PULL_REQUEST_OPERATION_ID }, source.token), /cancelled/);
		assert.deepStrictEqual({ gitCalls: gitService.calls, utilityCalls: copilotApiService.calls, sessionConfigUpdates, createdEvents, warnings }, {
			gitCalls: [], utilityCalls: [], sessionConfigUpdates: [], createdEvents: [], warnings: [],
		});
	});

	test('preparation propagates cancellation during generation rather than returning a generation error', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		const source = disposables.add(new CancellationTokenSource());
		const { handler, session, copilotApiService, createdEvents } = setup(disposables, gitService, gitHubClient, { withCopilotToken: true });
		copilotApiService.onUtilityChatCompletion = () => source.cancel();

		await assert.rejects(() => handler.prepare({ channel: buildSessionChangesetUri(session.toString()), operationId: PREPARE_PULL_REQUEST_OPERATION_ID }, source.token), /cancelled/);
		assert.deepStrictEqual({
			gitCalls: gitService.calls,
			octoCalls: gitHubClient.calls,
			aborted: copilotApiService.calls[0].options?.signal?.aborted,
			createdEvents,
		}, {
			gitCalls: ['computeSessionFileDiffs'],
			octoCalls: ['getRepositoryMergeCapabilities:microsoft/vscode'],
			aborted: true,
			createdEvents: [],
		});
	});

	test('submitted draft options bypass generation and preserve exact text including an empty description', async () => {
		const gitService = new TestGitService();
		gitService.uncommitted = true;
		const gitHubClient = new TestGitHubClient();
		const { handler, session, copilotApiService } = setup(disposables, gitService, gitHubClient, { withCopilotToken: true });

		const result = await handler.invoke({
			channel: buildSessionChangesetUri(session.toString()),
			operationId: 'create-pr',
			_meta: createPullRequestOperationMeta({ ...submittedOptions, draft: true, description: '' }),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			title: gitHubClient.lastTitle,
			body: gitHubClient.lastBody,
			message: result.message,
			octoCalls: gitHubClient.calls,
			utilityCalls: copilotApiService.calls,
			gitCalls: gitService.calls,
		}, {
			title: submittedOptions.title,
			body: '',
			message: { markdown: 'Created draft pull request [#123](https://github.com/microsoft/vscode/pull/123).' },
			octoCalls: ['findPullRequestByHeadBranch:feature/test', 'createPullRequest:true'],
			utilityCalls: [],
			gitCalls: ['hasUncommittedChanges', 'commitAll:Agent Host changes for feature/test', 'computeSessionFileDiffs', 'hasUpstream', 'push:feature/test:true'],
		});
	});

	for (const agentMergeAvailable of [false, true]) {
		for (const autoMergeMethod of [undefined, 'SQUASH'] as const) {
			test(`explicit ${autoMergeMethod ? 'auto-merge' : 'manual'} options disable previous session Agent Merge before mutations with root gate ${agentMergeAvailable}`, async () => {
				const gitService = new TestGitService();
				gitService.uncommitted = true;
				gitService.gitState = { branchName: 'main', baseBranchName: 'main' };
				const gitHubClient = new TestGitHubClient();
				const overrides: AgentMergeSessionOverrides = { fixCI: false, mergePullRequest: 'never' };
				const controllerState: AgentMergeControllerState = {
					totalPromptCount: 3,
					injectedConfiguration: {
						previous: { [SessionConfigKey.Mode]: 'interactive' },
						applied: { [SessionConfigKey.Mode]: 'autopilot' },
					},
				};
				const { handler, session, sessionConfigUpdates, sessionConfigValues } = setup(disposables, gitService, gitHubClient, {
					sessionAgentMergeEnabled: true,
					agentMergeAvailable,
					agentMergeOverrides: overrides,
					agentMergeControllerState: controllerState,
				});
				const mutations: { operation: string; agentMergeEnabled: boolean | undefined }[] = [];
				const recordMutation = (operation: string) => mutations.push({ operation, agentMergeEnabled: readAgentMergeSessionState(sessionConfigValues)?.enabled });
				gitService.onMutation = recordMutation;
				gitHubClient.onMutation = recordMutation;

				const result = await handler.invoke({
					channel: buildSessionChangesetUri(session.toString()),
					operationId: 'create-pr',
					_meta: createPullRequestOperationMeta({ ...submittedOptions, autoMergeMethod }),
				}, CancellationToken.None);

				assert.deepStrictEqual({ message: result.message, mutations, sessionConfigUpdates, sessionConfigValues }, {
					message: {
						markdown: autoMergeMethod
							? 'Created pull request [#123](https://github.com/microsoft/vscode/pull/123) with auto-merge (squash) enabled.'
							: 'Created pull request [#123](https://github.com/microsoft/vscode/pull/123).',
					},
					mutations: ['createBranch', 'commitAll', 'push', 'createPullRequest', ...(autoMergeMethod ? ['enableAutoMerge'] : [])]
						.map(operation => ({ operation, agentMergeEnabled: false })),
					// Earlier versions kept the elevated configuration with the lifecycle state, so it moves to its own key.
					sessionConfigUpdates: [{ ...agentMergeFolderPatch(session, { enabled: false, overrides }), [SessionConfigKey.AgentMergeInjectedConfiguration]: controllerState.injectedConfiguration }],
					sessionConfigValues: {
						[SessionConfigKey.AgentMerge]: undefined,
						[SessionConfigKey.AgentMergeController]: undefined,
						[SessionConfigKey.AgentMergeFolders]: {
							[getWorkingDirectoryKey(URI.file('/repo').toString())]: { enabled: false, overrides },
						},
						[SessionConfigKey.AgentMergeControllerFolders]: {},
						[SessionConfigKey.AgentMergeInjectedConfiguration]: controllerState.injectedConfiguration,
					},
				});
			});
		}
	}

	test('legacy creation leaves previously enabled session Agent Merge unchanged', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		const { handler, session, sessionConfigUpdates, sessionConfigValues } = setup(disposables, gitService, gitHubClient, {
			sessionAgentMergeEnabled: true,
			agentMergeAvailable: true,
		});

		await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: 'create-pr' }, CancellationToken.None);

		assert.deepStrictEqual({ sessionConfigUpdates, sessionConfigValues }, {
			sessionConfigUpdates: [],
			sessionConfigValues: { [SessionConfigKey.AgentMerge]: { enabled: true } },
		});
	});

	test('a failed explicit manual creation does not reactivate previous Agent Merge', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		gitHubClient.createError = new Error('PR creation failed');
		const { handler, session, sessionConfigUpdates, sessionConfigValues } = setup(disposables, gitService, gitHubClient, {
			sessionAgentMergeEnabled: true,
			agentMergeAvailable: true,
		});

		await assert.rejects(() => handler.invoke({
			channel: buildSessionChangesetUri(session.toString()),
			operationId: 'create-pr',
			_meta: createPullRequestOperationMeta(submittedOptions),
		}, CancellationToken.None), /PR creation failed/);

		assert.deepStrictEqual({ sessionConfigUpdates, sessionConfigValues }, {
			sessionConfigUpdates: [agentMergeFolderPatch(session, { enabled: false })],
			sessionConfigValues: {
				[SessionConfigKey.AgentMerge]: undefined,
				[SessionConfigKey.AgentMergeController]: undefined,
				[SessionConfigKey.AgentMergeFolders]: {
					[getWorkingDirectoryKey(URI.file('/repo').toString())]: { enabled: false },
				},
				[SessionConfigKey.AgentMergeControllerFolders]: {},
			},
		});
	});

	for (const autoMergeMethod of ['MERGE', 'SQUASH', 'REBASE'] as const) {
		test(`submitted options enable ${autoMergeMethod} auto-merge`, async () => {
			const gitService = new TestGitService();
			const gitHubClient = new TestGitHubClient();
			const { handler, session, copilotApiService, sessionConfigUpdates } = setup(disposables, gitService, gitHubClient, { withCopilotToken: true });

			await handler.invoke({
				channel: buildSessionChangesetUri(session.toString()),
				operationId: 'create-pr',
				_meta: createPullRequestOperationMeta({ ...submittedOptions, autoMergeMethod }),
			}, CancellationToken.None);

			assert.deepStrictEqual({
				octoCalls: gitHubClient.calls,
				title: gitHubClient.lastTitle,
				body: gitHubClient.lastBody,
				utilityCalls: copilotApiService.calls,
				sessionConfigUpdates,
			}, {
				octoCalls: ['getRepositoryMergeCapabilities:microsoft/vscode', 'findPullRequestByHeadBranch:feature/test', 'createPullRequest:false', `enableAutoMerge:PR_node_123:${autoMergeMethod}`],
				title: submittedOptions.title,
				body: submittedOptions.description,
				utilityCalls: [],
				sessionConfigUpdates: [],
			});
		});
	}

	for (const [name, value] of [
		['malformed slot', null],
		['blank title', { ...submittedOptions, title: ' \t\n' }],
		['non-string description', { ...submittedOptions, description: false }],
		['non-boolean draft', { ...submittedOptions, draft: 'true' }],
		['non-boolean Agent Merge', { ...submittedOptions, agentMerge: 1 }],
		['invalid method', { ...submittedOptions, autoMergeMethod: 'squash' }],
		['draft auto-merge', { ...submittedOptions, draft: true, autoMergeMethod: 'SQUASH' }],
		['conflicting automation', { ...submittedOptions, agentMerge: true, autoMergeMethod: 'MERGE' }],
	] as const) {
		test(`rejects ${name} before any git work`, async () => {
			const gitService = new TestGitService();
			gitService.uncommitted = true;
			gitService.gitState = { branchName: 'main', baseBranchName: 'main' };
			const gitHubClient = new TestGitHubClient();
			const { handler, session, branchNameGenerator, createdEvents, sessionConfigUpdates } = setup(disposables, gitService, gitHubClient, { sessionAgentMergeEnabled: true });

			await assert.rejects(() => handler.invoke({
				channel: buildSessionChangesetUri(session.toString()),
				operationId: 'create-pr',
				_meta: { 'vscode.pullRequest': value },
			}, CancellationToken.None), error => error instanceof ProtocolError && error.code === JsonRpcErrorCodes.InvalidParams);
			assert.deepStrictEqual({ git: gitService.calls, gitStateReads: gitService.requestedBaseBranches, octo: gitHubClient.calls, branches: branchNameGenerator.requests, createdEvents, sessionConfigUpdates }, {
				git: [], gitStateReads: [], octo: [], branches: [], createdEvents: [], sessionConfigUpdates: [],
			});
		});
	}

	for (const legacy of [false, true]) {
		test(`rejects ${legacy ? 'legacy' : 'submitted'} Agent Merge when the root feature gate is disabled`, async () => {
			const gitService = new TestGitService();
			gitService.uncommitted = true;
			const gitHubClient = new TestGitHubClient();
			const { handler, session, sessionConfigUpdates } = setup(disposables, gitService, gitHubClient, { enableAgentMerge: legacy, agentMergeAvailable: false });

			await assert.rejects(() => handler.invoke({
				channel: buildSessionChangesetUri(session.toString()),
				operationId: legacy ? 'create-pr-agent-merge' : 'create-pr',
				...(legacy ? {} : { _meta: createPullRequestOperationMeta({ ...submittedOptions, agentMerge: true }) }),
			}, CancellationToken.None), /Agent Merge is disabled/);
			assert.deepStrictEqual({ git: gitService.calls, octo: gitHubClient.calls, sessionConfigUpdates }, { git: [], octo: [], sessionConfigUpdates: [] });
		});
	}

	for (const capabilities of [
		{ autoMergeAllowed: false, mergeMethods: ['SQUASH'] },
		{ autoMergeAllowed: true, mergeMethods: ['MERGE'] },
	] satisfies GitHubRepositoryMergeCapabilities[]) {
		test(`rejects unavailable submitted auto-merge before changing git: ${JSON.stringify(capabilities)}`, async () => {
			const gitService = new TestGitService();
			gitService.uncommitted = true;
			const gitHubClient = new TestGitHubClient();
			gitHubClient.repositoryCapabilities = capabilities;
			const { handler, session, sessionConfigUpdates } = setup(disposables, gitService, gitHubClient, { sessionAgentMergeEnabled: true });

			await assert.rejects(() => handler.invoke({
				channel: buildSessionChangesetUri(session.toString()),
				operationId: 'create-pr',
				_meta: createPullRequestOperationMeta({ ...submittedOptions, autoMergeMethod: 'SQUASH' }),
			}, CancellationToken.None), /repository does not allow/);
			assert.deepStrictEqual({ git: gitService.calls, octo: gitHubClient.calls, sessionConfigUpdates }, {
				git: [], octo: ['getRepositoryMergeCapabilities:microsoft/vscode'], sessionConfigUpdates: [],
			});
		});
	}

	test('submitted Agent Merge preserves session overrides without replacing host defaults', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		const overrides: AgentMergeSessionOverrides = { fixCI: false, mergePullRequest: 'never' };
		const { handler, session, sessionConfigUpdates } = setup(disposables, gitService, gitHubClient, {
			agentMergeAvailable: true,
			agentMergeOverrides: overrides,
			agentMergeControllerState: { totalPromptCount: 9 },
		});

		const result = await handler.invoke({
			channel: buildSessionChangesetUri(session.toString()),
			operationId: 'create-pr',
			_meta: createPullRequestOperationMeta({ ...submittedOptions, agentMerge: true, draft: true }),
		}, CancellationToken.None);

		assert.deepStrictEqual({ message: result.message, sessionConfigUpdates }, {
			message: { markdown: 'Created draft pull request [#123](https://github.com/microsoft/vscode/pull/123) and enabled Agent Merge.' },
			sessionConfigUpdates: [agentMergeFolderPatch(session, { enabled: true, overrides })],
		});
	});

	for (const mergePullRequest of ['always', 'ifUnchanged', 'never'] as const) {
		test(`persists explicit session Agent Merge configuration after creation with merge policy ${mergePullRequest}`, async () => {
			const gitService = new TestGitService();
			const gitHubClient = new TestGitHubClient();
			const previousOverrides: AgentMergeSessionOverrides = { fixCI: true, mergePullRequest: 'never' };
			const { handler, session, sessionConfigUpdates, sessionConfigValues } = setup(disposables, gitService, gitHubClient, {
				agentMergeAvailable: true,
				sessionAgentMergeEnabled: false,
				agentMergeOverrides: previousOverrides,
				agentMergeControllerState: { totalPromptCount: 9 },
			});
			const stateAtCreation: boolean[] = [];
			gitHubClient.onMutation = () => stateAtCreation.push(readAgentMergeSessionState(sessionConfigValues)?.enabled === true);
			const agentMergeOptions = { addressReviews: true, fixCI: false, resolveConflicts: false, mergePullRequest };
			await handler.invoke({
				channel: buildSessionChangesetUri(session.toString()),
				operationId: 'create-pr',
				_meta: createPullRequestOperationMeta({ ...submittedOptions, agentMerge: true, agentMergeOptions }),
			}, CancellationToken.None);
			assert.deepStrictEqual({ stateAtCreation, sessionConfigUpdates, state: readAgentMergeSessionState(sessionConfigValues) }, {
				stateAtCreation: [false],
				sessionConfigUpdates: [agentMergeFolderPatch(session, { enabled: true, overrides: agentMergeOptions })],
				state: { enabled: true, overrides: agentMergeOptions },
			});
		});
	}

	test('creation failure does not save edited Agent Merge configuration', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		gitHubClient.createError = new Error('GitHub unavailable');
		const previousOverrides: AgentMergeSessionOverrides = { fixCI: true, mergePullRequest: 'never' };
		const { handler, session, sessionConfigUpdates, sessionConfigValues } = setup(disposables, gitService, gitHubClient, {
			agentMergeAvailable: true,
			sessionAgentMergeEnabled: false,
			agentMergeOverrides: previousOverrides,
		});
		await assert.rejects(() => handler.invoke({
			channel: buildSessionChangesetUri(session.toString()),
			operationId: 'create-pr',
			_meta: createPullRequestOperationMeta({
				...submittedOptions, agentMerge: true,
				agentMergeOptions: { addressReviews: false, fixCI: false, resolveConflicts: false, mergePullRequest: 'always' },
			}),
		}, CancellationToken.None), /GitHub unavailable/);
		assert.deepStrictEqual({ sessionConfigUpdates, state: readAgentMergeSessionState(sessionConfigValues) }, {
			sessionConfigUpdates: [],
			state: { enabled: false, overrides: previousOverrides },
		});
	});

	for (const existingAfterFailure of [false, true]) {
		test(`submitted auto-merge options finalize an existing PR${existingAfterFailure ? ' recovered after a create race' : ''}`, async () => {
			const gitService = new TestGitService();
			const gitHubClient = new TestGitHubClient();
			const existing = createTestPullRequest(8, { id: 'PR_8' });
			if (existingAfterFailure) {
				gitHubClient.createError = new Error('Already exists');
				gitHubClient.existingAfterCreateFailure = existing;
			} else {
				gitHubClient.existing = existing;
			}
			const { handler, session, createdEvents, copilotApiService } = setup(disposables, gitService, gitHubClient, { withCopilotToken: true });

			const result = await handler.invoke({
				channel: buildSessionChangesetUri(session.toString()),
				operationId: 'create-pr',
				_meta: createPullRequestOperationMeta({ ...submittedOptions, autoMergeMethod: 'SQUASH' }),
			}, CancellationToken.None);

			assert.deepStrictEqual({ message: result.message, octo: gitHubClient.calls, createdEvents, utilityCalls: copilotApiService.calls }, {
				message: { markdown: 'Pull request [#8](https://github.com/microsoft/vscode/pull/8) already exists; enabled auto-merge (squash).' },
				octo: ['getRepositoryMergeCapabilities:microsoft/vscode', 'findPullRequestByHeadBranch:feature/test', ...(existingAfterFailure ? ['createPullRequest:false', 'findPullRequestByHeadBranch:feature/test'] : []), 'enableAutoMerge:PR_8:SQUASH'],
				createdEvents: ['agent:/session:https://github.com/microsoft/vscode/pull/8'],
				utilityCalls: [],
			});
		});
	}

	test('submitted auto-merge retains the created PR when enabling automation subsequently fails', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		gitHubClient.autoMergeError = new Error('Auto-merge permissions changed');
		const { handler, session, createdEvents } = setup(disposables, gitService, gitHubClient);

		const result = await handler.invoke({
			channel: buildSessionChangesetUri(session.toString()),
			operationId: 'create-pr',
			_meta: createPullRequestOperationMeta({ ...submittedOptions, autoMergeMethod: 'SQUASH' }),
		}, CancellationToken.None);

		assert.deepStrictEqual({ message: result.message, followUp: result.followUp, createdEvents }, {
			message: { markdown: 'Created pull request [#123](https://github.com/microsoft/vscode/pull/123), but auto-merge could not be enabled: Auto-merge permissions changed' },
			followUp: { content: { uri: 'https://github.com/microsoft/vscode/pull/123', contentType: 'text/html' }, external: true },
			createdEvents: ['agent:/session:https://github.com/microsoft/vscode/pull/123'],
		});
	});

	// Matches the Copilot CLI Agent Window behavior: if the session has
	// uncommitted work, Create PR first commits that work, then pushes the
	// branch, then asks GitHub to create the PR.
	test('commits uncommitted changes before pushing and creating a pull request', async () => {
		const gitService = new TestGitService();
		gitService.uncommitted = true;
		const gitHubClient = new TestGitHubClient();
		const { handler, session, createdEvents } = setup(disposables, gitService, gitHubClient, { baseBranch: 'release' });

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			gitCalls: gitService.calls,
			requestedBaseBranches: gitService.requestedBaseBranches,
			pullRequestBase: gitHubClient.lastBase,
			octoCalls: gitHubClient.calls,
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
			requestedBaseBranches: ['release'],
			pullRequestBase: 'release',
			octoCalls: [
				'findPullRequestByHeadBranch:feature/test',
				'createPullRequest:false',
			],
			createdEvents: ['agent:/session:https://github.com/microsoft/vscode/pull/123'],
		});
	});

	test('enables Agent Merge after creating the pull request, preserves overrides, and clears stale controller state', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		const overrides: AgentMergeSessionOverrides = { fixCI: false };
		const { handler, session, createdEvents, sessionConfigUpdates } = setup(disposables, gitService, gitHubClient, {
			enableAgentMerge: true,
			agentMergeOverrides: overrides,
			agentMergeControllerState: {
				target: {
					branchName: 'previous-branch',
					pullRequestUrl: 'https://github.com/microsoft/vscode/pull/1',
					enabledAt: new Date(1).toISOString(),
					commentWatermark: '',
				},
			},
		});

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AGENT_MERGE }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			createdEvents,
			sessionConfigUpdates,
		}, {
			message: { markdown: 'Created pull request [#123](https://github.com/microsoft/vscode/pull/123) and enabled Agent Merge.' },
			createdEvents: ['agent:/session:https://github.com/microsoft/vscode/pull/123'],
			sessionConfigUpdates: [agentMergeFolderPatch(session, { enabled: true, overrides })],
		});
	});

	test('creates a draft pull request and enables Agent Merge', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		const { handler, session, sessionConfigUpdates } = setup(disposables, gitService, gitHubClient, {
			draft: true,
			enableAgentMerge: true,
		});

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_DRAFT_PR_AGENT_MERGE }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			octoCalls: gitHubClient.calls,
			sessionConfigUpdates,
		}, {
			message: { markdown: 'Created draft pull request [#123](https://github.com/microsoft/vscode/pull/123) and enabled Agent Merge.' },
			octoCalls: [
				'findPullRequestByHeadBranch:feature/test',
				'createPullRequest:true',
			],
			sessionConfigUpdates: [agentMergeFolderPatch(session, { enabled: true })],
		});
	});

	test('creates a generated branch before committing when the current branch is the base branch', async () => {
		const gitService = new TestGitService();
		gitService.uncommitted = true;
		gitService.gitState = {
			branchName: 'main',
			baseBranchName: 'main',
			upstreamBranchName: 'origin/main',
			githubHeadOwner: 'microsoft',
		};
		gitService.gitStateAfterBranchCreation = {
			branchName: 'users/test/agents/add-retry-logic',
			baseBranchName: 'main',
		};
		const gitHubClient = new TestGitHubClient();
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.response = 'add-retry-logic';
		const turns: Turn[] = [{
			id: 'turn-1',
			message: { text: 'Add retry logic', origin: { kind: MessageKind.User } },
			responseParts: [],
			usage: undefined,
			state: TurnState.Complete,
		}];
		const { handler, session, createdBranches, branchNameGenerator } = setup(disposables, gitService, gitHubClient, {
			copilotApiService,
			withCopilotToken: true,
			turns,
			branchPrefix: 'users/test/',
		});

		await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		assert.deepStrictEqual({
			gitCalls: gitService.calls,
			requestedBaseBranches: gitService.requestedBaseBranches,
			branchGenerationTokens: branchNameGenerator.requests.map(request => request.githubToken),
			utilityCallTokens: copilotApiService.calls.map(call => call.token),
			pushOptions: gitService.pushOptions,
			createHead: gitHubClient.lastHead,
			createBase: gitHubClient.lastBase,
			createdBranches,
		}, {
			gitCalls: [
				'hasUncommittedChanges',
				'branchExists:users/test/agents/add-retry-logic',
				'createBranch:users/test/agents/add-retry-logic',
				'commitAll:Agent Host changes for users/test/agents/add-retry-logic',
				'computeSessionFileDiffs',
				'hasUpstream',
				'push:users/test/agents/add-retry-logic:true',
			],
			requestedBaseBranches: ['main', 'main'],
			branchGenerationTokens: ['gh-token'],
			utilityCallTokens: ['copilot-token'],
			pushOptions: [{ remote: undefined, ref: 'users/test/agents/add-retry-logic', setUpstream: true }],
			createHead: 'users/test/agents/add-retry-logic',
			createBase: 'main',
			createdBranches: ['users/test/agents/add-retry-logic'],
		});
	});

	test('pushes, finds, and creates with the same fork upstream', async () => {
		const gitService = new TestGitService();
		gitService.upstream = true;
		gitService.gitState = {
			branchName: 'feature/test',
			baseBranchName: 'main',
			upstreamBranchName: 'fork/published-feature',
			githubOwner: 'microsoft',
			githubHeadOwner: 'fork-owner',
			githubRepo: 'vscode',
		};
		const gitHubClient = new TestGitHubClient();
		const { handler, session } = setup(disposables, gitService, gitHubClient);

		await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		assert.deepStrictEqual({
			pushOptions: gitService.pushOptions,
			findRequests: gitHubClient.findRequests,
			createHead: gitHubClient.lastHead,
		}, {
			pushOptions: [{ remote: 'fork', ref: 'feature/test:published-feature', setUpstream: false }],
			findRequests: [{ branch: 'published-feature', headOwner: 'fork-owner' }],
			createHead: 'fork-owner:published-feature',
		});
	});

	// GitHub returns 422 when a PR already exists for the branch. The handler
	// should preflight the branch and return/open the existing PR instead of
	// trying to create a duplicate.
	test('returns an existing pull request without creating a duplicate', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		gitHubClient.existing = createTestPullRequest(7);
		const { handler, session, createdEvents } = setup(disposables, gitService, gitHubClient);

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			octoCalls: gitHubClient.calls,
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
		const gitHubClient = new TestGitHubClient();
		const { handler, session } = setup(disposables, gitService, gitHubClient);

		await assert.rejects(
			() => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None),
			/no branch changes/,
		);
		assert.deepStrictEqual(gitHubClient.calls, []);
	});

	test('does not push or call GitHub when branch changes cannot be computed', async () => {
		const gitService = new TestGitService();
		gitService.branchChanges = undefined;
		const gitHubClient = new TestGitHubClient();
		const { handler, session } = setup(disposables, gitService, gitHubClient);

		await assert.rejects(
			() => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None),
			/Could not compute branch changes/,
		);

		assert.deepStrictEqual({ gitCalls: gitService.calls, octoCalls: gitHubClient.calls }, {
			gitCalls: ['hasUncommittedChanges', 'computeSessionFileDiffs'],
			octoCalls: [],
		});
	});

	test('returns existing pull request found after create failure', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		gitHubClient.createError = new Error('Validation Failed');
		gitHubClient.existingAfterCreateFailure = createTestPullRequest(8);
		const { handler, session, createdEvents } = setup(disposables, gitService, gitHubClient);

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		assert.deepStrictEqual({ message: result.message, octoCalls: gitHubClient.calls, createdEvents }, {
			message: { markdown: 'Pull request [#8](https://github.com/microsoft/vscode/pull/8) already exists.' },
			octoCalls: ['findPullRequestByHeadBranch:feature/test', 'createPullRequest:false', 'findPullRequestByHeadBranch:feature/test'],
			createdEvents: ['agent:/session:https://github.com/microsoft/vscode/pull/8'],
		});
	});

	test('preserves create failure when existing pull request recovery fails', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		gitHubClient.createError = new Error('create failed');
		gitHubClient.findAfterCreateError = new Error('find failed');
		const { handler, session } = setup(disposables, gitService, gitHubClient);

		await assert.rejects(
			() => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None),
			/create failed/,
		);
	});

	test('reconciles an ambiguous create through the captured client without replaying the write', async () => {
		const requests: string[] = [];
		const gitHubClient = createNetworkClient(async (input, init) => {
			const path = new URL(String(input)).pathname;
			requests.push(`${init?.method}:${path}`);
			if (path === '/user') {
				return new Response('{"id":1}');
			}
			assert.strictEqual(path, '/repos/microsoft/vscode/pulls');
			if (init?.method === 'POST') {
				throw new Error('Connection lost after create');
			}
			return new Response(JSON.stringify(requests.some(request => request.startsWith('POST:'))
				? [{ number: 8, html_url: 'https://github.com/microsoft/vscode/pull/8', title: 'Recovered title', node_id: 'PR8', state: 'open' }]
				: []));
		});
		const { handler, session, createdEvents } = setup(disposables, new TestGitService(), gitHubClient);

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: 'create-pr' }, CancellationToken.None);

		assert.deepStrictEqual({ requests, message: result.message, createdEvents }, {
			requests: ['GET:/user', 'GET:/repos/microsoft/vscode/pulls', 'POST:/repos/microsoft/vscode/pulls', 'GET:/repos/microsoft/vscode/pulls'],
			message: { markdown: 'Pull request [#8](https://github.com/microsoft/vscode/pull/8) already exists.' },
			createdEvents: ['agent:/session:https://github.com/microsoft/vscode/pull/8'],
		});
	});

	test('does not reconcile a failed create under a newly selected account', async () => {
		const endpoint = createTestGitHubEndpointService();
		const changed = disposables.add(new Emitter<IAgentHostAuthTokenChangeEvent>());
		let selected = 'account-a';
		const authentication = new class extends mock<IAgentHostAuthenticationService>() {
			override readonly onDidChangeAuthToken = changed.event;
			override getAuthAccount() { return { providerId: 'github', accountId: selected }; }
			override getAuthToken() { return selected; }
		}();
		const requests: string[] = [];
		const service = disposables.add(new AgentHostGitHubService({
			fetch: async (input, init) => {
				const path = new URL(String(input)).pathname;
				requests.push(`${init?.method}:${path}:${selected}`);
				if (path === '/user') {
					return new Response('{"id":101}');
				}
				if (init?.method === 'POST') {
					selected = 'account-b';
					changed.fire({ resource: endpoint.getRepoResource().resource, scopes: ['repo'], token: selected });
					throw new Error('Connection lost after create');
				}
				return new Response('[]');
			},
		}, authentication, endpoint, new NullLogService(), NullTelemetryService));
		const client = disposables.add(service.acquireRepositoryClient(new AbortController().signal)).object;
		const { handler, session, createdEvents } = setup(disposables, new TestGitService(), client);

		await assert.rejects(handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: 'create-pr' }, CancellationToken.None));

		assert.deepStrictEqual({ requests, createdEvents }, {
			requests: ['GET:/user:account-a', 'GET:/repos/microsoft/vscode/pulls:account-a', 'POST:/repos/microsoft/vscode/pulls:account-a'],
			createdEvents: [],
		});
	});

	for (const scenario of [
		{ renewal: 'before create', cancelled: false },
		{ renewal: 'during create', cancelled: false },
		{ renewal: 'before auto-merge', cancelled: false },
		{ renewal: 'during create', cancelled: true },
	] as const) {
		test(`same-account token renewal ${scenario.renewal}${scenario.cancelled ? ' preserves user cancellation' : ' preserves PR creation and auto-merge'}`, async () => {
			const endpoint = createTestGitHubEndpointService();
			const changed = disposables.add(new Emitter<IAgentHostAuthTokenChangeEvent>());
			let token = 'first-token';
			const authentication = new class extends mock<IAgentHostAuthenticationService>() {
				override readonly onDidChangeAuthToken = changed.event;
				override getAuthAccount() { return { providerId: 'github', accountId: 'repository-account' }; }
				override getAuthToken() { return token; }
			}();
			const renewToken = () => {
				token = 'renewed-token';
				changed.fire({ resource: endpoint.getRepoResource().resource, scopes: ['repo'], token });
			};
			const createStarted = new DeferredPromise<void>();
			const createResponse = new DeferredPromise<Response>();
			const pullRequest = { number: 8, html_url: 'https://github.com/microsoft/vscode/pull/8', title: 'Created title', node_id: 'PR8', state: 'open' };
			const requests: string[] = [];
			let created = false;
			let createSignal: AbortSignal | undefined;
			const service = disposables.add(new AgentHostGitHubService({
				fetch: async (input, init) => {
					const path = new URL(String(input)).pathname;
					requests.push(`${init?.method}:${path}:${new Headers(init?.headers).get('Authorization')}`);
					if (path === '/user') {
						return new Response('{"id":101}');
					}
					if (path === '/graphql') {
						return new Response('{"data":{"enablePullRequestAutoMerge":{"pullRequest":{"id":"PR8"}}}}');
					}
					assert.strictEqual(path, '/repos/microsoft/vscode/pulls');
					if (init?.method === 'POST') {
						created = true;
						assert.ok(init.signal);
						createSignal = init.signal;
						if (scenario.renewal === 'during create') {
							await createStarted.complete();
							return createResponse.p;
						}
						if (scenario.renewal === 'before auto-merge') {
							renewToken();
						}
						return new Response(JSON.stringify(pullRequest), { status: 201 });
					}
					return new Response(JSON.stringify(created ? [pullRequest] : []));
				},
			}, authentication, endpoint, new NullLogService(), NullTelemetryService));
			const client = disposables.add(service.acquireRepositoryClient(new AbortController().signal)).object;
			const source = disposables.add(new CancellationTokenSource());
			const { handler, session, copilotApiService, createdEvents } = setup(disposables, new TestGitService(), client, { withCopilotToken: true, autoMergeMethod: 'SQUASH' });
			if (scenario.renewal === 'before create') {
				copilotApiService.onUtilityChatCompletion = renewToken;
			}

			const operation = handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: 'create-pr' }, source.token);
			const [result] = await Promise.all([
				scenario.cancelled ? assert.rejects(operation, /Pull request operation was cancelled/).then(() => undefined) : operation,
				(async () => {
					if (scenario.renewal !== 'during create') {
						return;
					}
					await createStarted.p;
					renewToken();
					if (scenario.cancelled) {
						source.cancel();
					}
					await client.credentials.getCredential(new AbortController().signal);
					await createResponse.complete(new Response(JSON.stringify(pullRequest), { status: 201 }));
				})(),
			]);

			assert.deepStrictEqual({
				message: result?.message,
				createdEvents,
				sameClient: disposables.add(service.acquireRepositoryClient(new AbortController().signal)).object === client,
				interruptedCreate: scenario.renewal === 'during create' && createSignal?.aborted,
				requests,
			}, {
				message: scenario.cancelled ? undefined : {
					markdown: scenario.renewal === 'during create'
						? 'Pull request [#8](https://github.com/microsoft/vscode/pull/8) already exists; enabled auto-merge (squash).'
						: 'Created pull request [#8](https://github.com/microsoft/vscode/pull/8) with auto-merge (squash) enabled.',
				},
				createdEvents: scenario.cancelled ? [] : ['agent:/session:https://github.com/microsoft/vscode/pull/8'],
				sameClient: true,
				interruptedCreate: scenario.renewal === 'during create',
				requests: [
					'GET:/user:Bearer first-token',
					'GET:/repos/microsoft/vscode/pulls:Bearer first-token',
					...(scenario.renewal === 'before create' ? [] : ['POST:/repos/microsoft/vscode/pulls:Bearer first-token']),
					'GET:/user:Bearer renewed-token',
					...(scenario.renewal === 'before create' ? ['POST:/repos/microsoft/vscode/pulls:Bearer renewed-token'] : []),
					...(scenario.renewal === 'during create' && !scenario.cancelled ? ['GET:/repos/microsoft/vscode/pulls:Bearer renewed-token'] : []),
					...(scenario.cancelled ? [] : ['POST:/graphql:Bearer renewed-token']),
				],
			});
		});
	}

	for (const dispatched of [false, true]) {
		test(`only reconciles timed-out creation after dispatch (${dispatched})`, async () => {
			const gitHubClient = new TestGitHubClient();
			gitHubClient.createError = new GitHubRequestTimeoutError(dispatched);
			gitHubClient.existingAfterCreateFailure = createTestPullRequest(8);
			const { handler, session, createdEvents } = setup(disposables, new TestGitService(), gitHubClient);
			const pending = handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: 'create-pr' }, CancellationToken.None);
			if (dispatched) {
				await pending;
			} else {
				await assert.rejects(pending, { kind: 'timeout', requestDispatched: false });
			}
			assert.deepStrictEqual({ calls: gitHubClient.calls, createdEvents }, {
				calls: ['findPullRequestByHeadBranch:feature/test', 'createPullRequest:false', ...(dispatched ? ['findPullRequestByHeadBranch:feature/test'] : [])],
				createdEvents: dispatched ? ['agent:/session:https://github.com/microsoft/vscode/pull/8'] : [],
			});
		});
	}

	test('honors cancellation before mutating the repository', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		const { handler, session, createdEvents } = setup(disposables, gitService, gitHubClient);
		const cts = new CancellationTokenSource();
		disposables.add(cts);
		cts.cancel();

		await assert.rejects(
			() => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, cts.token),
			/Pull request operation was cancelled/,
		);

		assert.deepStrictEqual({ gitCalls: gitService.calls, octoCalls: gitHubClient.calls, createdEvents }, {
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
		const gitHubClient = new TestGitHubClient();
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
		const { handler, session, copilotApiService } = setup(disposables, gitService, gitHubClient, { withCopilotToken: true, turns });

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		const userContent = copilotApiService.calls[0]?.request.messages.find(m => m.role === 'user')?.content ?? '';
		assert.deepStrictEqual({
			message: result.message,
			token: copilotApiService.calls[0]?.token,
			title: gitHubClient.lastTitle,
			body: gitHubClient.lastBody,
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

	// Absolute worktree paths repeat a long prefix on every line; they must not
	// crowd whole areas of the change (here, every Sessions file) out of the
	// bounded change summary.
	test('lists changed files relative to the repository so a large change fits the prompt', async () => {
		const gitService = new TestGitService();
		const workingDirectory = URI.file('/Users/someone/work/vscode.worktrees/move-chat-session-implementation-plan-60e97a62');
		const files = [
			...Array.from({ length: 27 }, (_, i) => `src/vs/platform/agentHost/node/agentHostFile${i}.ts`),
			...Array.from({ length: 19 }, (_, i) => `src/vs/sessions/contrib/sessions/browser/sessionsFile${i}.ts`),
		];
		gitService.branchChanges = files.map(file => {
			const uri = URI.joinPath(workingDirectory, file).toString();
			return { before: { uri, content: { uri } }, after: { uri, content: { uri } }, diff: { added: 12, removed: 3 } };
		});
		const { handler, session, copilotApiService } = setup(disposables, gitService, new TestGitHubClient(), { withCopilotToken: true, workingDirectory: workingDirectory.toString() });

		await handler.prepare({ channel: buildSessionChangesetUri(session.toString()), operationId: PREPARE_PULL_REQUEST_OPERATION_ID }, CancellationToken.None);

		const userContent = copilotApiService.calls[0]?.request.messages.find(m => m.role === 'user')?.content ?? '';
		const changedFiles = /Changed files:\n(?<list>[\s\S]*?)(?:\n\n|$)/.exec(userContent)?.groups?.list.split('\n') ?? [];
		assert.deepStrictEqual(changedFiles, files.map(file => `- Edit: ${file} (+12 -3)`));
	});

	// Without a Copilot token the model is never called and the handler falls
	// back to the branch-name based title/description.
	test('falls back to branch-name title and description without a Copilot token', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		const { handler, session, copilotApiService } = setup(disposables, gitService, gitHubClient);

		await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		assert.deepStrictEqual({
			utilityCalls: copilotApiService.calls.length,
			title: gitHubClient.lastTitle,
			body: gitHubClient.lastBody,
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
		const gitHubClient = new TestGitHubClient();
		const copilotApiService = new TestCopilotApiService();
		copilotApiService.error = new Error('utility model unavailable');
		const { handler, session } = setup(disposables, gitService, gitHubClient, { withCopilotToken: true, copilotApiService });

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			title: gitHubClient.lastTitle,
			body: gitHubClient.lastBody,
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
		const gitHubClient = new TestGitHubClient();
		const { handler, session, createdEvents } = setup(disposables, gitService, gitHubClient, { autoMergeMethod: 'SQUASH' });

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_SQUASH }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			octoCalls: gitHubClient.calls,
			createdEvents,
		}, {
			message: { markdown: 'Created pull request [#123](https://github.com/microsoft/vscode/pull/123) with auto-merge (squash) enabled.' },
			octoCalls: [
				'findPullRequestByHeadBranch:feature/test',
				'createPullRequest:false',
				'enableAutoMerge:PR_node_123:SQUASH',
			],
			createdEvents: ['agent:/session:https://github.com/microsoft/vscode/pull/123'],
		});
	});

	// Enabling auto-merge is best-effort: a failure (e.g. the repository does
	// not allow the merge method) must not fail PR creation.
	test('reports but does not fail when auto-merge cannot be enabled', async () => {
		const gitService = new TestGitService();
		const gitHubClient = new TestGitHubClient();
		gitHubClient.autoMergeError = new Error('Auto-merge is not allowed for this repository');
		const { handler, session, createdEvents } = setup(disposables, gitService, gitHubClient, { autoMergeMethod: 'MERGE' });

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
		const gitHubClient = new TestGitHubClient();
		gitHubClient.created = createTestPullRequest(55);
		const { handler, session } = setup(disposables, gitService, gitHubClient, { autoMergeMethod: 'REBASE' });

		const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_REBASE }, CancellationToken.None);

		assert.deepStrictEqual({
			message: result.message,
			enableCalled: gitHubClient.calls.some(call => call.startsWith('enableAutoMerge:')),
		}, {
			message: { markdown: 'Created pull request [#55](https://github.com/microsoft/vscode/pull/55), but auto-merge could not be enabled: the pull request identifier was not returned by GitHub.' },
			enableCalled: false,
		});
	});
});
