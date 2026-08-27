/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from '../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';

const execFileAsync = promisify(execFile);

(process.versions['electron'] ? suite : suite.skip)('bootstrap ESM', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let fixtureDirectory: string;
	let fixturePath: string;
	let reentrantHookPath: string;

	suiteSetup(async () => {
		fixtureDirectory = await mkdtemp(join(tmpdir(), 'vscode-bootstrap-esm-'));
		fixturePath = join(fixtureDirectory, 'fixture.mjs');
		reentrantHookPath = join(fixtureDirectory, 'reentrant-hook.mjs');
		await writeFile(join(fixtureDirectory, 'required-esm.mjs'), `
			import fs from 'fs';
			import originalFs from 'original-fs';

			export const usesOriginalFs = fs === originalFs;
		`);
		await writeFile(reentrantHookPath, `
			import { createRequire, registerHooks } from 'node:module';

			const require = createRequire(import.meta.url);
			let reentered = false;
			registerHooks({
				resolve(specifier, context, nextResolve) {
					if (!reentered && specifier === 'node:fs' && context.importAttributes === undefined) {
						reentered = true;
						require('./required-esm.mjs');
					}
					return nextResolve(specifier, context);
				}
			});
		`);
		await writeFile(fixturePath, `
			import fs from 'fs';
			import originalFs from 'original-fs';
			import { createRequire } from 'node:module';

			const require = createRequire(import.meta.url);
			const commonJSFs = require('fs');
			const commonJSOriginalFs = require('original-fs');
			const requiredESM = require('./required-esm.mjs');

			process.stdout.write(JSON.stringify({
				commonJSUsesOriginalFs: commonJSFs === commonJSOriginalFs,
				esmUsesOriginalFs: fs === originalFs,
				requiredESMUsesOriginalFs: requiredESM.usesOriginalFs
			}));
		`);
	});

	suiteTeardown(async () => {
		await rm(fixtureDirectory, { recursive: true, force: true });
	});

	for (const condition of [undefined, 'require', 'import']) {
		test(`preserves ESM and CommonJS fs behavior with the ${condition ? `"${condition}" user condition` : 'default conditions'}`, async () => {
			const bootstrapPath = join(dirname(fileURLToPath(import.meta.url)), '../../../../bootstrap-esm.js');
			const args = [
				'--import',
				pathToFileURL(reentrantHookPath).href,
				'--import',
				pathToFileURL(bootstrapPath).href,
				fixturePath
			];
			const env: NodeJS.ProcessEnv = {
				...process.env,
				ELECTRON_RUN_AS_NODE: '1',
				VSCODE_DEV: '1'
			};
			delete env['NODE_OPTIONS'];
			if (condition) {
				env['NODE_OPTIONS'] = `--conditions=${condition}`;
			}
			const { stdout } = await execFileAsync(process.execPath, args, {
				env
			});

			assert.deepStrictEqual(JSON.parse(stdout), {
				commonJSUsesOriginalFs: false,
				esmUsesOriginalFs: true,
				requiredESMUsesOriginalFs: true
			});
		});
	}
});
