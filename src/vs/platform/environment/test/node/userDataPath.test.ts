/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OPTIONS, parseArgs } from '../../node/argv.js';
import { getUserDataPath } from '../../node/userDataPath.js';
import product from '../../../product/common/product.js';

suite('User data path', () => {

	test('getUserDataPath - default', () => {
		const path = getUserDataPath(parseArgs(process.argv, OPTIONS), product.nameShort);
		assert.ok(path.length > 0);
	});

	test('getUserDataPath - portable mode', () => {
		const origPortable = process.env['VSCODE_PORTABLE'];
		try {
			const portableDir = 'portable-dir';
			process.env['VSCODE_PORTABLE'] = portableDir;

			const path = getUserDataPath(parseArgs(process.argv, OPTIONS), product.nameShort);
			assert.ok(path.includes(portableDir));
		} finally {
			if (typeof origPortable === 'string') {
				process.env['VSCODE_PORTABLE'] = origPortable;
			} else {
				delete process.env['VSCODE_PORTABLE'];
			}
		}
	});

	test('getUserDataPath - --user-data-dir', () => {
		const cliUserDataDir = 'cli-data-dir';
		const args = parseArgs(process.argv, OPTIONS);
		args['user-data-dir'] = cliUserDataDir;

		const path = getUserDataPath(args, product.nameShort);
		assert.ok(path.includes(cliUserDataDir));
	});

	test('getUserDataPath - VSCODE_APPDATA', () => {
		const origAppData = process.env['VSCODE_APPDATA'];
		try {
			const appDataDir = 'appdata-dir';
			process.env['VSCODE_APPDATA'] = appDataDir;

			const path = getUserDataPath(parseArgs(process.argv, OPTIONS), product.nameShort);
			assert.ok(path.includes(appDataDir));
		} finally {
			if (typeof origAppData === 'string') {
				process.env['VSCODE_APPDATA'] = origAppData;
			} else {
				delete process.env['VSCODE_APPDATA'];
			}
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
