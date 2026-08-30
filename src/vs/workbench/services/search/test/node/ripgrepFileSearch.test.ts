/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as platform from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileQuery, IFolderQuery, QueryType } from '../../common/search.js';
import { fixDriveC, getAbsoluteGlob, getRgArgs } from '../../node/ripgrepFileSearch.js';

suite('RipgrepFileSearch - etc', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	function testGetAbsGlob(params: string[]): void {
		const [folder, glob, expectedResult] = params;
		assert.strictEqual(fixDriveC(getAbsoluteGlob(folder, glob)), expectedResult, JSON.stringify(params));
	}

	(!platform.isWindows ? test.skip : test)('getAbsoluteGlob_win', () => {
		[
			['C:/foo/bar', 'glob/**', '/foo\\bar\\glob\\**'],
			['c:/', 'glob/**', '/glob\\**'],
			['C:\\foo\\bar', 'glob\\**', '/foo\\bar\\glob\\**'],
			['c:\\foo\\bar', 'glob\\**', '/foo\\bar\\glob\\**'],
			['c:\\', 'glob\\**', '/glob\\**'],
			['\\\\localhost\\c$\\foo\\bar', 'glob/**', '\\\\localhost\\c$\\foo\\bar\\glob\\**'],

			// absolute paths are not resolved further
			['c:/foo/bar', '/path/something', '/path/something'],
			['c:/foo/bar', 'c:\\project\\folder', '/project\\folder']
		].forEach(testGetAbsGlob);
	});

	(platform.isWindows ? test.skip : test)('getAbsoluteGlob_posix', () => {
		[
			['/foo/bar', 'glob/**', '/foo/bar/glob/**'],
			['/', 'glob/**', '/glob/**'],

			// absolute paths are not resolved further
			['/', '/project/folder', '/project/folder'],
		].forEach(testGetAbsGlob);
	});

	test('additional ignore files', () => {
		const folderQuery: IFolderQuery = {
			folder: URI.file('/some/folder'),
			disregardIgnoreFiles: false,
			disregardParentIgnoreFiles: false
		};
		const config: IFileQuery = {
			type: QueryType.File,
			folderQueries: [folderQuery],
			ignoreFileNames: ['.customignore', '.ignore']
		};
		const args = getRgArgs(config, folderQuery, undefined, undefined, undefined, ['/some/folder/.customignore']);
		const ignoreFileArg = args.indexOf('--no-ignore-vcs');

		assert.deepStrictEqual(args.slice(ignoreFileArg, ignoreFileArg + 3), ['--no-ignore-vcs', '--ignore-file', '/some/folder/.customignore']);
	});
});
