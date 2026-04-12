/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import { tmpdir } from 'os';
import { getRandomTestPath } from './testUtils.js';
import { Promises } from '../../node/pfs.js';
import { SnapshotContext, assertSnapshot } from '../common/snapshot.js';
import { URI } from '../../common/uri.js';
import { join } from '../../common/path.js';
import { assertThrowsAsync, ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
// tests for snapshot are in Node so that we can use native FS operations to
// set up and validate things.
//
// Uses snapshots for testing snapshots. It's snapception!
suite('snapshot', () => {
    let testDir;
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(function () {
        testDir = getRandomTestPath(tmpdir(), 'vsctests', 'snapshot');
        return fs.promises.mkdir(testDir, { recursive: true });
    });
    teardown(function () {
        return Promises.rm(testDir);
    });
    const makeContext = (test) => {
        return new class extends SnapshotContext {
            constructor() {
                super(test);
                this.snapshotsDir = URI.file(testDir);
            }
        };
    };
    const snapshotFileTree = async () => {
        let str = '';
        const printDir = async (dir, indent) => {
            const children = await Promises.readdir(dir);
            for (const child of children) {
                const p = join(dir, child);
                if ((await fs.promises.stat(p)).isFile()) {
                    const content = await fs.promises.readFile(p, 'utf-8');
                    str += `${' '.repeat(indent)}${child}:\n`;
                    for (const line of content.split('\n')) {
                        str += `${' '.repeat(indent + 2)}${line}\n`;
                    }
                }
                else {
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
        const circular = {};
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25hcHNob3QudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9ub2RlL3NuYXBzaG90LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDekIsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLElBQUksQ0FBQztBQUM1QixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxnQkFBZ0IsQ0FBQztBQUNuRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDN0MsT0FBTyxFQUFFLGVBQWUsRUFBRSxjQUFjLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUN4RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0scUJBQXFCLENBQUM7QUFDMUMsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQzVDLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRWhHLDRFQUE0RTtBQUM1RSw4QkFBOEI7QUFDOUIsRUFBRTtBQUNGLDBEQUEwRDtBQUUxRCxLQUFLLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRTtJQUN0QixJQUFJLE9BQWUsQ0FBQztJQUVwQix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLEtBQUssQ0FBQztRQUNMLE9BQU8sR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsRUFBRSxVQUFVLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDOUQsT0FBTyxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUN4RCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQztRQUNSLE9BQU8sUUFBUSxDQUFDLEVBQUUs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