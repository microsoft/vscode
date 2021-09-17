/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestExplorerFilterState, TestFilterTerm } from 'vs/workbench/contrib/testing/common/testExplorerFilterState';


suite('TestExplorerFilterState', () => {
	let t: TestExplorerFilterState;
	setup(() => {
		t = new TestExplorerFilterState();
	});

	const assertFilteringFor = (expected: { [T in TestFilterTerm]?: boolean }) => {
		for (const [term, expectation] of Object.entries(expected)) {
			assert.strictEqual(t.isFilteringFor(term as TestFilterTerm), expectation, `expected filtering for ${term} === ${expectation}`);
		}
	};

	const termFiltersOff = {
		[TestFilterTerm.Failed]: false,
		[TestFilterTerm.Executed]: false,
		[TestFilterTerm.CurrentDoc]: false,
		[TestFilterTerm.Hidden]: false,
	};

	test('filters simple globs', () => {
		t.setText('hello, !world');
		assert.deepStrictEqual(t.globList, [{ text: 'hello', include: true }, { text: 'world', include: false }]);
		assert.deepStrictEqual(t.onlyTags, new Set());
		assertFilteringFor(termFiltersOff);
	});

	test('filters to patterns', () => {
		t.setText('@doc');
		assert.deepStrictEqual(t.globList, []);
		assert.deepStrictEqual(t.onlyTags, new Set());
		assertFilteringFor({
			...termFiltersOff,
			[TestFilterTerm.CurrentDoc]: true,
		});
	});

	test('filters to tags', () => {
		t.setText('@hello:world');
		assert.deepStrictEqual(t.globList, []);
		assert.deepStrictEqual(t.onlyTags, new Set(['hello\0world']));
		assertFilteringFor(termFiltersOff);
	});

	test('filters to mixed terms and tags', () => {
		t.setText('@hello:world foo, !bar @doc');
		assert.deepStrictEqual(t.globList, [{ text: 'foo', include: true }, { text: 'bar', include: false }]);
		assert.deepStrictEqual(t.onlyTags, new Set(['hello\0world']));
		assertFilteringFor({
			...termFiltersOff,
			[TestFilterTerm.CurrentDoc]: true,
		});
	});

	test('parses quotes', () => {
		t.setText('@hello:"world" @foo:\'bar\' baz');
		assert.deepStrictEqual(t.globList, [{ text: 'baz', include: true }]);
		assert.deepStrictEqual([...t.onlyTags], ['hello\0world', 'foo\0bar']);
	});

	test('parses quotes with escapes', () => {
		t.setText('@hello:"world\\"1" foo');
		assert.deepStrictEqual(t.globList, [{ text: 'foo', include: true }]);
		assert.deepStrictEqual([...t.onlyTags], ['hello\0world"1']);
	});
});
