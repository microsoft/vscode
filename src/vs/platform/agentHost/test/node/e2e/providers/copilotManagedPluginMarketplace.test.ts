/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { join } from '../../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { createManagedPluginMarketplace } from './copilotManagedPluginMarketplace.js';

const execFileAsync = promisify(execFile);

suite('Copilot managed plugin marketplace fixture', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('holds a real Git fetch until the test releases it', async () => {
		const root = await mkdtemp(join(tmpdir(), 'managed-plugin-marketplace-'));
		const checkout = join(root, 'checkout');
		const marketplace = await createManagedPluginMarketplace(root, 'gated-marketplace', [{
			name: 'gated-plugin',
			version: '1.0.0',
			skillName: 'gated-skill',
		}]);
		const gate = marketplace.holdNextRequest();
		let cloneComplete = false;
		try {
			const clone = execFileAsync('git', ['clone', marketplace.sourceUrl, checkout]).then(() => {
				cloneComplete = true;
			});
			await gate.started;
			assert.strictEqual(cloneComplete, false);
			gate.release();
			await clone;
			assert.deepStrictEqual({
				cloneComplete,
				skill: await readFile(join(checkout, 'plugins', 'gated-plugin', 'skills', 'gated-skill', 'SKILL.md'), 'utf8'),
			}, {
				cloneComplete: true,
				skill: '---\nname: gated-skill\ndescription: Managed plugin skill gated-skill.\n---\n\nManaged plugin skill gated-skill.',
			});
		} finally {
			gate.release();
			await marketplace.close();
			await rm(root, { recursive: true, force: true });
		}
	});
});
