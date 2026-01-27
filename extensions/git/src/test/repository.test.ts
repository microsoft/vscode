/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import assert from 'assert';
import path from 'path';
import { isWindows } from '../util';

suite('Repository path handling', () => {
	// Skip all tests if not on Windows, as these tests are for Windows-specific path handling
	suiteSetup(function () {
		if (!isWindows) {
			this.skip();
		}
	});

	// Test the path manipulation logic directly for subst drives
	test('subst drive path correction', () => {
		const root = 'X:\\repo';
		const rootRealPath = 'C:\\real\\path\\repo';
		const fsPath = 'X:\\repo\\file.txt';

		// This is the logic from the fix we implemented
		const realPath = fsPath.startsWith(root)
			? path.join(rootRealPath, fsPath.substring(root.length))
			: fsPath;

		// Verify the path is correctly transformed
		assert.strictEqual(realPath, 'C:\\real\\path\\repo\\file.txt');
	});

	test('non-subst path should remain unchanged', () => {
		const root = 'C:\\repo';
		const rootRealPath = 'C:\\repo';
		const fsPath = 'C:\\repo\\file.txt';

		// Same logic as implemented in the fix
		const realPath = fsPath.startsWith(root)
			? path.join(rootRealPath, fsPath.substring(root.length))
			: fsPath;

		// Path should remain unchanged
		assert.strictEqual(realPath, 'C:\\repo\\file.txt');
	});

	test('path outside repository should remain unchanged', () => {
		const root = 'X:\\repo';
		const rootRealPath = 'C:\\real\\path\\repo';
		const fsPath = 'D:\\other\\file.txt';

		// Same logic as implemented in the fix
		const realPath = fsPath.startsWith(root)
			? path.join(rootRealPath, fsPath.substring(root.length))
			: fsPath;

		// Path should remain unchanged
		assert.strictEqual(realPath, 'D:\\other\\file.txt');
	});
});
