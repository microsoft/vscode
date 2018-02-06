/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ClipboardService } from 'vs/platform/clipboard/electron-browser/clipboardService';
import URI from 'vs/base/common/uri';

suite('ClipboardService', () => {
	test('writeFiles, hasFiles, readFiles', function () {
		const clipboardService = new ClipboardService();

		clipboardService.writeText('test');
		assert.ok(!clipboardService.hasFiles());

		const files: URI[] = [];
		files.push(URI.file('/test/file.txt'));
		files.push(URI.file('/test/otherfile.txt'));

		clipboardService.writeFiles(files);

		assert.ok(clipboardService.hasFiles());

		const clipboardFiles = clipboardService.readFiles();
		assert.equal(clipboardFiles.length, 2);
		assert.equal(clipboardFiles[0].fsPath, files[0].fsPath);
		assert.equal(clipboardFiles[1].fsPath, files[1].fsPath);

		clipboardService.writeText('test');
		assert.ok(!clipboardService.hasFiles());
	});
});