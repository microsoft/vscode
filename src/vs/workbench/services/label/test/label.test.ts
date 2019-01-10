/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TestEnvironmentService, TestContextService, TestWindowService } from 'vs/workbench/test/workbenchTestServices';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { URI } from 'vs/base/common/uri';
import { nativeSep } from 'vs/base/common/paths';
import { isWindows } from 'vs/base/common/platform';
import { LabelService } from 'vs/workbench/services/label/common/labelService';

suite('URI Label', () => {

	let labelService: LabelService;

	setup(() => {
		labelService = new LabelService(TestEnvironmentService, new TestContextService(), new TestWindowService());
	});

	test('file scheme', function () {
		labelService.registerFormatter('file://', {
			uri: {
				label: '${path}',
				separator: nativeSep,
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
		labelService.registerFormatter('vscode://', {
			uri: {
				label: 'LABEL/${path}/${authority}/END',
				separator: '/',
				tildify: true,
				normalizeDriveLetter: true
			}
		});

		const uri1 = URI.parse('vscode://microsoft.com/1/2/3/4/5');
		assert.equal(labelService.getUriLabel(uri1, { relative: false }), 'LABEL//1/2/3/4/5/microsoft.com/END');
	});
});
