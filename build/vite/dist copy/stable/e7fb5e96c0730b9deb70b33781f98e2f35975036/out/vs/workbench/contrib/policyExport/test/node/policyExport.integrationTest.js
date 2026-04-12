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
        function normalizeContent(content) {
            const data = JSON.parse(stripComments(content));
            if (data && Array.isArray(data.policies)) {
                data.policies.sort((a, b) => a.name.localeCompare(b.name));
            }
            return JSON.stringify(data, null, 2);
        }
        try {
            // Launch VS Code with --export-policy-data flag
            const scriptPath = isWindows
                ? join(rootPath, 'scripts', 'code.bat')
                : join(rootPath, 'scripts', 'code.sh');
            // Skip prelaunch to avoid redownloading electron while the parent VS Code is using it.
            // DISTRO_PRODUCT_JSON points to a static test fixture so --export-policy-data can
            // merge extension policies without needing distro access or GITHUB_TOKEN.
            // This fixture is NOT expected to stay in sync with the distro — it exists purely
            // to test the generation code path. Policy values will drift and that is fine.
            const fixturePath = join(rootPath, 'src/vs/workbench/contrib/policyExport/test/node/extensionPolicyFixture.json');
            await exec(`"${scriptPath}" --export-policy-data="${tempFile}"`, {
                cwd: rootPath,
                env: { ...process.env, VSCODE_SKIP_PRELAUNCH: '1', DISTRO_PRODUCT_JSON: fixturePath }
            });
            // Read both files
            const [exportedContent, checkedInContent] = await Promise.all([
                fs.readFile(tempFile, 'utf-8').then(normalizeContent),
                fs.readFile(checkedInFile, 'utf-8').then(normalizeContent)
            ]);
            // Compare contents
            assert.strictEqual(exportedContent, checkedInContent, 'Exported policy data should match the checked-in file. If this fails, run: npm run export-policy-data');
        }
        finally {
            // Clean up temp file
            try {
                await fs.unlink(tempFile);
            }
            catch {
                // Ignore cleanup errors
            }
        }
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9saWN5RXhwb3J0LmludGVncmF0aW9uVGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3BvbGljeUV4cG9ydC90ZXN0L25vZGUvcG9saWN5RXhwb3J0LmludGVncmF0aW9uVGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUNqQyxPQUFPLEtBQUssRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUNwQyxPQUFPLEVBQUUsUUFBUSxJQUFJLEVBQUUsRUFBRSxNQUFNLElBQUksQ0FBQztBQUNwQyxPQUFPLEtBQUssRUFBRSxNQUFNLElBQUksQ0FBQztBQUN6QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUNuRSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDbkUsT0FBTyxLQUFLLElBQUksTUFBTSxNQUFNLENBQUM7QUFDN0IsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRXBFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBRXJDLEtBQUssQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7SUFDNUMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsOENBQThDLEVBQUUsS0FBSztRQUN6RCxrQ0FBa0M7UUFDbEMsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7WUFDN0IsSUFBSSxDQUFDLElB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