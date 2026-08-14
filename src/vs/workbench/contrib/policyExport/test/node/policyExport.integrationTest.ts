/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { dirname, join } from '../../../../../base/common/path.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { CORE_POLICY_NAMES } from '../../../../services/policies/common/policyTelemetry.js';
import * as util from 'util';

const execFile = util.promisify(cp.execFile);

suite('PolicyExport Integration Tests', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('exported policy data matches checked-in file', async function () {
		if (process.env['TF_BUILD']) {
			this.skip();
		}

		// The canonical export launches both product entrypoints.
		this.timeout(120000);

		// FileAccess.asFileUri('') points to the 'out' directory.
		const rootPath = dirname(FileAccess.asFileUri('').fsPath);
		const exportScript = join(rootPath, 'build/lib/policies/exportPolicyData.ts');
		const fixturePath = join(rootPath, 'src/vs/workbench/contrib/policyExport/test/node/extensionPolicyFixture.json');
		await execFile('node', [exportScript, '--check', '--skip-transpile'], {
			cwd: rootPath,
			env: { ...process.env, DISTRO_PRODUCT_JSON: fixturePath, VSCODE_SKIP_PRELAUNCH: '1' },
			maxBuffer: 10 * 1024 * 1024,
		});
	});

	test('policy telemetry covers every exported core policy', async () => {
		const rootPath = dirname(FileAccess.asFileUri('').fsPath);
		const policyDataPath = join(rootPath, 'build/lib/policies/policyData.jsonc');
		const content = await fs.promises.readFile(policyDataPath, 'utf8');
		const policyData = JSON.parse(content.replace(/^\/\*[\s\S]*?\*\/\s*/, '')) as { policies: { name: string }[] };

		assert.deepStrictEqual(CORE_POLICY_NAMES, policyData.policies.map(policy => policy.name).sort());
	});
});
