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
});
