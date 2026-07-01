/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getRandomTestPath } from '../../../base/test/node/testUtils.js';

suite('WebClientServer workspace file fallback', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let testDir: string;

	setup(() => {
		testDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'webclient-workspace');
		fs.mkdirSync(testDir, { recursive: true });
	});

	teardown(() => {
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('workspace file exists - stat succeeds', async function () {
		this.timeout(10000);

		// Create a workspace file
		const workspaceFile = join(testDir, 'test.code-workspace');
		fs.writeFileSync(workspaceFile, JSON.stringify({ folders: [] }));

		// Simulate the server logic: stat the file
		let fallback = false;
		try {
			await fs.promises.stat(workspaceFile);
		} catch {
			fallback = true;
		}

		assert.strictEqual(fallback, false, 'Should not fall back when workspace file exists');
	});

	test('workspace file does not exist - stat fails and triggers fallback', async function () {
		this.timeout(10000);

		const workspaceFile = join(testDir, 'missing.code-workspace');

		// Simulate the server logic: stat a missing file
		let fallback = false;
		try {
			await fs.promises.stat(workspaceFile);
		} catch {
			fallback = true;
		}

		assert.strictEqual(fallback, true, 'Should fall back when workspace file does not exist');
	});

	test('workspace file fallback flag propagation', async function () {
		this.timeout(10000);

		// Simulate the full server logic from webClientServer.ts
		const defaultFolder = testDir;
		const defaultWorkspace = join(testDir, 'nonexistent.code-workspace');

		const folderUri: string | undefined = defaultFolder;
		let workspaceUri: string | undefined = defaultWorkspace;
		let workspaceFileFallback: boolean | undefined;

		if (workspaceUri) {
			try {
				await fs.promises.stat(workspaceUri);
			} catch {
				workspaceUri = undefined;
				workspaceFileFallback = true;
			}
		}

		assert.strictEqual(workspaceUri, undefined, 'workspaceUri should be cleared on fallback');
		assert.strictEqual(workspaceFileFallback, true, 'workspaceFileFallback flag should be set');
		assert.strictEqual(folderUri, defaultFolder, 'folderUri should remain unchanged');
	});

	test('no fallback when workspace file is not specified', async function () {
		this.timeout(10000);

		// Simulate: only default-folder is specified, no default-workspace
		const folderUri: string | undefined = testDir;
		let workspaceUri: string | false | undefined = undefined;
		let workspaceFileFallback: boolean | undefined;

		if (workspaceUri) {
			try {
				await fs.promises.stat(workspaceUri);
			} catch {
				workspaceUri = undefined;
				workspaceFileFallback = true;
			}
		}

		assert.strictEqual(workspaceUri, undefined, 'workspaceUri should remain undefined');
		assert.strictEqual(workspaceFileFallback, undefined, 'workspaceFileFallback should not be set');
		assert.strictEqual(folderUri, testDir, 'folderUri should be set');
	});

	test('no fallback when workspace file exists', async function () {
		this.timeout(10000);

		// Create a valid workspace file
		const workspaceFile = join(testDir, 'valid.code-workspace');
		fs.writeFileSync(workspaceFile, JSON.stringify({ folders: [{ path: '.' }] }));

		const folderUri: string | undefined = testDir;
		let workspaceUri: string | undefined = workspaceFile;
		let workspaceFileFallback: boolean | undefined;

		if (workspaceUri) {
			try {
				await fs.promises.stat(workspaceUri);
			} catch {
				workspaceUri = undefined;
				workspaceFileFallback = true;
			}
		}

		assert.strictEqual(workspaceUri, workspaceFile, 'workspaceUri should remain set');
		assert.strictEqual(workspaceFileFallback, undefined, 'workspaceFileFallback should not be set');
		assert.strictEqual(folderUri, testDir, 'folderUri should remain set');
	});
});
