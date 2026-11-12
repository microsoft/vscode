/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, expect, suite, test, vi, type Mock } from 'vitest';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { URI } from '../../../../util/vs/base/common/uri';
import { RepositoryRootLookup } from '../repositoryRootLookup';

suite('RepositoryRootLookup', () => {
	const repoRoot = URI.file('/workspace/repo');
	let findRoot: Mock<(folder: URI) => Promise<URI | undefined>>;
	let roots: RepositoryRootLookup;

	/** Answers like `git rev-parse --show-toplevel` for a workspace with one repository. */
	function rootOf(folder: URI): URI | undefined {
		return folder.path === repoRoot.path || folder.path.startsWith(repoRoot.path + '/') ? repoRoot : undefined;
	}

	/** Starts a lookup in every slot, so the next lookup has to wait. */
	function fillSlots(): Promise<(URI | undefined)[]> {
		return Promise.all(Array.from({ length: 5 }, (_, i) => roots.get(URI.file(`/busy/folder${i}`))));
	}

	/** Makes each lookup take a moment, and records the most that ran at once. */
	function trackRunning(answer: (folder: URI, call: number) => URI | undefined = rootOf): { most: number } {
		const running = { now: 0, most: 0 };
		findRoot.mockImplementation(async folder => {
			const call = findRoot.mock.calls.length;
			running.most = Math.max(running.most, ++running.now);
			await new Promise(resolve => setTimeout(resolve, 1));
			running.now--;
			return answer(folder, call);
		});
		return running;
	}

	beforeEach(() => {
		findRoot = vi.fn(async (folder: URI) => rootOf(folder));
		roots = new RepositoryRootLookup(folder => findRoot(folder));
	});

	test('shares a lookup that is waiting for a free slot between callers asking about the same folder', async () => {
		const folder = URI.file('/workspace/repo/src');

		const found = await Promise.all(Array.from({ length: 50 }, () => roots.get(folder)));

		// The first 5 callers each start a lookup, and the other 45 share the one that waits.
		expect({ calls: findRoot.mock.calls.length, found: new Set(found.map(String)) })
			.toEqual({ calls: 6, found: new Set([repoRoot.toString()]) });
	});

	test('starts a new lookup for a caller that asks after the last one started, noticing a new repository', async () => {
		const folder = URI.file('/workspace/late');
		const firstAnswer = new DeferredPromise<URI | undefined>();
		findRoot.mockReturnValueOnce(firstAnswer.p);
		const first = roots.get(folder);

		findRoot.mockResolvedValueOnce(folder);
		const second = roots.get(folder);
		firstAnswer.complete(undefined);

		expect({ first: await first, second: (await second)?.toString() }).toEqual({ first: undefined, second: folder.toString() });
	});

	test('starts a new lookup for a caller that asks after a waiting lookup started', async () => {
		const folder = URI.file('/workspace/late');
		const others = fillSlots();
		const firstAnswer = new DeferredPromise<URI | undefined>();
		findRoot.mockReturnValueOnce(firstAnswer.p);
		const first = roots.get(folder);
		await others;
		const started = findRoot.mock.calls.length;

		findRoot.mockResolvedValueOnce(folder);
		const second = roots.get(folder);
		firstAnswer.complete(undefined);

		expect({ started, first: await first, second: (await second)?.toString() })
			.toEqual({ started: 6, first: undefined, second: folder.toString() });
	});

	test('gives each caller that joined a failed lookup its own attempt, keeping to the limit', async () => {
		const running = trackRunning((folder, call) => {
			// The first 5 callers each start a lookup, and the other 45 share this one.
			if (call === 6) {
				throw new Error('spawn EAGAIN');
			}
			return rootOf(folder);
		});
		const folder = URI.file('/workspace/repo/src');

		const results = await Promise.allSettled(Array.from({ length: 50 }, () => roots.get(folder)));

		expect({ calls: findRoot.mock.calls.length, mostRunning: running.most, failed: results.filter(result => result.status === 'rejected').length })
			.toEqual({ calls: 50, mostRunning: 5, failed: 1 });
	});

	test('looks a folder up again after a lookup that waited for a free slot', async () => {
		const folder = URI.file('/workspace/late');
		const others = fillSlots();
		const waited = roots.get(folder);
		const startedWhileWaiting = findRoot.mock.calls.length;
		await others;
		const first = await waited;

		findRoot.mockResolvedValueOnce(folder);

		expect({ startedWhileWaiting, first, second: (await roots.get(folder))?.toString() })
			.toEqual({ startedWhileWaiting: 5, first: undefined, second: folder.toString() });
	});

	test('keeps folders apart', async () => {
		expect({
			inRepo: (await roots.get(URI.file('/workspace/repo/src')))?.toString(),
			outside: await roots.get(URI.file('/workspace/other')),
		}).toEqual({ inRepo: repoRoot.toString(), outside: undefined });
	});

	test('looks a folder up again after a "no repository" answer, noticing a new repository', async () => {
		const folder = URI.file('/workspace/late');
		const first = await roots.get(folder);

		findRoot.mockResolvedValueOnce(folder);

		expect({ first, second: (await roots.get(folder))?.toString() }).toEqual({ first: undefined, second: folder.toString() });
	});

	test('looks a folder up again after finding a root, noticing a nearer repository', async () => {
		const folder = URI.file('/workspace/repo/nested/src');
		const nearerRoot = URI.file('/workspace/repo/nested');
		const first = await roots.get(folder);

		findRoot.mockResolvedValueOnce(nearerRoot);

		expect({ first: first?.toString(), second: (await roots.get(folder))?.toString() })
			.toEqual({ first: repoRoot.toString(), second: nearerRoot.toString() });
	});

	test('looks a folder up again after a failed lookup', async () => {
		findRoot.mockRejectedValueOnce(new Error('spawn EAGAIN'));
		const folder = URI.file('/workspace/repo/src');
		await expect(roots.get(folder)).rejects.toThrow('spawn EAGAIN');

		expect((await roots.get(folder))?.toString()).toBe(repoRoot.toString());
	});

	test('limits how many lookups run at once', async () => {
		const running = trackRunning();

		await Promise.all(Array.from({ length: 50 }, (_, i) => roots.get(URI.file(`/big/folder${i}`))));

		expect({ calls: findRoot.mock.calls.length, mostRunning: running.most }).toEqual({ calls: 50, mostRunning: 5 });
	});
});
