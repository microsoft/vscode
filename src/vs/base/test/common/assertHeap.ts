/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare const __analyzeSnapshotInTests: (currentTest: string, classes: readonly string[]) => Promise<({ done: Promise<number[]>; file: string })>;

let currentTest: Mocha.Test | undefined;

const snapshotsToAssert: ({ counts: Promise<number[]>; file: string; test: string; opts: ISnapshotAssertOptions })[] = [];

setup(function () {
	currentTest = this.currentTest;
});

suiteTeardown(async () => {
	await Promise.all(snapshotsToAssert.map(async snap => {
		const counts = await snap.counts;

		const asserts = Object.entries(snap.opts.classes);
		if (asserts.length !== counts.length) {
			throw new Error(`expected class counts to equal assertions length for ${snap.test}`);
		}

		for (const [i, [name, doAssert]] of asserts.entries()) {
			try {
				doAssert(counts[i]);
			} catch (e) {
				throw new Error(`Unexpected number of ${name} instances (${counts[i]}) after "${snap.test}":\n\n${e.message}\n\nSnapshot saved at: ${snap.file}`);
			}
		}
	}));

	snapshotsToAssert.length = 0;
});

export interface ISnapshotAssertOptions {
	classes: Record<string, (count: number) => void>;
}

const snapshotMinTime = 20_000;

/**
 * Takes a heap snapshot, and asserts the state of classes in memory. This
 * works in Node and the Electron sandbox, but is a no-op in the browser.
 * Snapshots are process asynchronously and will report failures at the end of
 * the suite.
 *
 * This method should be used sparingly (e.g. once at the end of a suite to
 * ensure nothing leaked before), as gathering a heap snapshot is fairly
 * slow, at least until V8 11.5.130 (https://v8.dev/blog/speeding-up-v8-heap-snapshots).
 *
 * Takes options containing a mapping of class names, and assertion functions
 * to run on the number of retained instances of that class. For example:
 *
 * ```ts
 * assertSnapshot({
 *	classes: {
 *		ShouldNeverLeak: count => assert.strictEqual(count, 0),
 *		SomeSingleton: count => assert(count <= 1),
 *	}
 *});
 * ```
 */
export async function assertHeap(opts: ISnapshotAssertOptions) {
	if (!currentTest) {
		throw new Error('assertSnapshot can only be used when a test is running');
	}

	// snapshotting can take a moment, ensure the test timeout is decently long
	// so it doesn't immediately fail.
	if (currentTest.timeout() < snapshotMinTime) {
		currentTest.timeout(snapshotMinTime);
	}

	if (typeof __analyzeSnapshotInTests === 'undefined') {
		return; // running in browser, no-op
	}

	const { done, file } = await __analyzeSnapshotInTests(currentTest.fullTitle(), Object.keys(opts.classes));
	snapshotsToAssert.push({ counts: done, file, test: currentTest.fullTitle(), opts });
}

