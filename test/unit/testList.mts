/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

/**
 * A test that `--testList` selects: the test with the title path, the tests of the suite with
 * the title path, or every test of the file. `file` is the test module, as mocha reports it
 * (`vs/base/test/common/strings.test` for `src/vs/base/test/common/strings.test.ts`).
 */
export interface IListedTest {
	readonly kind: 'test' | 'suite' | 'file';
	readonly file: string;
	readonly titlePath: readonly string[];
}

/**
 * The part of a mocha suite tree that selecting tests changes.
 */
interface ISuiteTree {
	tests: { readonly file?: string; titlePath(): string[] }[];
	readonly suites: readonly ISuiteTree[];
}

/**
 * Reads a test list: a JSON array of `{ "file", "kind", "titlePath" }`, such as the
 * `new-tests.json` that `ripple plan` writes (see build/ripple/README.md). `file` is a test file
 * such as `src/vs/base/test/common/strings.test.ts`. `kind` is `test` (the default with a title
 * path), `suite` or `file` (the default without one).
 */
export function readTestList(path: string): IListedTest[] {
	const list: unknown = JSON.parse(fs.readFileSync(path, 'utf8'));
	if (!Array.isArray(list)) {
		throw new Error(`${path} must contain a JSON array of tests`);
	}
	return list.map((entry: { file?: unknown; kind?: unknown; titlePath?: unknown } | null, index): IListedTest => {
		const file = entry?.file;
		const titlePath = entry?.titlePath ?? [];
		const kind = entry?.kind ?? (Array.isArray(titlePath) && titlePath.length > 0 ? 'test' : 'file');
		if (typeof file !== 'string' || !isTitlePath(titlePath) || !isKind(kind) || (kind !== 'file' && titlePath.length === 0)) {
			throw new Error(`${path}: entry ${index} is not a test, a suite or a file: ${JSON.stringify(entry)}`);
		}
		return { kind, file: file.trim().replace(/\\/g, '/').replace(/^src\//, '').replace(/\.[jt]s$/, ''), titlePath: kind === 'file' ? [] : titlePath };
	});
}

function isTitlePath(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(title => typeof title === 'string');
}

function isKind(value: unknown): value is IListedTest['kind'] {
	return value === 'test' || value === 'suite' || value === 'file';
}

/**
 * The compiled test files of the listed tests, relative to the output folder, as the runners
 * glob them (`vs/base/test/common/strings.test.js`).
 */
export function listedTestFiles(tests: readonly IListedTest[]): Set<string> {
	return new Set(tests.map(test => `${test.file}.js`));
}

/**
 * Whether the listed tests select the test of `file` with `titlePath`.
 */
export function isListed(tests: readonly IListedTest[], file: string, titlePath: readonly string[]): boolean {
	return tests.some(test => test.file === file
		&& (test.kind === 'file' || (test.kind === 'test' ? titlePath.length === test.titlePath.length : titlePath.length > test.titlePath.length))
		&& test.titlePath.every((title, index) => title === titlePath[index]));
}

/**
 * Removes the tests that the list does not select from a mocha suite tree, before it runs.
 * Mocha skips the hooks of suites without tests. Tests that belong to no test file, such as
 * the runner's own checks, stay.
 */
export function selectListedTests(suite: ISuiteTree, tests: readonly IListedTest[]): void {
	suite.tests = suite.tests.filter(test => !test.file || isListed(tests, test.file, test.titlePath()));
	for (const child of suite.suites) {
		selectListedTests(child, tests);
	}
}

/**
 * Describes a listed test on one line.
 */
export function describeListedTest(test: IListedTest): string {
	const titles = test.titlePath.join(' ').replace(/\s*[\n\r\u2028\u2029]+\s*/g, ' ');
	switch (test.kind) {
		case 'test': return `${titles} (${test.file})`;
		case 'suite': return `the tests of ${titles} (${test.file})`;
		default: return `the tests of ${test.file}`;
	}
}
