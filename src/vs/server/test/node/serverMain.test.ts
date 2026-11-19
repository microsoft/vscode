/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { join } from '../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../base/test/node/testUtils.js';

suite('server.main directory creation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('should create nested directories with recursive option', function () {
		this.timeout(10000);
		const testDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'server-main-dirs');
		const nestedPath = join(testDir, 'parent', 'child', 'extensions');

		store.add(toDisposable(() => {
			// Cleanup
			if (fs.existsSync(testDir)) {
				fs.rmSync(testDir, { recursive: true, force: true });
			}
		}));
		// Ensure the test directory doesn't exist
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}

		// This simulates what server.main.ts does - create directories with recursive option
		if (!fs.existsSync(nestedPath)) {
			fs.mkdirSync(nestedPath, { mode: 0o700, recursive: true });
		}

		// Verify all directories were created
		assert.strictEqual(fs.existsSync(nestedPath), true, 'Nested directory should exist');
		assert.strictEqual(fs.existsSync(join(testDir, 'parent')), true, 'Parent directory should exist');
		assert.strictEqual(fs.existsSync(join(testDir, 'parent', 'child')), true, 'Child directory should exist');

		// Verify the permissions (only on Unix-like systems)
		if (process.platform !== 'win32') {
			const stats = fs.statSync(nestedPath);
			const mode = stats.mode & 0o777;
			assert.strictEqual(mode, 0o700, 'Directory should have 0o700 permissions');
		}
	});

	test('should not fail when parent directories do not exist', function () {
		this.timeout(10000);
		const testDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'server-main-nonexistent');
		const deeplyNestedPath = join(testDir, 'level1', 'level2', 'level3', 'extensions');

		store.add(toDisposable(() => {
			// Cleanup
			if (fs.existsSync(testDir)) {
				fs.rmSync(testDir, { recursive: true, force: true });
			}
		}));
		// Ensure the test directory doesn't exist
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}

		// This should not throw an error even though parent directories don't exist
		assert.doesNotThrow(() => {
			if (!fs.existsSync(deeplyNestedPath)) {
				fs.mkdirSync(deeplyNestedPath, { mode: 0o700, recursive: true });
			}
		}, 'Should not throw when creating deeply nested directories');

		// Verify the directory was created
		assert.strictEqual(fs.existsSync(deeplyNestedPath), true, 'Deeply nested directory should exist');
	});

	test('should handle existing directories gracefully', function () {
		this.timeout(10000);
		const testDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'server-main-existing');
		const extensionsPath = join(testDir, 'extensions');

		store.add(toDisposable(() => {
			// Cleanup
			if (fs.existsSync(testDir)) {
				fs.rmSync(testDir, { recursive: true, force: true });
			}
		}));
		// Create the directory first
		fs.mkdirSync(extensionsPath, { mode: 0o700, recursive: true });
		assert.strictEqual(fs.existsSync(extensionsPath), true);

		// Try to create it again - this simulates the if (!fs.existsSync(f)) check in server.main.ts
		assert.doesNotThrow(() => {
			if (!fs.existsSync(extensionsPath)) {
				fs.mkdirSync(extensionsPath, { mode: 0o700, recursive: true });
			}
		}, 'Should not throw when directory already exists');

		// The directory should still exist
		assert.strictEqual(fs.existsSync(extensionsPath), true);
	});
});
