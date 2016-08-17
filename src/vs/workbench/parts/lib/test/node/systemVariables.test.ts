/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import * as Platform from 'vs/base/common/platform';
import {TestEnvironmentService} from 'vs/test/utils/servicesTestUtils';

import { SystemVariables } from 'vs/workbench/parts/lib/node/systemVariables';

suite('SystemVariables tests', () => {
	test('SystemVariables: substitute one', () => {
		let systemVariables: SystemVariables = new SystemVariables(null, null, TestEnvironmentService, URI.parse('file:///VSCode/workspaceLocation'));
		if (Platform.isWindows) {
			assert.strictEqual(systemVariables.resolve('abc ${workspaceRoot} xyz'), 'abc \\VSCode\\workspaceLocation xyz');
		} else {
			assert.strictEqual(systemVariables.resolve('abc ${workspaceRoot} xyz'), 'abc /VSCode/workspaceLocation xyz');
		}
	});

	test('SystemVariables: substitute many', () => {
		let systemVariables: SystemVariables = new SystemVariables(null, null, TestEnvironmentService, URI.parse('file:///VSCode/workspaceLocation'));
		if (Platform.isWindows) {
			assert.strictEqual(systemVariables.resolve('${workspaceRoot} - ${workspaceRoot}'), '\\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation');
		} else {
			assert.strictEqual(systemVariables.resolve('${workspaceRoot} - ${workspaceRoot}'), '/VSCode/workspaceLocation - /VSCode/workspaceLocation');
		}
	});
	test('SystemVariables: substitute one env variable', () => {
		let envVariables: { [key: string]: string } = { key1: 'Value for Key1', key2: 'Value for Key2' };
		let systemVariables: SystemVariables = new SystemVariables(null, null, TestEnvironmentService, URI.parse('file:///VSCode/workspaceLocation'), envVariables);
		if (Platform.isWindows) {
			assert.strictEqual(systemVariables.resolve('abc ${workspaceRoot} ${env.key1} xyz'), 'abc \\VSCode\\workspaceLocation Value for Key1 xyz');
		} else {
			assert.strictEqual(systemVariables.resolve('abc ${workspaceRoot} ${env.key1} xyz'), 'abc /VSCode/workspaceLocation Value for Key1 xyz');
		}
	});

	test('SystemVariables: substitute many env variable', () => {
		let envVariables: { [key: string]: string } = { key1: 'Value for Key1', key2: 'Value for Key2' };
		let systemVariables: SystemVariables = new SystemVariables(null, null, TestEnvironmentService, URI.parse('file:///VSCode/workspaceLocation'), envVariables);
		if (Platform.isWindows) {
			assert.strictEqual(systemVariables.resolve('${workspaceRoot} - ${workspaceRoot} ${env.key1} - ${env.key2}'), '\\VSCode\\workspaceLocation - \\VSCode\\workspaceLocation Value for Key1 - Value for Key2');
		} else {
			assert.strictEqual(systemVariables.resolve('${workspaceRoot} - ${workspaceRoot} ${env.key1} - ${env.key2}'), '/VSCode/workspaceLocation - /VSCode/workspaceLocation Value for Key1 - Value for Key2');
		}
	});
});