/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestExplorerFilterState } from '../../common/testExplorerFilterState.js';
suite('TestExplorerFilterState', () => {
    let t;
    let ds;
    teardown(() => {
        ds.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
        ds = new DisposableStore();
        t = ds.add(new TestExplorerFilterState(ds.add(new InMemoryStorageService())));
    });
    const assertFilteringFor = (expected) => {
        for (const [term, expectation] of Object.entries(expected)) {
            assert.strictEqual(t.isFilteringFor(term), expectation, `expected filtering for ${term} === ${expectation}`);
        }
    };
    const termFiltersOff = {
        ["@failed" /* TestFilterTerm.Failed */]: false,
        ["@executed" /* TestFilterTerm.Executed */]: false,
        ["@doc" /* TestFilterTerm.CurrentDoc */]: false,
        ["@hidden" /* TestFilterTerm.Hidden */]: false,
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
            ["@doc" /* TestFilterTerm.CurrentDoc */]: true,
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
            ["@doc" /* TestFilterTerm.CurrentDoc */]: true,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvdGVzdC9jb21tb24vdGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSx1QkFBdUIsRUFBa0IsTUFBTSx5Q0FBeUMsQ0FBQztBQUVsRyxLQUFLLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO0lBQ3JDLElBQUksQ0FBMEIsQ0FBQztJQUMvQixJQUFJLEVBQW1CLENBQUM7SUFFeEIsUUFBUSxDQUFDLEdBQUcsRUFBRTtRQUNiLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNkLENBQUMsQ0FBQyxDQUFDO0lBRUgsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1YsRUFBRSxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFDM0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSx1QkFBdUIsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksc0JBQXNCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMvRSxDQUFDLENBQUMsQ0FBQztJQUVILE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxRQUE2QyxFQUFFLEVBQUU7UUFDNUUsS0FBSyxNQUFNLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxJ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