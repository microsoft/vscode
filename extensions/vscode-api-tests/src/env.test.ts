/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { env } from 'vscode';

suite('env-namespace', () => {

	test('env is set', function () {
		assert.equal(typeof env.language, 'string');
		assert.equal(typeof env.appRoot, 'string');
		assert.equal(typeof env.appName, 'string');
		assert.equal(typeof env.machineId, 'string');
		assert.equal(typeof env.sessionId, 'string');
	});

	test('env is readonly', function () {
		assert.throws(() => env.language = '234');
		assert.throws(() => env.appRoot = '234');
		assert.throws(() => env.appName = '234');
		assert.throws(() => env.machineId = '234');
		assert.throws(() => env.sessionId = '234');
	});

});
