/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { findBaseCommit, getBuildCommits } from '../../azure-pipelines/common/computeChangedSince.ts';

const context = { collectionUri: 'https://dev.azure.com/organization', projectId: 'project-id', buildId: '123', token: 'test-token' };

function tryFindBaseCommit(head: string, commits: readonly string[], firstParentHistory: readonly string[]): string {
	try {
		return findBaseCommit(head, commits, firstParentHistory);
	} catch (error) {
		return `error: ${(error as Error).message}`;
	}
}

suite('computeChangedSince', () => {

	test('finds the commit that the commits of a build start from', () => {
		assert.deepStrictEqual([
			// A single commit.
			tryFindBaseCommit('c', ['c'], ['c', 'b']),
			// Several commits, including the commits of a failed build.
			tryFindBaseCommit('d', ['d', 'c', 'b'], ['d', 'c', 'b', 'a']),
			// A merge commit `m` brings in the commits `x` and `y`, which are not in the first-parent history.
			tryFindBaseCommit('m', ['m', 'y', 'x', 'c'], ['m', 'c', 'b', 'a', 'z']),
			// The build does not include HEAD, for example when a manual build already built it.
			tryFindBaseCommit('c', [], ['c', 'b']),
			// The history is too shallow.
			tryFindBaseCommit('c', ['c', 'b'], ['c', 'b']),
		], [
			'b',
			'a',
			'b',
			'error: c is not one of the 0 commits of the build.',
			'error: The first-parent history of c does not reach a commit before the commits of the build.',
		]);
	});

	test('lists the commits of a build', async () => {
		const requests: string[] = [];
		const commits = await getBuildCommits(context, async (url, options) => {
			requests.push(`${url} ${JSON.stringify(options?.headers)}`);
			return Response.json({ count: 2, value: [{ id: 'c' }, { id: 'b' }] });
		});
		assert.deepStrictEqual({ requests, commits }, {
			requests: ['https://dev.azure.com/organization/project-id/_apis/build/builds/123/changes?$top=1000&api-version=7.1 {"Authorization":"Bearer test-token","Accept":"application/json"}'],
			commits: ['c', 'b'],
		});
	});

	test('rejects builds with too many commits and failed requests', async () => {
		const errors = await Promise.all([
			getBuildCommits(context, async () => Response.json({ count: 1000, value: [] }, { headers: { 'x-ms-continuationtoken': '1000' } })),
			getBuildCommits(context, async () => new Response('', { status: 401, statusText: 'Unauthorized' })),
		].map(promise => promise.then(() => 'resolved', (error: Error) => error.message)));
		assert.deepStrictEqual(errors, [
			'The build has more than 1000 commits.',
			'Cannot list the commits of the build: HTTP 401 Unauthorized',
		]);
	});
});
