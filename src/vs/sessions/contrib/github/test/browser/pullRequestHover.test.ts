/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createPullRequestHover } from '../../browser/pullRequestHover.js';
import { GitHubPullRequestState, IGitHubPullRequest } from '../../common/types.js';

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
});
