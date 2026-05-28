/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FilterOptions } from '../../browser/markersFilterOptions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('MarkersFilterOptions', () => {

	let instantiationService: TestInstantiationService;
	let uriIdentityService: IUriIdentityService;

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
