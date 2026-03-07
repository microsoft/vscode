/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import { enableHotReload, isHotReloadEnabled, registerHotReloadHandler } from '../../common/hotReload.js';

suite('Hot Reload', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('isHotReloadEnabled is false by default', () => {
		assert.strictEqual(isHotReloadEnabled(), false);
	});

	test('registerHotReloadHandler returns a dummy disposable when disabled', () => {
		assert.strictEqual(isHotReloadEnabled(), false);
		const handler = () => undefined;
		const disposable = disposables.add(registerHotReloadHandler(handler));
		assert.ok(disposable);
	});

	test('enableHotReload enables hot reload and registerHotReloadHandler works', () => {
		enableHotReload();
		assert.strictEqual(isHotReloadEnabled(), true);

		const handler = () => undefined;
		const disposable = disposables.add(registerHotReloadHandler(handler));
		assert.ok(disposable);
	});
});
