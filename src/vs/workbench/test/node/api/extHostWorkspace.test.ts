/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {ExtHostWorkspace} from 'vs/workbench/api/node/extHostWorkspace';
import {TestThreadService} from './testThreadService';

suite('ExtHostWorkspace', function () {

	test('asRelativePath', function () {

		const ws = new ExtHostWorkspace(new TestThreadService(), 'm:/Coding/Applications/NewsWoWBot');

		assert.equal(ws.getRelativePath('m:/Coding/Applications/NewsWoWBot/bernd/das/brot'), 'bernd/das/brot');
		assert.equal(ws.getRelativePath('m:/Apps/DartPubCache/hosted/pub.dartlang.org/convert-2.0.1/lib/src/hex.dart'),
			'm:/Apps/DartPubCache/hosted/pub.dartlang.org/convert-2.0.1/lib/src/hex.dart');

	});

	test('asRelativePath, same paths, #11402', function () {
		const root = '/home/aeschli/workspaces/samples/docker';
		const input = '/home/aeschli/workspaces/samples/docker';
		const ws = new ExtHostWorkspace(new TestThreadService(), root);

		assert.equal(ws.getRelativePath(input), input);

		const input2 = '/home/aeschli/workspaces/samples/docker/a.file';
		assert.equal(ws.getRelativePath(input2), 'a.file');

	});
});
