/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { removeTempDirs } from './e2e/harness/agentHostE2ETestHarness.js';

suite('Agent Host E2E temporary-directory cleanup', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const directories: string[] = [];

	function createHome(): string {
		const directory = mkdtempSync(join(tmpdir(), 'vscode-agent-host-cleanup-test-'));
		directories.push(directory);
		const codexDirectory = join(directory, '.codex');
		mkdirSync(codexDirectory);
		const file = join(codexDirectory, 'state.sqlite');
		writeFileSync(file, 'owned test file');
		chmodSync(file, 0o444);
		return directory;
	}

	teardown(() => {
		for (const directory of directories.splice(0)) {
			const file = join(directory, '.codex', 'state.sqlite');
			if (existsSync(file)) {
				chmodSync(file, 0o600);
			}
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('retries after clearing read-only attributes when the deadline has elapsed', async () => {
		const directory = createHome();

		await removeTempDirs([directory], 0);

		assert.strictEqual(existsSync(directory), false);
	});

	test('removes all retired homes after the first sweep exhausts the cleanup deadline', async () => {
		const homes = Array.from({ length: 17 }, () => createHome());
		const trackedHomes = [...homes];

		await removeTempDirs(trackedHomes, 0);

		assert.deepStrictEqual({
			trackedHomes,
			remainingHomes: homes.filter(existsSync),
		}, { trackedHomes: [], remainingHomes: [] });
	});
});
