/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SchemaError } from '../../common/client/schema.js';
import { ActionsClient } from '../../common/core/actionsClient.js';
import { CoreClient } from '../../common/core/coreClient.js';
import { PullRequestsClient } from '../../common/core/pullRequestsClient.js';
import { ReviewsClient } from '../../common/core/reviewsClient.js';
import { SearchClient } from '../../common/core/searchClient.js';
import { parseActivationContext } from '../../common/missionControl/missionControlClient.js';
import { createTestPullRequestResponse, FixtureApiRequestProvider } from './githubClientTestUtils.js';

suite('GitHub API compatibility', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const enabledBy = { id: 2, node_id: 'U_2', login: 'reviewer', avatar_url: '', html_url: 'https://github.com/reviewer', type: 'User' };
	const repository = { owner: 'owner', repo: 'repo' };
	const date = '2026-10-02T00:00:00Z';
	const job = {
		id: 1, node_id: 'CR_1', run_id: 2, name: 'Build', head_sha: 'a'.repeat(40),
		status: 'queued', conclusion: null, html_url: null,
		check_run_url: 'https://api.github.com/repos/owner/repo/check-runs/1',
		started_at: date, completed_at: null, labels: ['ubuntu-latest'],
	};

	for (const merged of [false, true]) {
		for (const [title, message] of [[null, null], [null, 'Custom message'], ['Custom title', null], ['', '']]) {
			test(`preserves PR state with auto-merge text ${JSON.stringify([title, message])}, merged=${merged}`, async () => {
				const provider = new FixtureApiRequestProvider(createTestPullRequestResponse({
					merged,
					merged_at: merged ? '2026-10-02T00:00:00Z' : null,
					merge_commit_sha: merged ? 'c'.repeat(40) : null,
					auto_merge: { enabled_by: enabledBy, merge_method: 'squash', commit_title: title, commit_message: message },
				}));
				const client = new PullRequestsClient(new CoreClient(provider, provider));
				const result = await client.get({ owner: 'owner', repo: 'repo' }, 1, new AbortController().signal);
				assert.deepStrictEqual({
					state: result.state, merged: result.merged, draft: result.draft,
					title: result.auto_merge?.commit_title, message: result.auto_merge?.commit_message,
				}, { state: 'closed', merged, draft: false, title, message });
			});
		}
	}

	for (const field of ['commit_title', 'commit_message']) {
		test(`rejects a non-text, non-null auto-merge ${field}`, async () => {
			const provider = new FixtureApiRequestProvider(createTestPullRequestResponse({
				auto_merge: { enabled_by: enabledBy, merge_method: 'squash', commit_title: '', commit_message: '', [field]: 42 },
			}));
			const client = new PullRequestsClient(new CoreClient(provider, provider));
			await assert.rejects(client.get({ owner: 'owner', repo: 'repo' }, 1, new AbortController().signal), SchemaError);
		});
	}

	test('preserves auto-merge metadata when the enabling user is unavailable', async () => {
		const autoMerge = { enabled_by: null, merge_method: 'squash', commit_title: null, commit_message: null };
		const provider = new FixtureApiRequestProvider(createTestPullRequestResponse({ auto_merge: autoMerge }));
		const client = new PullRequestsClient(new CoreClient(provider, provider));
		assert.deepStrictEqual((await client.get(repository, 1, new AbortController().signal)).auto_merge, autoMerge);
	});

	test('accepts review comments whose diff side is unavailable', async () => {
		const comment = {
			id: 1, node_id: 'PRRC_1', pull_request_review_id: null, user: null, body: 'Review comment',
			path: 'file.ts', diff_hunk: '', commit_id: 'a'.repeat(40), original_commit_id: 'b'.repeat(40),
			side: null, start_side: null, line: 1, original_line: 1,
			html_url: 'https://github.com/owner/repo/pull/1#discussion_r1', created_at: date, updated_at: date,
		};
		const provider = new FixtureApiRequestProvider([comment]);
		const client = new ReviewsClient(new CoreClient(provider, provider));
		assert.deepStrictEqual(await client.listComments(repository, 1, new AbortController().signal), [comment]);
	});

	test('accepts a repository search result without an owner object', async () => {
		const item = {
			id: 1, node_id: 'R_1', name: 'repo', full_name: 'owner/repo', owner: null,
			private: false, html_url: 'https://github.com/owner/repo', url: 'https://api.github.com/repos/owner/repo',
			description: null, fork: false, default_branch: 'main', language: null, stargazers_count: 0, score: 1,
		};
		const response = { items: [item], total_count: 1, incomplete_results: false };
		const provider = new FixtureApiRequestProvider(response);
		const client = new SearchClient(new CoreClient(provider, provider));
		assert.deepStrictEqual(await client.repositories('repo', new AbortController().signal), response);
	});

	test('accepts jobs that have not started', async () => {
		const response = { ...job, started_at: null };
		const provider = new FixtureApiRequestProvider(response);
		const client = new ActionsClient(new CoreClient(provider, provider));
		assert.deepStrictEqual(await client.getJob(repository, 1, new AbortController().signal), response);
	});

	test('accepts jobs without associated runner labels', async () => {
		const { labels, ...response } = job;
		const provider = new FixtureApiRequestProvider(response);
		const client = new ActionsClient(new CoreClient(provider, provider));
		assert.deepStrictEqual(await client.getJob(repository, 1, new AbortController().signal), response);
	});

	test('accepts every backend check-step lifecycle status', async () => {
		const response = {
			...job,
			steps: ['requested', 'queued', 'in_progress', 'completed', 'waiting', 'pending'].map((status, index) => ({
				name: 'Build', number: index + 1, status, conclusion: null, started_at: null, completed_at: null,
			})),
		};
		const provider = new FixtureApiRequestProvider(response);
		const client = new ActionsClient(new CoreClient(provider, provider));
		assert.deepStrictEqual(await client.getJob(repository, 1, new AbortController().signal), response);
	});

	for (const invalid of [{ started_at: 42 }, { labels: null }, { labels: [42] }, { status: 'unknown' }]) {
		test(`still rejects malformed job metadata ${JSON.stringify(invalid)}`, async () => {
			const provider = new FixtureApiRequestProvider({ ...job, ...invalid });
			const client = new ActionsClient(new CoreClient(provider, provider));
			await assert.rejects(client.getJob(repository, 1, new AbortController().signal), SchemaError);
		});
	}

	test('preserves canonical activation sequences across the uint64 range', () => {
		for (const sequence of ['1', '9007199254740993', '18446744073709551615']) {
			const context = { version: 2, sequence, traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' };
			assert.deepStrictEqual(parseActivationContext(context), context);
		}
	});

	test('rejects noncanonical or overflowing activation sequences', () => {
		for (const sequence of ['0', '01', '18446744073709551616', '-1', '1.0', 1]) {
			assert.throws(() => parseActivationContext({
				version: 2, sequence, traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
			}), SchemaError);
		}
	});
});
