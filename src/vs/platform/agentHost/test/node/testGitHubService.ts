/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { ImmortalReference } from '../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { IGitHubAccountClient } from '../../../github/common/account/account.js';
import { WorkflowJob, WorkflowRun } from '../../../github/common/core/actions.js';
import { Issue } from '../../../github/common/core/issues.js';
import { PullRequest, PullRequestSummary } from '../../../github/common/core/pullRequests.js';
import { IGitHubCredentials } from '../../../github/common/githubCredentialService.js';
import { GitHubQueryApi } from '../../../github/common/githubQueryService.js';
import { IGitHubClient } from '../../../github/common/githubService.js';
import { PullRequestMutationApi } from '../../../github/common/githubPullRequestMutationService.js';
import { IAgentHostGitHubService } from '../../node/agentHostGitHubService.js';
import { captureCredentialSource, type IAgentHostCredentialSource } from '../../common/agentHostCredentials.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE } from '../../common/agent.js';

export function createTestGitHubService(client: IGitHubClient = new class extends mock<IGitHubClient>() { }(), onDidChange: Event<void> = Event.None, api: Partial<Pick<IGitHubAccountClient, 'pullRequests' | 'actions' | 'checks'>> = {}, credentialSource?: IAgentHostCredentialSource): IAgentHostGitHubService {
	const agentMergeBindings = new Map<string, IAgentHostCredentialSource>();
	return new class extends mock<IAgentHostGitHubService>() {
		override readonly onDidChangeRepositoryClient = onDidChange;
		override getAgentMergeCredentialBinding(chat: string) { return agentMergeBindings.get(chat); }
		override getAgentMergeCredentialSource(chat: string) { return agentMergeBindings.get(chat) ?? credentialSource; }
		override bindAgentMergeCredentialSource(_session: string, chat: string, source: IAgentHostCredentialSource | undefined) {
			if (source) {
				agentMergeBindings.set(chat, source);
			} else {
				agentMergeBindings.delete(chat);
			}
		}
		override captureSessionCredentialSource(session: string, source?: IAgentHostCredentialSource, _owningSession?: string, includeCopilot = false) {
			const selected = source ?? credentialSource;
			return selected ? captureCredentialSource({
				principal: selected.principal,
				getCredential: request => selected.getCredential({ ...request, session }),
			}, [GITHUB_REPO_PROTECTED_RESOURCE, ...(includeCopilot ? [{ ...GITHUB_COPILOT_PROTECTED_RESOURCE, required: false }] : [])]) : undefined;
		}
		override acquireRepositoryClient() { return new ImmortalReference(client); }
		override acquireRepositoryApiClient() {
			return upcastPartial<IGitHubAccountClient>({ authorization: client.authorization, ...api, dispose: () => { } });
		}
	}();
}

export function createTestGitHubClient(overrides: Partial<Pick<IGitHubClient, 'credentials' | 'query' | 'mutations'>> = {}): IGitHubClient {
	return new class extends mock<IGitHubClient>() {
		override readonly credentials = overrides.credentials ?? new class extends mock<IGitHubCredentials>() {
			override readonly onDidInvalidate = Event.None;
			override async getCredential(signal: AbortSignal) {
				signal.throwIfAborted();
				return { account: { host: 'api.github.com', accountId: '1' }, token: 'test-token', generation: 1, signal: new AbortController().signal };
			}
		}();
		override readonly query = overrides.query ?? new class extends mock<GitHubQueryApi>() { }();
		override readonly mutations = overrides.mutations ?? new class extends mock<PullRequestMutationApi>() { }();
	}();
}

export function createTestPullRequest(number: number, overrides: Partial<PullRequest> = {}): PullRequest {
	return {
		...createTestPullRequestSummary(number),
		merged: false, mergeable: null, mergeable_state: 'unknown', maintainer_can_modify: false, merged_by: null,
		commits: 1, changed_files: 1, additions: 0, deletions: 0, comments: 0, review_comments: 0, auto_merge: null,
		...overrides,
	};
}

export function createTestPullRequestSummary(number: number, overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
	return {
		id: number, node_id: `PR_${number}`, number,
		html_url: `https://github.com/microsoft/vscode/pull/${number}`,
		url: `https://api.github.com/repos/microsoft/vscode/pulls/${number}`,
		title: `Pull request ${number}`, body: null, state: 'open', user: null,
		head: { label: 'microsoft:feature', ref: 'feature', sha: 'head', repo: null },
		base: { label: 'microsoft:main', ref: 'main', sha: 'base', repo: null },
		labels: [], milestone: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
		closed_at: null, merged_at: null, merge_commit_sha: null,
		...overrides,
	};
}

export function createTestGitHubIssue(number: number, overrides: Partial<Issue> = {}): Issue {
	return {
		id: number,
		node_id: `I_${number}`,
		number,
		html_url: `https://github.com/microsoft/vscode/issues/${number}`,
		repository_url: 'https://api.github.com/repos/microsoft/vscode',
		title: 'Context',
		body: 'Body',
		state: 'open',
		locked: false,
		user: null,
		labels: [],
		milestone: null,
		comments: 0,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		closed_at: null,
		...overrides,
	};
}

export function createTestWorkflowRun(id = 1, overrides: Partial<WorkflowRun> = {}): WorkflowRun {
	return {
		id, node_id: `WR_${id}`, workflow_id: 1, run_number: 1, run_attempt: 1,
		name: 'CI', display_title: 'CI', path: '.github/workflows/ci.yml', event: 'push',
		head_branch: 'main', head_sha: 'head', status: 'completed', conclusion: 'failure',
		html_url: `https://github.com/owner/repo/actions/runs/${id}`, pull_requests: [],
		created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

export function createTestWorkflowJob(id = 100, overrides: Partial<WorkflowJob> = {}): WorkflowJob {
	return {
		id, node_id: `WJ_${id}`, run_id: 1, run_attempt: 1, name: 'CI',
		head_sha: 'head', status: 'completed', conclusion: 'failure',
		html_url: `https://github.com/owner/repo/actions/runs/1/job/${id}`,
		check_run_url: `https://api.github.com/repos/owner/repo/check-runs/${id}`,
		started_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T00:00:00Z', labels: [],
		...overrides,
	};
}
