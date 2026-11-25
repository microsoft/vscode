/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Uri } from 'vscode';
import { Operation } from '../operation';
import { getWorkspaceTimelinePage, isTimelineRelevantOperation, isTimelineRelevantRepositoryChange, TimelineUpstreamTracker } from '../timelineProvider';

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

	test('timeline ignores the FETCH_HEAD writes of a fetch', () => {
		assert.deepStrictEqual(['FETCH_HEAD', 'HEAD', 'index', 'ORIG_HEAD', 'refs/heads/main'].map(name => isTimelineRelevantRepositoryChange(Uri.file(`/repo/.git/${name}`))), [false, true, true, true, true]);
	});

	test('timeline refreshes after a fetch only when it moves the upstream commit', () => {
		assert.deepStrictEqual([
			isTimelineRelevantOperation({ operation: Operation.Fetch(false), error: undefined }, 'a', 'a'),
			isTimelineRelevantOperation({ operation: Operation.Fetch(true), error: undefined }, undefined, undefined),
			isTimelineRelevantOperation({ operation: Operation.Fetch(false), error: undefined }, 'a', 'b'),
			isTimelineRelevantOperation({ operation: Operation.Fetch(false), error: undefined }, undefined, 'b'),
			isTimelineRelevantOperation({ operation: Operation.Commit, error: undefined }, 'a', 'a'),
			isTimelineRelevantOperation({ operation: Operation.Commit, error: new Error() }, 'a', 'a'),
			isTimelineRelevantOperation({ operation: Operation.Status, error: undefined }, 'a', 'a'),
			isTimelineRelevantOperation({ operation: Operation.Log(false), error: undefined }, 'a', 'a'),
		], [false, false, true, true, true, false, false, false]);
	});

	test('timeline refreshes after a fetch that moves or creates the upstream, also when a read-only operation reports the new upstream first', () => {
		const tracker = new TimelineUpstreamTracker();
		tracker.track('/repo', 'a');
		tracker.track('/other', undefined);

		assert.deepStrictEqual([
			// An auto-fetch that brings nothing
			tracker.onDidRunOperation('/repo', { operation: Operation.GetRefs, error: undefined }, 'a'),
			tracker.onDidRunOperation('/repo', { operation: Operation.Fetch(false), error: undefined }, 'a'),
			// A fetch that moves the upstream: GetRefs completes after HEAD was updated, before the fetch
			tracker.onDidRunOperation('/repo', { operation: Operation.GetRefs, error: undefined }, 'b'),
			tracker.onDidRunOperation('/repo', { operation: Operation.Fetch(false), error: undefined }, 'b'),
			// A status that finds the upstream moved by a fetch outside of VS Code, then one that finds nothing new
			tracker.onDidRunOperation('/repo', { operation: Operation.Status, error: undefined }, 'c'),
			tracker.onDidRunOperation('/repo', { operation: Operation.Status, error: undefined }, 'c'),
			// A fetch that creates the upstream of HEAD in another repository
			tracker.onDidRunOperation('/other', { operation: Operation.Fetch(true), error: undefined }, 'x'),
		], [false, false, false, true, true, false, true]);
	});
});
