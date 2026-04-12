/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { FilterOptions } from '../../browser/markersFilterOptions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('MarkersFilterOptions', () => {
    let instantiationService;
    let uriIdentityService;
    setup(() => {
        instantiationService = new TestInstantiationService();
        const fileService = new FileService(new NullLogService());
        instantiationService.stub(IFileService, fileService);
        uriIdentityService = instantiationService.createInstance(UriIdentityService);
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    test('source filter', () => {
        const filterOptions = new FilterOptions('@source:ts', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['ts']);
        assert.deepStrictEqual(filterOptions.excludeSourceFilters, []);
        assert.strictEqual(filterOptions.textFilter.text, '');
    });
    test('source filter with negation', () => {
        const filterOptions = new FilterOptions('!@source:eslint', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.excludeSourceFilters, ['eslint']);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, []);
        assert.strictEqual(filterOptions.textFilter.text, '');
    });
    test('multiple source filters', () => {
        const filterOptions = new FilterOptions('@source:eslint @source:ts', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['eslint', 'ts']);
        assert.deepStrictEqual(filterOptions.excludeSourceFilters, []);
        assert.strictEqual(filterOptions.textFilter.text, '');
    });
    test('source filter combined with text filter', () => {
        const filterOptions = new FilterOptions('@source:ts error', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['ts']);
        assert.deepStrictEqual(filterOptions.excludeSourceFilters, []);
        assert.strictEqual(filterOptions.textFilter.text, 'error');
    });
    test('negated source filter combined with text filter', () => {
        const filterOptions = new FilterOptions('!@source:ts error', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.excludeSourceFilters, ['ts']);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, []);
        assert.strictEqual(filterOptions.textFilter.text, 'error');
    });
    test('no source filter when not specified', () => {
        const filterOptions = new FilterOptions('some text', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, []);
        assert.deepStrictEqual(filterOptions.excludeSourceFilters, []);
        assert.strictEqual(filterOptions.textFilter.text, 'some text');
    });
    test('source filter case insensitive', () => {
        const filterOptions = new FilterOptions('@SOURCE:TypeScript', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['typescript']);
        assert.deepStrictEqual(filterOptions.excludeSourceFilters, []);
    });
    test('complex filter with multiple source filters and text', () => {
        const filterOptions = new FilterOptions('text1 @source:eslint @source:ts text2', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['eslint', 'ts']);
        assert.deepStrictEqual(filterOptions.excludeSourceFilters, []);
        assert.strictEqual(filterOptions.textFilter.text, 'text1 text2');
    });
    test('source filter at the beginning', () => {
        const filterOptions = new FilterOptions('@source:eslint foo', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['eslint']);
        assert.strictEqual(filterOptions.textFilter.text, 'foo');
    });
    test('source filter at the end', () => {
        const filterOptions = new FilterOptions('foo @source:eslint', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['eslint']);
        assert.strictEqual(filterOptions.textFilter.text, 'foo');
    });
    test('source filter in the middle', () => {
        const filterOptions = new FilterOptions('foo @source:eslint bar', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['eslint']);
        assert.strictEqual(filterOptions.textFilter.text, 'foo bar');
    });
    test('source filter with leading spaces', () => {
        const filterOptions = new FilterOptions('  @source:eslint foo', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['eslint']);
        assert.strictEqual(filterOptions.textFilter.text, 'foo');
    });
    test('source filter with trailing spaces', () => {
        const filterOptions = new FilterOptions('foo @source:eslint  ', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['eslint']);
        assert.strictEqual(filterOptions.textFilter.text, 'foo');
    });
    test('multiple consecutive source filters', () => {
        const filterOptions = new FilterOptions('@source:eslint @source:ts foo', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['eslint', 'ts']);
        assert.strictEqual(filterOptions.textFilter.text, 'foo');
    });
    test('only source filter with no text', () => {
        const filterOptions = new FilterOptions('@source:eslint', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['eslint']);
        assert.strictEqual(filterOptions.textFilter.text, '');
    });
    test('multiple source filters with no text', () => {
        const filterOptions = new FilterOptions('@source:eslint @source:ts', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['eslint', 'ts']);
        assert.strictEqual(filterOptions.textFilter.text, '');
    });
    test('negated source filter at different positions', () => {
        const filterOptions = new FilterOptions('foo !@source:eslint bar', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.excludeSourceFilters, ['eslint']);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, []);
        assert.strictEqual(filterOptions.textFilter.text, 'foo bar');
    });
    test('mixed negated and positive source filters', () => {
        const filterOptions = new FilterOptions('@source:eslint !@source:ts foo', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['eslint']);
        assert.deepStrictEqual(filterOptions.excludeSourceFilters, ['ts']);
        assert.strictEqual(filterOptions.textFilter.text, 'foo');
    });
    test('single quoted source with spaces', () => {
        const filterOptions = new FilterOptions('@source:"hello world"', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['hello world']);
        assert.strictEqual(filterOptions.textFilter.text, '');
    });
    test('quoted source combined with text filter', () => {
        const filterOptions = new FilterOptions('@source:"hello world" foo', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['hello world']);
        assert.strictEqual(filterOptions.textFilter.text, 'foo');
    });
    test('mixed quoted and unquoted sources (OR logic)', () => {
        const filterOptions = new FilterOptions('@source:"hello world" @source:eslint @source:ts', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['hello world', 'eslint', 'ts']);
    });
    test('multiple quoted sources (OR logic)', () => {
        const filterOptions = new FilterOptions('@source:"hello world" @source:"foo bar"', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['hello world', 'foo bar']);
    });
    test('quoted source with negation', () => {
        const filterOptions = new FilterOptions('!@source:"hello world"', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.excludeSourceFilters, ['hello world']);
    });
    test('quoted source in the middle of filter', () => {
        const filterOptions = new FilterOptions('foo @source:"hello world" bar', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['hello world']);
        assert.strictEqual(filterOptions.textFilter.text, 'foo bar');
    });
    test('complex filter with quoted and unquoted mixed', () => {
        const filterOptions = new FilterOptions('@source:"TypeScript Compiler" @source:eslint !@source:"My Extension" text', [], true, true, true, uriIdentityService);
        assert.deepStrictEqual(filterOptions.includeSourceFilters, ['typescript compiler', 'eslint']);
        assert.deepStrictEqual(filterOptions.excludeSourceFilters, ['my extension']);
        assert.strictEqual(filterOptions.textFilter.text, 'text');
    });
    test('no filters - always matches', () => {
        const filterOptions = new FilterOptions('foo', [], true, true, true, uriIdentityService);
        assert.strictEqual(filterOptions.matchesSourceFilters('eslint'), true);
        assert.strictEqual(filterOptions.matchesSourceFilters(undefined), true);
    });
    test('positive filter - exact match only', () => {
        const filterOptions = new FilterOptions('@source:eslint', [], true, true, true, uriIdentityService);
        assert.strictEqual(filterOptions.matchesSourceFilters('eslint'), true);
        assert.strictEqual(filterOptions.matchesSourceFilters('ESLint'), true);
        assert.strictEqual(filterOptions.matchesSourceFilters('ts'), false);
        assert.strictEqual(filterOptions.matchesSourceFilters('eslint-plugin'), false);
        assert.strictEqual(filterOptions.matchesSourceFilters('es'), false);
    });
    test('positive filter - no source in marker', () => {
        const filterOptions = new FilterOptions('@source:eslint', [], true, true, true, uriIdentityService);
        assert.strictEqual(filterOptions.matchesSourceFilters(undefined), false);
    });
    test('negative filter - excludes exact source', () => {
        const filterOptions = new FilterOptions('!@source:eslint', [], true, true, true, uriIdentityService);
        assert.strictEqual(filterOptions.matchesSourceFilters('eslint'), false);
        assert.strictEqual(filterOptions.matchesSourceFilters('ts'), true);
        assert.strictEqual(filterOptions.matchesSourceFilters('eslint-plugin'), true);
    });
    test('negative filter - no source in marker', () => {
        const filterOptions = new FilterOptions('!@source:eslint', [], true, true, true, uriIdentityService);
        assert.strictEqual(filterOptions.matchesSourceFilters(undefined), true);
    });
    test('OR logic - multiple @source filters', () => {
        const filterOptions = new FilterOptions('@source:eslint @source:ts', [], true, true, true, uriIdentityService);
        assert.strictEqual(filterOptions.matchesSourceFilters('eslint'), true);
        assert.strictEqual(filterOptions.matchesSourceFilters('ts'), true);
        assert.strictEqual(filterOptions.matchesSourceFilters('python'), false);
    });
    test('OR logic with negation', () => {
        const filterOptions = new FilterOptions('@source:eslint @source:ts !@source:error', [], true, true, true, uriIdentityService);
        assert.strictEqual(filterOptions.matchesSourceFilters('eslint'), true);
        assert.strictEqual(filterOptions.matchesSourceFilters('ts'), true);
        assert.strictEqual(filterOptions.matchesSourceFilters('error'), false);
        assert.strictEqual(filterOptions.matchesSourceFilters('python'), false);
    });
    test('only negative filters - excludes specified sources', () => {
        const filterOptions = new FilterOptions('!@source:eslint !@source:ts', [], true, true, true, uriIdentityService);
        assert.strictEqual(filterOptions.matchesSourceFilters('eslint'), false);
        assert.strictEqual(filterOptions.matchesSourceFilters('ts'), false);
        assert.strictEqual(filterOptions.matchesSourceFilters('python'), true);
        assert.strictEqual(filterOptions.matchesSourceFilters(undefined), true);
    });
    test('case insensitivity', () => {
        const filterOptions = new FilterOptions('@source:ESLint', [], true, true, true, uriIdentityService);
        assert.strictEqual(filterOptions.matchesSourceFilters('eslint'), true);
        assert.strictEqual(filterOptions.matchesSourceFilters('ESLINT'), true);
        assert.strictEqual(filterOptions.matchesSourceFilters('EsLiNt'), true);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Vyc0ZpbHRlck9wdGlvbnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21hcmtlcnMvdGVzdC9icm93c2VyL21hcmtlcnNGaWx0ZXJPcHRpb25zLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN0RSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrRUFBK0UsQ0FBQztBQUV6SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQUN0RyxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDN0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxLQUFLLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO0lBRWxDLElBQUksb0JBQThDLENBQUM7SUFDbkQsSUFBSSxrQkFBdUMsQ0FBQztJQUU1QyxLQUFLLENBQUMsR0FBRyxFQUFFO1FBQ1Ysb0JBQW9CLEdBQUcsSUFBSSx3QkFBd0IsRUFBRSxDQUFDO1FBQ3RELE1BQU0sV0FBVyxHQUFHLElBQUksV0FBVyxDQUFDLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQztRQUMxRCxvQkFBb0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBQ3JELGtCQUFrQixHQUFHLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQzlFLENBQUMsQ0FB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