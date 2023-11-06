/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from 'os';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { Promises } from 'vs/base/node/pfs';
import { SnapshotContext, assertSnapshot } from 'vs/base/test/common/snapshot';
import { URI } from 'vs/base/common/uri';
import * as path from 'path';
import { assertThrowsAsync } from 'vs/base/test/common/utils';

// tests for snapshot are in Node so that we can use native FS operations to
// set up and validate things.
//
// Uses snapshots for testing snapshots. It's snapception!

suite('snapshot', () => {
	let testDir: string;

	setup(function () {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'snapshot');
		return Promises.mkdir(testDir, { recursive: true });
	});

	teardown(function () {
		return Promises.rm(testDir);
	});

	const makeContext = (test: Partial<Mocha.Test> | undefined) => {
		return new class extends SnapshotContext {
			constructor() {
				super(test as Mocha.Test);
				this.snapshotsDir = URI.file(testDir);
			}
		};
	};

	const snapshotFileTree = async () => {
		let str = '';

		const printDir = async (dir: string, indent: number) => {
			const children = await Promises.readdir(dir);
			for (const child of children) {
				const p = path.join(dir, child);
				if ((await Promises.stat(p)).isFile()) {
					const content = await Promises.readFile(p, 'utf-8');
					str += `${' '.repeat(indent)}${child}:\n`;
					for (const line of content.split('\n')) {
						str += `${' '.repeat(indent + 2)}${line}\n`;
					}
				} else {
					str += `${' '.repeat(indent)}${child}/\n`;
					await printDir(p, indent + 2);
				}
			}
		};

		await printDir(testDir, 0);
		await assertSnapshot(str);
	};

	test('creates a snapshot', async () => {
		const ctx = makeContext({
			file: 'foo/bar',
			fullTitle: () => 'hello world!'
		});

		await ctx.assert({ cool: true });
		await snapshotFileTree();
	});

	test('validates a snapshot', async () => {
		const ctx1 = makeContext({
			file: 'foo/bar',
			fullTitle: () => 'hello world!'
		});

		await ctx1.assert({ cool: true });

		const ctx2 = makeContext({
			file: 'foo/bar',
			fullTitle: () => 'hello world!'
		});

		// should pass:
		await ctx2.assert({ cool: true });

		const ctx3 = makeContext({
			file: 'foo/bar',
			fullTitle: () => 'hello world!'
		});

		// should fail:
		await assertThrowsAsync(() => ctx3.assert({ cool: false }));
	});

	test('cleans up old snapshots', async () => {
		const ctx1 = makeContext({
			file: 'foo/bar',
			fullTitle: () => 'hello world!'
		});

		await ctx1.assert({ cool: true });
		await ctx1.assert({ nifty: true });
		await ctx1.assert({ customName: 1 }, { name: 'thirdTest', extension: 'txt' });
		await ctx1.assert({ customName: 2 }, { name: 'fourthTest' });

		await snapshotFileTree();

		const ctx2 = makeContext({
			file: 'foo/bar',
			fullTitle: () => 'hello world!'
		});

		await ctx2.assert({ cool: true });
		await ctx2.assert({ customName: 1 }, { name: 'thirdTest' });
		await ctx2.removeOldSnapshots();

		await snapshotFileTree();
	});

	test('formats object nicely', async () => {
		const circular: any = {};
		circular.a = circular;

		await assertSnapshot([
			1,
			true,
			undefined,
			null,
			123n,
			Symbol('heyo'),
			'hello',
			{ hello: 'world' },
			circular,
			new Map([['hello', 1], ['goodbye', 2]]),
			new Set([1, 2, 3]),
			function helloWorld() { },
			/hello/g,
			new Array(10).fill('long string'.repeat(10)),
			{ [Symbol.for('debug.description')]() { return `Range [1 -> 5]`; } },
		]);
	});
});
