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
				'Exported policy data should match the checked-in file. If this fails, run: ./scripts/code.sh --export-policy-data && node build/lib/policies/mergeExtensionPolicies.ts'
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

	test('mergeExtensionPolicies merges entries from mock distro', async function () {
		// Skip this test in ADO pipelines
		if (process.env['TF_BUILD']) {
			this.skip();
		}

		this.timeout(30000);

		const rootPath = dirname(FileAccess.asFileUri('').fsPath);

		// Create a mock distro product.json with extension policies
		const mockDistroDir = join(os.tmpdir(), `mock-distro-${Date.now()}`);
		const mockProductJson = join(mockDistroDir, 'product.json');
		const tempPolicyData = join(os.tmpdir(), `policyData-merge-test-${Date.now()}.jsonc`);

		await fs.mkdir(mockDistroDir, { recursive: true });

		await fs.writeFile(mockProductJson, JSON.stringify({
			extensionConfigurationPolicy: {
				'test.extension.settingA': {
					name: 'TestSettingA',
					category: 'Extensions',
					minimumVersion: '1.99',
					description: 'Test setting A description.'
				},
				'test.extension.settingB': {
					name: 'TestSettingB',
					category: 'InteractiveSession',
					minimumVersion: '1.100',
					description: 'Test setting B description.'
				}
			}
		}));

		// Create a minimal policyData file to merge into
		await fs.writeFile(tempPolicyData, JSON.stringify({
			categories: [
				{ key: 'Extensions', name: { key: 'ext', value: 'Extensions' } },
				{ key: 'InteractiveSession', name: { key: 'chat', value: 'Chat' } }
			],
			policies: [
				{
					key: 'existing.policy',
					name: 'ExistingPolicy',
					category: 'Extensions',
					minimumVersion: '1.99',
					localization: { description: { key: 'existing.policy', value: 'Already exists.' } },
					type: 'boolean',
					default: true
				}
			]
		}, null, 4));

		try {
			// Run the merge script with DISTRO_PRODUCT_JSON pointing to our mock
			await exec(`node build/lib/policies/mergeExtensionPolicies.ts "${tempPolicyData}"`, {
				cwd: rootPath,
				env: { ...process.env, GITHUB_TOKEN: '', DISTRO_PRODUCT_JSON: mockProductJson },
			});

			// Parse the result
			const result = JSON.parse(stripComments(await fs.readFile(tempPolicyData, 'utf-8')));
			const policyKeys = result.policies.map((p: { key: string }) => p.key);

			// Original policy should still be there
			assert.ok(policyKeys.includes('existing.policy'), 'existing policy should be preserved');

			// Both extension policies should have been added
			assert.ok(policyKeys.includes('test.extension.settingA'), 'settingA should be merged');
			assert.ok(policyKeys.includes('test.extension.settingB'), 'settingB should be merged');

			// Verify the merged policy structure
			const settingA = result.policies.find((p: { key: string }) => p.key === 'test.extension.settingA');
			assert.strictEqual(settingA.name, 'TestSettingA');
			assert.strictEqual(settingA.category, 'Extensions');
			assert.strictEqual(settingA.type, 'boolean');
			assert.strictEqual(settingA.default, true);
			assert.strictEqual(settingA.localization.description.key, 'test.extension.settingA');
			assert.strictEqual(settingA.localization.description.value, 'Test setting A description.');

			// Running again should be idempotent (no duplicates)
			await exec(`node build/lib/policies/mergeExtensionPolicies.ts "${tempPolicyData}"`, {
				cwd: rootPath,
				env: { ...process.env, GITHUB_TOKEN: '', DISTRO_PRODUCT_JSON: mockProductJson },
			});

			const result2 = JSON.parse(stripComments(await fs.readFile(tempPolicyData, 'utf-8')));
			assert.strictEqual(result2.policies.length, 3, 'idempotent: should still have exactly 3 policies');
		} finally {
			try { await fs.unlink(tempPolicyData); } catch { /* ignore */ }
			try { await fs.rm(mockDistroDir, { recursive: true }); } catch { /* ignore */ }
		}
	});
});
