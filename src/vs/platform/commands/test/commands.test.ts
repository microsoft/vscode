/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {CommandsRegistry} from 'vs/platform/commands/common/commands';


suite('Command Tests', function () {

	test('register command - no handler', function () {
		assert.throws(() => CommandsRegistry.registerCommand('foo', null));
	});

	// test('register command - dupe', function () {
	// 	CommandsRegistry.registerCommand('foo', () => { });
	// 	assert.throws(() => CommandsRegistry.registerCommand('foo', () => { }));
	// });

});