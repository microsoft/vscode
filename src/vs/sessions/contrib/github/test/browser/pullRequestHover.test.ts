/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createPullRequestHover } from '../../browser/pullRequestHover.js';
import { GitHubCIOverallStatus, GitHubPullRequestState, IGitHubPullRequest } from '../../common/types.js';

function makePullRequest(overrides: Partial<IGitHubPullRequest> = {}): IGitHubPullRequest {
	return {
		number: 1,
		title: 'Test PR',
		body: 'Test body',
		state: GitHubPullRequestState.Open,
		author: { login: 'author', avatarUrl: '' },
		headRef: 'feature',
		headSha: 'abc123',
		baseRef: 'main',
		isDraft: false,
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-02T00:00:00Z',
		mergedAt: undefined,
		mergeable: true,
		mergeableState: 'clean',
		...overrides,
	};
}

suite('createPullRequestHover', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('hides the decorative branch-direction arrow from the accessibility tree', () => {
		const { element } = createPullRequestHover({
			owner: 'owner',
			repo: 'repo',
			number: 1,
			repositoryHref: 'https://example.com',
			referenceHref: 'https://example.com/1',
			pullRequest: makePullRequest(),
			density: 'default',
		});

		const arrow = element.querySelector('.sessions-pr-hover-branch-arrow');
		assert.strictEqual(arrow?.getAttribute('aria-hidden'), 'true');
	});

	test('activating a branch pill stops the click from bubbling to an ancestor list row', () => {
		const clicks: string[] = [];
		const { element } = createPullRequestHover({
			owner: 'owner',
			repo: 'repo',
			number: 1,
			repositoryHref: 'https://example.com',
			referenceHref: 'https://example.com/1',
			pullRequest: makePullRequest(),
			density: 'default',
			onDidClickBaseBranch: () => clicks.push('base'),
			onDidClickHeadBranch: () => clicks.push('head'),
		});

		// Simulate the ActionList row that owns the hover panel; a click reaching this
		// ancestor is what the real list interprets as "clicked outside a row".
		const row = document.createElement('div');
		row.className = 'action-list-item';
		row.append(element);
		let bubbledToRow = false;
		row.addEventListener('click', () => { bubbledToRow = true; });

		const [baseBranch, headBranch] = Array.from(element.querySelectorAll<HTMLButtonElement>('.sessions-pr-hover-branch'));
		baseBranch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		headBranch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

		assert.deepStrictEqual({ clicks, bubbledToRow }, { clicks: ['base', 'head'], bubbledToRow: false });
	});

	test('shows overall CI status for open pull requests', () => {
		const render = (ciStatus: GitHubCIOverallStatus, pullRequest = makePullRequest()) => {
			const { element } = createPullRequestHover({
				owner: 'owner',
				repo: 'repo',
				number: 1,
				repositoryHref: 'https://example.com',
				referenceHref: 'https://example.com/1',
				pullRequest,
				ciStatus,
				density: 'default',
			});
			const checks = element.querySelector<HTMLElement>('.sessions-pr-hover-checks');
			return {
				text: checks?.textContent,
				status: checks?.dataset.status,
				icon: checks?.querySelector('.codicon')?.className,
				iconAriaHidden: checks?.querySelector('.codicon')?.getAttribute('aria-hidden'),
			};
		};

		assert.deepStrictEqual({
			pending: render(GitHubCIOverallStatus.Pending),
			success: render(GitHubCIOverallStatus.Success),
			failure: render(GitHubCIOverallStatus.Failure),
			neutral: render(GitHubCIOverallStatus.Neutral),
			draft: render(GitHubCIOverallStatus.Success, makePullRequest({ isDraft: true })),
			merged: render(GitHubCIOverallStatus.Success, makePullRequest({ state: GitHubPullRequestState.Merged })),
		}, {
			pending: { text: 'Checks pending', status: 'pending', icon: 'codicon codicon-circle-filled-compact', iconAriaHidden: 'true' },
			success: { text: 'Checks passed', status: 'success', icon: 'codicon codicon-pass-filled-compact', iconAriaHidden: 'true' },
			failure: { text: 'Checks failed', status: 'failure', icon: 'codicon codicon-error-compact', iconAriaHidden: 'true' },
			neutral: { text: undefined, status: undefined, icon: undefined, iconAriaHidden: undefined },
			draft: { text: 'Checks passed', status: 'success', icon: 'codicon codicon-pass-filled-compact', iconAriaHidden: 'true' },
			merged: { text: undefined, status: undefined, icon: undefined, iconAriaHidden: undefined },
		});
	});
});
