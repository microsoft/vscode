/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import * as Platform from 'vs/base/common/platform';

import { SystemVariables } from 'vs/workbench/parts/lib/node/systemVariables';

suite('SystemVariables tests', () => {
	test('SytemVariables: subsitute one', () => {
		let systemVariables: SystemVariables = new SystemVariables(null, null, URI.parse('file:///VSCode/workspaceLocation'));
		if (Platform.isWindows) {
			assert.strictEqual(systemVariables.resolve('abc ${workspaceRoot} xyz'), 'abc \\VSCode\\workspaceLocation xyz');
		} else {
			assert.strictEqual(systemVariables.resolve('abc ${workspaceRoot} xyz'), 'abc /VSCode/workspaceLocation xyz');
		}
	});

	test('SytemVariables: subsitute many', () => {
		let systemVariables: SystemVariables = new SystemVariables(null, null, URI.parse('file:///VSCode/workspaceLocation'));
		if (Platform.isWindows) {
			assert.strictEqual(systemVariables.resolve('${workspaceRoot} - ${workspaceRoot}'), '\\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation');
		} else {
			assert.strictEqual(systemVariables.resolve('${workspaceRoot} - ${workspaceRoot}'), '/VSCode/workspaceLocation - /VSCode/workspaceLocation');
		}
	});
});