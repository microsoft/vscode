/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OPTIONS, parseArgs } from '../../node/argv.js';
import { getUserDataPath, getUserDataPathForProduct } from '../../node/userDataPath.js';
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

	test('getUserDataPathForProduct - preserves the product name in development', () => {
		const originalDev = process.env['VSCODE_DEV'];
		const originalPortable = process.env['VSCODE_PORTABLE'];
		const originalAppData = process.env['VSCODE_APPDATA'];
		try {
			process.env['VSCODE_DEV'] = '1';
			delete process.env['VSCODE_PORTABLE'];
			process.env['VSCODE_APPDATA'] = 'shared-appdata';
			const path = getUserDataPathForProduct({}, 'shared-product-name');
			assert.strictEqual(path.endsWith('shared-product-name'), true);
		} finally {
			if (originalDev === undefined) {
				delete process.env['VSCODE_DEV'];
			} else {
				process.env['VSCODE_DEV'] = originalDev;
			}
			if (originalPortable === undefined) {
				delete process.env['VSCODE_PORTABLE'];
			} else {
				process.env['VSCODE_PORTABLE'] = originalPortable;
			}
			if (originalAppData === undefined) {
				delete process.env['VSCODE_APPDATA'];
			} else {
				process.env['VSCODE_APPDATA'] = originalAppData;
			}
		}
	});

	test('getUserDataPathForProduct - explicit path wins over environment', () => {
		const originalAppData = process.env['VSCODE_APPDATA'];
		try {
			process.env['VSCODE_APPDATA'] = 'shared-appdata';
			const path = getUserDataPathForProduct({ 'user-data-dir': 'explicit-data' }, 'shared-product-name');
			assert.strictEqual(path.endsWith('explicit-data'), true);
		} finally {
			if (originalAppData === undefined) {
				delete process.env['VSCODE_APPDATA'];
			} else {
				process.env['VSCODE_APPDATA'] = originalAppData;
			}
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
