/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import { resolveNodeExecutableFromPath } from '../../configuration/configuration.electron';

suite('typescript.configuration.electron', () => {
	test('resolves node from PATH on win32', () => {
		const found = resolveNodeExecutableFromPath(
			{ PATH: 'C:\\Windows;C:\\Tools', PATHEXT: '.COM;.EXE;.BAT;.CMD' },
			'C:\\workspace',
			candidate => candidate.toLowerCase() === 'c:\\tools\\node.exe',
			'win32',
		);

		assert.strictEqual(found, 'C:\\Tools\\node.EXE');
	});

	test('resolves node from PATH on non-win32', () => {
		const found = resolveNodeExecutableFromPath(
			{ PATH: '/bin:/usr/local/bin' },
			'/workspace',
			candidate => candidate === '/usr/local/bin/node',
			'linux',
		);

		assert.strictEqual(found, '/usr/local/bin/node');
	});

	test('returns null when node is not found', () => {
		const found = resolveNodeExecutableFromPath(
			{ PATH: '/bin:/usr/local/bin' },
			'/workspace',
			() => false,
			'linux',
		);

		assert.strictEqual(found, null);
	});
});
