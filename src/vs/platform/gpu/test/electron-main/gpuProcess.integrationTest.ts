/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { pathToFileURL } from 'url';
import { FileAccess } from '../../../../base/common/network.js';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

const execFileAsync = promisify(execFile);

(process.versions.electron ? suite : suite.skip)('GPU process integration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	for (const mode of ['early', 'late', 'software']) {
		test(`tracks native GPU lifecycle and renderer compositing in ${mode} startup`, async function () {
			this.timeout(90_000);
			const userData = await mkdtemp(join(tmpdir(), 'vscode-gpu-integration-'));
			try {
				const fixture = FileAccess.asFileUri('vs/platform/gpu/test/electron-main/fixtures/gpuProcessIntegrationMain.js').fsPath;
				const preload = FileAccess.asFileUri('vs/platform/gpu/test/electron-main/fixtures/gpuProcessIntegrationPreload.js').fsPath;
				await writeFile(join(userData, 'preload.mjs'), `import ${JSON.stringify(pathToFileURL(preload).href)};\n`);
				const executable = process.env['VSCODE_TEST_ELECTRON_PATH'];
				assert.ok(executable, 'The GPU integration test requires the Electron test runner');
				const { stdout } = await execFileAsync(executable, [
					fixture,
					`--gpu-test-user-data=${userData}`,
					`--gpu-test-mode=${mode}`,
				], {
					env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, NODE_OPTIONS: undefined },
					timeout: 75_000,
					maxBuffer: 4 * 1024 * 1024,
				});
				assert.strictEqual(stdout.trim(), 'GPU process integration passed');
			} finally {
				await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
			}
		});
	}
});
