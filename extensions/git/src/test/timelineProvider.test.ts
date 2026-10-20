/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { getWorkspaceTimelinePage } from '../timelineProvider';

suite('git timeline', () => {
	interface TestCommit {
		readonly hash: string;
		readonly timestamp: number;
	}

	/**
	 * Pages through the workspace timeline of the given repository histories, requesting each page like the provider
	 * does with `git log -n <limit + 1> --skip <skip>`.
	 */
	function getPages(histories: Record<string, TestCommit[]>, limit: number): string[][] {
		const pages: string[][] = [];
		let skipByRoot: Record<string, number> | undefined;
		do {
			const logs = Object.entries(histories)
				.filter(([root]) => skipByRoot === undefined || skipByRoot[root] !== undefined)
				.map(([root, commits]) => {
					const skip = skipByRoot?.[root] ?? 0;
					return { root, skip, commits: commits.slice(skip, skip + limit + 1) };
				});

			const { page, nextSkip } = getWorkspaceTimelinePage(logs, limit, commit => commit.timestamp);
			pages.push(page.map(({ commit }) => commit.hash));
			skipByRoot = nextSkip;
		} while (skipByRoot !== undefined && pages.length < 10);

		return pages;
	}

	test('workspace timeline pages through repositories newest first', () => {
		assert.deepStrictEqual(getPages({
			'/a': [{ hash: 'a3', timestamp: 6 }, { hash: 'a2', timestamp: 4 }, { hash: 'a1', timestamp: 1 }],
			'/b': [{ hash: 'b3', timestamp: 5 }, { hash: 'b2', timestamp: 3 }, { hash: 'b1', timestamp: 2 }],
		}, 2), [['a3', 'b3'], ['a2', 'b2'], ['b1', 'a1']]);
	});

	test('workspace timeline does not skip commits whose log order differs from their timestamps', () => {
		// e.g. author dates when commits were rebased
		assert.deepStrictEqual(getPages({
			'/a': [{ hash: 'A', timestamp: 100 }, { hash: 'B', timestamp: 1 }, { hash: 'C', timestamp: 90 }],
			'/b': [{ hash: 'D', timestamp: 95 }],
		}, 2), [['A', 'D'], ['B', 'C']]);
	});
});
