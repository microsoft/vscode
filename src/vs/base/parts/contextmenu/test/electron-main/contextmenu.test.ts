/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { execFile } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { FileAccess } from '../../../../common/network.js';
import { join } from '../../../../common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../test/common/utils.js';

suite('Native context menu lifecycle', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	for (const [scenario, title] of [
		['dismiss', 'dismissed menus cannot invoke their former actions'],
		['repeat', 'repeated dismissal releases each menu independently'],
		['select', 'selected actions run exactly once with their context'],
		['submenu', 'selected submenu actions run exactly once with their context'],
	]) {
		test(title, async function () {
			this.timeout(30000);
			const env = { ...process.env };
			delete env.ELECTRON_RUN_AS_NODE;
			const userData = await mkdtemp(join(tmpdir(), 'vscode-native-menu-test-'));
			try {
				const { stdout } = await promisify(execFile)(process.execPath, [
					FileAccess.asFileUri('vs/base/parts/contextmenu/test/electron-main/fixtures/contextmenu.js').fsPath,
					'--no-sandbox', `--user-data-dir=${userData}`, `--scenario=${scenario}`
				], { env, timeout: 25000 });
				assert.ok(stdout.includes(`Native menu lifecycle passed: ${scenario}`));
			} finally {
				await rm(userData, { recursive: true, force: true });
			}
		});
	}
});
