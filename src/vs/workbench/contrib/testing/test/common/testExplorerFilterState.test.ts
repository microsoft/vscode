/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestExplorerFilterState, TestFilterTerm } from '../../common/testExplorerFilterState.js';

suite('TestExplorerFilterState', () => {
	let t: TestExplorerFilterState;
	let ds: DisposableStore;

	teardown(() => {
		ds.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		ds = new DisposableStore();
		t = ds.add(new TestExplorerFilterState(ds.add(new InMemoryStorageService())));
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
		assert.deepStrictEqual(t.includeTags, new Set());
		assert.deepStrictEqual(t.excludeTags, new Set());
		assertFilteringFor(termFiltersOff);
	});

	test('filters to patterns', () => {
		t.setText('@doc');
		assert.deepStrictEqual(t.globList, []);
		assert.deepStrictEqual(t.includeTags, new Set());
		assert.deepStrictEqual(t.excludeTags, new Set());
		assertFilteringFor({
			...termFiltersOff,
			[TestFilterTerm.CurrentDoc]: true,
		});
	});

	test('filters to tags', () => {
		t.setText('@hello:world !@foo:bar');
		assert.deepStrictEqual(t.globList, []);
		assert.deepStrictEqual(t.includeTags, new Set(['hello\0world']));
		assert.deepStrictEqual(t.excludeTags, new Set(['foo\0bar']));
		assertFilteringFor(termFiltersOff);
	});

	test('filters to mixed terms and tags', () => {
		t.setText('@hello:world foo, !bar @doc !@foo:bar');
		assert.deepStrictEqual(t.globList, [{ text: 'foo', include: true }, { text: 'bar', include: false }]);
		assert.deepStrictEqual(t.includeTags, new Set(['hello\0world']));
		assert.deepStrictEqual(t.excludeTags, new Set(['foo\0bar']));
		assertFilteringFor({
			...termFiltersOff,
			[TestFilterTerm.CurrentDoc]: true,
		});
	});

	test('parses quotes', () => {
		t.setText('@hello:"world" @foo:\'bar\' baz');
		assert.deepStrictEqual(t.globList, [{ text: 'baz', include: true }]);
		assert.deepStrictEqual([...t.includeTags], ['hello\0world', 'foo\0bar']);
		assert.deepStrictEqual(t.excludeTags, new Set());
	});

	test('parses quotes with escapes', () => {
		t.setText('@hello:"world\\"1" foo');
		assert.deepStrictEqual(t.globList, [{ text: 'foo', include: true }]);
		assert.deepStrictEqual([...t.includeTags], ['hello\0world"1']);
		assert.deepStrictEqual(t.excludeTags, new Set());
	});
});
