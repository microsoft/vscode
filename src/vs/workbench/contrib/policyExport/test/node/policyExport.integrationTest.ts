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
import { dirname, join } from '../../../../../base/common/path.js';
import { FileAccess } from '../../../../../base/common/network.js';
import * as util from 'util';
import { stripComments } from '../../../../../base/common/jsonc.js';

const exec = util.promisify(cp.exec);

suite('PolicyExport Integration Tests', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('exported policy data matches checked-in file', async function () {
		// Skip this test in ADO pipelines
		if (process.env['TF_BUILD']) {
			this.skip();
		}

		// This test launches VS Code with --export-policy-data flag, so it takes longer
		this.timeout(60000);

		// Get the repository root (FileAccess.asFileUri('') points to the 'out' directory)
		const rootPath = dirname(FileAccess.asFileUri('').fsPath);
		const checkedInFile = join(rootPath, 'build/lib/policies/policyData.jsonc');
		const tempFile = join(os.tmpdir(), `policyData-test-${Date.now()}.jsonc`);

		function normalizeContent(content: string) {
			const data = JSON.parse(stripComments(content));
			if (data && Array.isArray(data.policies)) {
				data.policies.sort((a: any, b: any) => a.name.localeCompare(b.name));
			}
			return JSON.stringify(data, null, 2);
		}

		try {
			// Launch VS Code with --export-policy-data flag
			const scriptPath = isWindows
				? join(rootPath, 'scripts', 'code.bat')
				: join(rootPath, 'scripts', 'code.sh');

			// Skip prelaunch to avoid redownloading electron while the parent VS Code is using it
			await exec(`"${scriptPath}" --export-policy-data="${tempFile}"`, {
				cwd: rootPath,
				env: { ...process.env, VSCODE_SKIP_PRELAUNCH: '1' }
			});

			// Read both files
			const [exportedContent, checkedInContent] = await Promise.all([
				fs.readFile(tempFile, 'utf-8').then(normalizeContent),
				fs.readFile(checkedInFile, 'utf-8').then(normalizeContent)
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
