/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestEnvironmentService, TestContextService } from 'vs/workbench/test/workbenchTestServices';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { URI } from 'vs/base/common/uri';
import { sep } from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';
import { LabelService } from 'vs/workbench/services/label/common/labelService';

suite('URI Label', () => {

	let labelService: LabelService;

	setup(() => {
		labelService = new LabelService(TestEnvironmentService, new TestContextService());
	});

	test('file scheme', function () {
		labelService.registerFormatter({
			scheme: 'file',
			formatting: {
				label: '${path}',
				separator: sep,
				tildify: !isWindows,
				normalizeDriveLetter: isWindows
			}
		});

		const uri1 = TestWorkspace.folders[0].uri.with({ path: TestWorkspace.folders[0].uri.path.concat('/a/b/c/d') });
		assert.equal(labelService.getUriLabel(uri1, { relative: true }), isWindows ? 'a\\b\\c\\d' : 'a/b/c/d');
		assert.equal(labelService.getUriLabel(uri1, { relative: false }), isWindows ? 'C:\\testWorkspace\\a\\b\\c\\d' : '/testWorkspace/a/b/c/d');

		const uri2 = URI.file('c:\\1/2/3');
		assert.equal(labelService.getUriLabel(uri2, { relative: false }), isWindows ? 'C:\\1\\2\\3' : '/c:\\1/2/3');
	});

	test('custom scheme', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			formatting: {
				label: 'LABEL/${path}/${authority}/END',
				separator: '/',
				tildify: true,
				normalizeDriveLetter: true
			}
		});

		const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
		assert.equal(labelService.getUriLabel(uri1, { relative: false }), 'LABEL//1/2/3/4/5/microsoft.com/END');
	});

	test('custom authority', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			authority: 'micro*',
			formatting: {
				label: 'LABEL/${path}/${authority}/END',
				separator: '/'
			}
		});

		const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
		assert.equal(labelService.getUriLabel(uri1, { relative: false }), 'LABEL//1/2/3/4/5/microsoft.com/END');
	});

	test('mulitple authority', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			authority: 'not_matching_but_long',
			formatting: {
				label: 'first',
				separator: '/'
			}
		});
		labelService.registerFormatter({
			scheme: 'vscode',
			authority: 'microsof*',
			formatting: {
				label: 'second',
				separator: '/'
			}
		});
		labelService.registerFormatter({
			scheme: 'vscode',
			authority: 'mi*',
			formatting: {
				label: 'third',
				separator: '/'
			}
		});

		// Make sure the most specific authority is picked
		const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
		assert.equal(labelService.getUriLabel(uri1, { relative: false }), 'second');
	});

	test('custom query', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			formatting: {
				label: 'LABEL${query.prefix}: ${query.path}/END',
				separator: '/',
				tildify: true,
				normalizeDriveLetter: true
			}
		});

		const uri1 = URI.parse(`vscode://microsoft.com/1/2/3/4/5?${encodeURIComponent(JSON.stringify({ prefix: 'prefix', path: 'path' }))}`);
		assert.equal(labelService.getUriLabel(uri1, { relative: false }), 'LABELprefix: path/END');
	});

	test('custom query without value', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			formatting: {
				label: 'LABEL${query.prefix}: ${query.path}/END',
				separator: '/',
				tildify: true,
				normalizeDriveLetter: true
			}
		});

		const uri1 = URI.parse(`vscode://microsoft.com/1/2/3/4/5?${encodeURIComponent(JSON.stringify({ path: 'path' }))}`);
		assert.equal(labelService.getUriLabel(uri1, { relative: false }), 'LABEL: path/END');
	});

	test('custom query without query json', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			formatting: {
				label: 'LABEL${query.prefix}: ${query.path}/END',
				separator: '/',
				tildify: true,
				normalizeDriveLetter: true
			}
		});

		const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5?path=foo');
		assert.equal(labelService.getUriLabel(uri1, { relative: false }), 'LABEL: /END');
	});

	test('custom query without query', function () {
		labelService.registerFormatter({
			scheme: 'vscode',
			formatting: {
				label: 'LABEL${query.prefix}: ${query.path}/END',
				separator: '/',
				tildify: true,
				normalizeDriveLetter: true
			}
		});

		const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
		assert.equal(labelService.getUriLabel(uri1, { relative: false }), 'LABEL: /END');
	});
});
