/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { FileAccess } from '../../../../../base/common/network.js';
import * as path from '../../../../../base/common/path.js';
import * as platform from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { QueryType } from '../../common/search.js';
import { fixDriveC, getAbsoluteGlob, spawnRipgrepCmd } from '../../node/ripgrepFileSearch.js';

suite('RipgrepFileSearch - etc', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('spawnRipgrepCmd starts no process when it is cancelled while ripgrep is resolving', async () => {
		const folderQuery = { folder: URI.file(path.normalize(FileAccess.asFileUri('vs/workbench/services/search/test/node/fixtures').fsPath)) };
		const tokenSource = new CancellationTokenSource();
		const spawned = spawnRipgrepCmd({ type: QueryType.File, folderQueries: [folderQuery], exists: true }, folderQuery, undefined, undefined, undefined, undefined, tokenSource.token);
		tokenSource.cancel();
		const result = await spawned;
		tokenSource.dispose();

		assert.strictEqual(result, undefined);
	});

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
});
