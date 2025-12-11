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

	test('source filter with source: prefix', () => {
		const filterOptions = new FilterOptions('source:ts', [], true, true, true, uriIdentityService);
		assert.strictEqual(filterOptions.sourceFilter, 'ts');
		assert.strictEqual(filterOptions.textFilter.text, '');
	});

	test('source filter with @ prefix', () => {
		const filterOptions = new FilterOptions('@eslint', [], true, true, true, uriIdentityService);
		assert.strictEqual(filterOptions.sourceFilter, 'eslint');
		assert.strictEqual(filterOptions.textFilter.text, '');
	});

	test('source filter with brackets', () => {
		const filterOptions = new FilterOptions('source:[ts]', [], true, true, true, uriIdentityService);
		assert.strictEqual(filterOptions.sourceFilter, '[ts]');
	});

	test('source filter combined with text filter', () => {
		const filterOptions = new FilterOptions('source:ts, error', [], true, true, true, uriIdentityService);
		assert.strictEqual(filterOptions.sourceFilter, 'ts');
		assert.strictEqual(filterOptions.textFilter.text, 'error');
	});

	test('source filter with @ combined with text filter', () => {
		const filterOptions = new FilterOptions('@eslint, warning', [], true, true, true, uriIdentityService);
		assert.strictEqual(filterOptions.sourceFilter, 'eslint');
		assert.strictEqual(filterOptions.textFilter.text, 'warning');
	});

	test('no source filter when not specified', () => {
		const filterOptions = new FilterOptions('some text', [], true, true, true, uriIdentityService);
		assert.strictEqual(filterOptions.sourceFilter, undefined);
		assert.strictEqual(filterOptions.textFilter.text, 'some text');
	});

	test('source filter case insensitive', () => {
		const filterOptions = new FilterOptions('SOURCE:TypeScript', [], true, true, true, uriIdentityService);
		assert.strictEqual(filterOptions.sourceFilter, 'TypeScript');
	});

	test('source filter with multiple commas', () => {
		const filterOptions = new FilterOptions('text1, source:ts, text2', [], true, true, true, uriIdentityService);
		assert.strictEqual(filterOptions.sourceFilter, 'ts');
		assert.strictEqual(filterOptions.textFilter.text, 'text1, text2');
	});

	test('extension filter with @ext: prefix', () => {
		const filterOptions = new FilterOptions('@ext:publisher.extensionName', [], true, true, true, uriIdentityService);
		assert.strictEqual(filterOptions.extensionFilter, 'publisher.extensionName');
		assert.strictEqual(filterOptions.sourceFilter, undefined);
		assert.strictEqual(filterOptions.textFilter.text, '');
	});

	test('extension filter combined with text filter', () => {
		const filterOptions = new FilterOptions('@ext:vscode.typescript, error', [], true, true, true, uriIdentityService);
		assert.strictEqual(filterOptions.extensionFilter, 'vscode.typescript');
		assert.strictEqual(filterOptions.textFilter.text, 'error');
	});

	test('extension filter combined with source filter', () => {
		const filterOptions = new FilterOptions('@ext:pub.ext, source:ts', [], true, true, true, uriIdentityService);
		assert.strictEqual(filterOptions.extensionFilter, 'pub.ext');
		assert.strictEqual(filterOptions.sourceFilter, 'ts');
		assert.strictEqual(filterOptions.textFilter.text, '');
	});

	test('extension filter case insensitive', () => {
		const filterOptions = new FilterOptions('@EXT:Publisher.Extension', [], true, true, true, uriIdentityService);
		assert.strictEqual(filterOptions.extensionFilter, 'Publisher.Extension');
	});

	test('no extension filter when not specified', () => {
		const filterOptions = new FilterOptions('some text', [], true, true, true, uriIdentityService);
		assert.strictEqual(filterOptions.extensionFilter, undefined);
	});
});
