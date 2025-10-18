/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as cp from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { join } from '../../../../../base/common/path.js';
import { FileAccess } from '../../../../../base/common/network.js';

suite('PolicyExport Integration Tests', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('exported policy data matches checked-in file', async function () {
		// This test launches VS Code with --export-policy-data flag, so it takes longer
		this.timeout(60000);

		const rootPath = FileAccess.asFileUri('').fsPath.replace(/[\/\\]out[\/\\].*$/, '');
		const checkedInFile = join(rootPath, 'build/lib/policies/policyData.jsonc');
		const tempFile = join(os.tmpdir(), `policyData-test-${Date.now()}.jsonc`);

		try {
			// Launch VS Code with --export-policy-data flag
			const scriptPath = isWindows
				? join(rootPath, 'scripts', 'code.bat')
				: join(rootPath, 'scripts', 'code.sh');

			await new Promise<void>((resolve, reject) => {
				const proc = cp.spawn(scriptPath, [`--export-policy-data=${tempFile}`], {
					cwd: rootPath,
					stdio: 'pipe',
					shell: true
				});

				let stdout = '';
				let stderr = '';

				proc.stdout?.on('data', (data: Buffer) => {
					stdout += data.toString();
				});

				proc.stderr?.on('data', (data: Buffer) => {
					stderr += data.toString();
				});

				proc.on('close', (code: number | null) => {
					if (code === 0) {
						resolve();
					} else {
						reject(new Error(`VS Code exited with code ${code}\nStdout: ${stdout}\nStderr: ${stderr}`));
					}
				});

				proc.on('error', (err: Error) => {
					reject(new Error(`Failed to spawn VS Code: ${err.message}`));
				});
			});

			// Read both files
			const [exportedContent, checkedInContent] = await Promise.all([
				fs.readFile(tempFile, 'utf-8'),
				fs.readFile(checkedInFile, 'utf-8')
			]);

			// Compare contents
			assert.strictEqual(
				exportedContent,
				checkedInContent,
				'Exported policy data should match the checked-in file. If this fails, run: ./scripts/code.sh --export-policy-data'
			);
		} finally {
			// Clean up temp file
			try {
				await fs.unlink(tempFile);
			} catch {
				// Ignore cleanup errors
			}
		}
	});
});
