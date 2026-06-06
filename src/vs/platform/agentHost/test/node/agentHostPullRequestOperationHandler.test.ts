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
import { GITHUB_REPO_PROTECTED_RESOURCE, type IAgentService } from '../../common/agentService.js';
import { buildSessionChangesetUri } from '../../common/changesetUri.js';
import { withSessionGitState, type ISessionFileDiff, SessionStatus } from '../../common/state/sessionState.js';
import type { IAgentHostGitService } from '../../node/agentHostGitService.js';
import { AgentHostPullRequestOperationHandler } from '../../node/agentHostPullRequestOperationHandler.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { CreatedPullRequest, IAgentHostOctoKitService } from '../../node/shared/agentHostOctoKitService.js';

class TestGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	readonly calls: string[] = [];
	uncommitted = false;
	upstream = false;
	branchChanges: readonly ISessionFileDiff[] | undefined = [{ after: { uri: 'file:///repo/file.ts', content: { uri: 'file:///repo/file.ts' } } }];

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
	async hasUpstream(): Promise<boolean> {
		this.calls.push('hasUpstream');
		return this.upstream;
	}
	async pushBranch(_workingDirectory: URI, branchName: string, setUpstream: boolean): Promise<void> {
		this.calls.push(`pushBranch:${branchName}:${setUpstream}`);
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
	async computeFileDiffsBetweenRefs(): Promise<readonly ISessionFileDiff[] | undefined> { return undefined; }
}

class TestOctoKitService implements IAgentHostOctoKitService {
	declare readonly _serviceBrand: undefined;

	readonly calls: string[] = [];
	existing: CreatedPullRequest | undefined;
	existingAfterCreateFailure: CreatedPullRequest | undefined;
	createError: Error | undefined;
	findAfterCreateError: Error | undefined;
	created: CreatedPullRequest = { url: 'https://github.com/microsoft/vscode/pull/123', number: 123 };

	async createPullRequest(_owner: string, _repo: string, _title: string, _body: string, _head: string, _base: string, draft: boolean, _token: string, _signal: AbortSignal): Promise<CreatedPullRequest> {
		this.calls.push(`createPullRequest:${draft}`);
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
}

function createAgentService(): IAgentService {
	return {
		getAuthToken: resource => resource.resource === GITHUB_REPO_PROTECTED_RESOURCE.resource ? 'gh-token' : undefined,
	} as IAgentService;
}

function setup(disposables: Pick<DisposableStore, 'add'>, gitService: TestGitService, octoKitService: TestOctoKitService): { handler: AgentHostPullRequestOperationHandler; session: URI; createdEvents: string[] } {
	const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
	const session = URI.parse('agent:/session');
	const createdEvents: string[] = [];
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
		hasGitHubRemote: true,
		githubOwner: 'microsoft',
		githubRepo: 'vscode',
		branchName: 'feature/test',
		baseBranchName: 'main',
	}));
	return {
		handler: new AgentHostPullRequestOperationHandler(false, sessionKey => stateManager.getSessionState(sessionKey), event => createdEvents.push(`${event.sessionKey}:${event.branchName}`), createAgentService(), gitService, octoKitService, new NullLogService()),
		session,
		createdEvents,
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
				'pushBranch:feature/test:true',
			],
			octoCalls: [
				'findPullRequestByHeadBranch:feature/test',
				'createPullRequest:false',
			],
			createdEvents: ['agent:/session:feature/test'],
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
			createdEvents: ['agent:/session:feature/test'],
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
			createdEvents: ['agent:/session:feature/test'],
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
});
