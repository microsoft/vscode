/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Lazy } from '../../common/lazy.js';
import { FileAccess } from '../../common/network.js';
import { URI } from '../../common/uri.js';
// setup on import so assertSnapshot has the current context without explicit passing
let context;
const sanitizeName = (name) => name.replace(/[^a-z0-9_-]/gi, '_');
const normalizeCrlf = (str) => str.replace(/\r\n/g, '\n');
/**
 * This is exported only for tests against the snapshotting itself! Use
 * {@link assertSnapshot} as a consumer!
 */
export class SnapshotContext {
    constructor(test) {
        this.test = test;
        this.nextIndex = 0;
        this.usedNames = new Set();
        if (!test) {
            throw new Error('assertSnapshot can only be used in a test');
        }
        if (!test.file) {
            throw new Error('currentTest.file is not set, please open an issue with the test you\'re trying to run');
        }
        const src = URI.joinPath(FileAccess.asFileUri(''), '../src');
        const parts = test.file.split(/[/\\]/g);
        this.namePrefix = sanitizeName(test.fullTitle()) + '.';
        this.snapshotsDir = URI.joinPath(src, ...[...parts.slice(0, -1), '__snapshots__']);
    }
    async assert(value, options) {
        const originalStack = new Error().stack; // save to make the stack nicer on failure
        const nameOrIndex = (options?.name ? sanitizeName(options.name) : this.nextIndex++);
        const fileName = this.namePrefix + nameOrIndex + '.' + (options?.extension || 'snap');
        this.usedNames.add(fileName);
        const fpath = URI.joinPath(this.snapshotsDir, fileName).fsPath;
        const actual = formatValue(value);
        let expected;
        try {
            expected = await __readFileInTests(fpath);
        }
        catch {
            console.info(`Creating new snapshot in: ${fpath}`);
            await __mkdirPInTests(this.snapshotsDir.fsPath);
            await __writeFileInTests(fpath, actual);
            return;
        }
        if (normalizeCrlf(expected) !== normalizeCrlf(actual)) {
            await __writeFileInTests(fpath + '.actual', actual);
            const err = new Error(`Snapshot #${nameOrIndex} does not match expected output`);
            err.expected = expected;
            err.actual = actual;
            err.snapshotPath = fpath;
            err.stack = err.stack
                .split('\n')
                // remove all frames from the async stack and keep the original caller's frame
                .slice(0, 1)
                .concat(originalStack.split('\n').slice(3))
                .join('\n');
            throw err;
        }
    }
    async removeOldSnapshots() {
        const contents = await __readDirInTests(this.snapshotsDir.fsPath);
        const toDelete = contents.filter(f => f.startsWith(this.namePrefix) && !this.usedNames.has(f));
        if (toDelete.length) {
            console.info(`Deleting ${toDelete.length} old snapshots for ${this.test?.fullTitle()}`);
        }
        await Promise.all(toDelete.map(f => __unlinkInTests(URI.joinPath(this.snapshotsDir, f).fsPath)));
    }
}
const debugDescriptionSymbol = Symbol.for('debug.description');
function formatValue(value, level = 0, seen = []) {
    switch (typeof value) {
        case 'bigint':
        case 'boolean':
        case 'number':
        case 'symbol':
        case 'undefined':
            return String(value);
        case 'string':
            return level === 0 ? value : JSON.stringify(value);
        case 'function':
            return `[Function ${value.name}]`;
        case 'object': {
            if (value === null) {
                return 'null';
            }
            if (value instanceof RegExp) {
                return String(value);
            }
            if (seen.includes(value)) {
                return '[Circular]';
            }
            // eslint-disable-next-line local/code-no-any-casts
            if (debugDescriptionSymbol in value && typeof value[debugDescriptionSymbol] === 'function') {
                // eslint-disable-next-line local/code-no-any-casts
                return value[debugDescriptionSymbol]();
            }
            const oi = '  '.repeat(level);
            const ci = '  '.repeat(level + 1);
            if (Array.isArray(value)) {
                const children = value.map(v => formatValue(v, level + 1, [...seen, value]));
                const multiline = children.some(c => c.includes('\n')) || children.join(', ').length > 80;
                return multiline ? `[\n${ci}${children.join(`,\n${ci}`)}\n${oi}]` : `[ ${children.join(', ')} ]`;
            }
            let entries;
            let prefix = '';
            if (value instanceof Map) {
                prefix = 'Map ';
                entries = [...value.entries()];
            }
            else if (value instanceof Set) {
                prefix = 'Set ';
                entries = [...value.entries()];
            }
            else {
                entries = Object.entries(value);
            }
            const lines = entries.map(([k, v]) => `${k}: ${formatValue(v, level + 1, [...seen, value])}`);
            return prefix + (lines.length > 1
                ? `{\n${ci}${lines.join(`,\n${ci}`)}\n${oi}}`
                : `{ ${lines.join(',\n')} }`);
        }
        default:
            throw new Error(`Unknown type ${value}`);
    }
}
setup(function () {
    const currentTest = this.currentTest;
    context = new Lazy(() => new SnapshotContext(currentTest));
});
teardown(async function () {
    if (this.currentTest?.state === 'passed') {
        await context?.rawValue?.removeOldSnapshots();
    }
    context = undefined;
});
/**
 * Implements a snapshot testing utility. ⚠️ This is async! ⚠️
 *
 * The first time a snapshot test is run, it'll record the value it's called
 * with as the expected value. Subsequent runs will fail if the value differs,
 * but the snapshot can be regenerated by hand or using the Selfhost Test
 * Provider Extension which'll offer to update it.
 *
 * The snapshot will be associated with the currently running test and stored
 * in a `__snapshots__` directory next to the test file, which is expected to
 * be the first `.test.js` file in the callstack.
 */
export function assertSnapshot(value, options) {
    if (!context) {
        throw new Error('assertSnapshot can only be used in a test');
    }
    return context.value.assert(value, options);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25hcHNob3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3QvY29tbW9uL3NuYXBzaG90LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUM1QyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDckQsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBUTFDLHFGQUFxRjtBQUNyRixJQUFJLE9BQTBDLENBQUM7QUFDL0MsTUFBTSxZQUFZLEdBQUcsQ0FBQyxJQUFZLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQzFFLE1BQU0sYUFBYSxHQUFHLENBQUMsR0FBVyxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztBQVNsRTs7O0dBR0c7QUFDSCxNQUFNLE9BQU8sZUFBZTtJQU0zQixZQUE2QixJQUE0QjtRQUE1QixTQUFJLEdBQUosSUFBSSxDQUF3QjtRQUxqRCxjQUFTLEdBQUcsQ0FBQyxDQUFDO1FBR0wsY0FBUyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFHdEMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ1gsTUFBTSxJQUFJLEtBQUssQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDO1FBQzlELENBQUM7UUFFRCxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2hCLE1BQU0sSUFBSSxLQUFLLENBQUMsdUZBQXVGLENBQUMsQ0FBQztRQUMxRyxDQUFDO1FBRUQsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEVBQUUs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