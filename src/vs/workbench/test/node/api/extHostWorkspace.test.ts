/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { isWindows } from 'vs/base/common/platform';
import * as assert from 'assert';
import { ExtHostWorkspace } from 'vs/workbench/api/node/extHostWorkspace';
import { TestThreadService } from './testThreadService';

suite('ExtHostWorkspace', function () {

	function fsPath(path: string): string {
		if (isWindows) {
			return path.replace(/\//g, '\\');
		} else {
			return path;
		}
	}

	test('asRelativePath', function () {

		const ws = new ExtHostWorkspace(new TestThreadService(), '/Coding/Applications/NewsWoWBot');

		assert.equal(ws.getRelativePath('/Coding/Applications/NewsWoWBot/bernd/das/brot'), fsPath('bernd/das/brot'));
		assert.equal(ws.getRelativePath('/Apps/DartPubCache/hosted/pub.dartlang.org/convert-2.0.1/lib/src/hex.dart'),
			fsPath('/Apps/DartPubCache/hosted/pub.dartlang.org/convert-2.0.1/lib/src/hex.dart'));

		assert.equal(ws.getRelativePath(''), '');
		assert.equal(ws.getRelativePath('/foo/bar'), fsPath('/foo/bar'));
	});

	test('asRelativePath, same paths, #11402', function () {
		const root = '/home/aeschli/workspaces/samples/docker';
		const input = '/home/aeschli/workspaces/samples/docker';
		const ws = new ExtHostWorkspace(new TestThreadService(), root);

		assert.equal(ws.getRelativePath(input), fsPath(input));

		const input2 = '/home/aeschli/workspaces/samples/docker/a.file';
		assert.equal(ws.getRelativePath(input2), 'a.file');

	});
});
