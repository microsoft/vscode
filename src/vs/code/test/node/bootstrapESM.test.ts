/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from '../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';

const execFileAsync = promisify(execFile);
const nodeRequire = createRequire(import.meta.url);
const { createPackage, uncache } = nodeRequire('asar') as {
	createPackage(source: string, destination: string): Promise<void>;
	uncache(archive: string): boolean;
};

(process.versions['electron'] ? suite : suite.skip)('bootstrap ESM', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	let fixtureDirectory: string;
	let fixturePath: string;
	let reentrantHookPath: string;
	let packagedFixturePath: string;
	let packagedCollisionFixturePath: string;
	let packagedBootstrapPath: string;
	let packagedTracePath: string;
	let packagedCollisionTracePath: string;
	let packagedArchivePath: string;

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

		const outRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../');
		const packagedAppRoot = join(fixtureDirectory, 'resources', 'app');
		const packagedOutRoot = join(packagedAppRoot, 'out');
		await mkdir(join(packagedOutRoot, 'vs', 'base', 'common'), { recursive: true });
		await Promise.all([
			copyFile(join(outRoot, 'bootstrap-esm.js'), join(packagedOutRoot, 'bootstrap-esm.js')),
			copyFile(join(outRoot, 'bootstrap-meta.js'), join(packagedOutRoot, 'bootstrap-meta.js')),
			copyFile(join(outRoot, 'bootstrap-node.js'), join(packagedOutRoot, 'bootstrap-node.js')),
			copyFile(join(outRoot, 'vs', 'base', 'common', 'performance.js'), join(packagedOutRoot, 'vs', 'base', 'common', 'performance.js')),
			writeFile(join(packagedAppRoot, 'product.json'), '{}'),
			writeFile(join(packagedAppRoot, 'package.json'), '{"type":"module"}'),
		]);

		const archiveSource = join(fixtureDirectory, 'archive-source');
		const packageRoot = join(archiveSource, 'cache-test');
		await mkdir(packageRoot, { recursive: true });
		await writeFile(join(packageRoot, 'package.json'), '{"name":"cache-test","type":"module","exports":"./index.js"}');
		await writeFile(join(packageRoot, 'index.js'), 'export const value = 1;');

		const collisionPackageRoot = join(archiveSource, 'cache-collision');
		await mkdir(collisionPackageRoot, { recursive: true });
		await writeFile(join(collisionPackageRoot, 'package.json'), JSON.stringify({
			name: 'cache-collision',
			type: 'module',
			exports: {
				type: './condition.js',
				default: './attribute.json'
			}
		}));
		await writeFile(join(collisionPackageRoot, 'condition.js'), 'export const value = "condition";');
		await writeFile(join(collisionPackageRoot, 'attribute.json'), '{"value":"attribute"}');

		packagedArchivePath = join(packagedAppRoot, 'node_modules.asar');
		await createPackage(archiveSource, packagedArchivePath);

		packagedFixturePath = join(packagedOutRoot, 'cache-fixture.mjs');
		packagedCollisionFixturePath = join(packagedOutRoot, 'cache-collision-fixture.mjs');
		packagedBootstrapPath = join(packagedOutRoot, 'bootstrap-esm.js');
		packagedTracePath = join(fixtureDirectory, 'asar-trace.log');
		packagedCollisionTracePath = join(fixtureDirectory, 'asar-collision-trace.log');
		await writeFile(join(packagedOutRoot, 'cache-parent-a.mjs'), `
			export const first = () => import('cache-test');
			export const second = () => import('cache-test');
		`);
		await writeFile(join(packagedOutRoot, 'cache-parent-b.mjs'), `
			export const first = () => import('cache-test');
			export const second = () => import('cache-test');
		`);
		await writeFile(packagedFixturePath, `
			const firstParent = await import('./cache-parent-a.mjs');
			const secondParent = await import('./cache-parent-b.mjs');
			const modules = await Promise.all([
				firstParent.first(),
				firstParent.second(),
				secondParent.first(),
				secondParent.second()
			]);
			process.stdout.write(JSON.stringify(modules.map(module => module.value)));
		`);
		await writeFile(packagedCollisionFixturePath, `
			import { registerHooks } from 'node:module';

			let first = true;
			registerHooks({
				resolve(specifier, context, nextResolve) {
					if (specifier === 'cache-collision' && first) {
						first = false;
						return nextResolve(specifier, {
							...context,
							conditions: [...context.conditions, 'type', 'json']
						});
					}
					return nextResolve(specifier, context);
				}
			});

			const conditional = await import('cache-collision');
			const attributed = await import('cache-collision', { with: { type: 'json' } });
			process.stdout.write(JSON.stringify([conditional.value, attributed.default.value]));
		`);
	});

	suiteTeardown(async () => {
		uncache(packagedArchivePath);
		const previousNoAsar = process.noAsar;
		process.noAsar = true;
		try {
			await rm(fixtureDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
		} finally {
			process.noAsar = previousNoAsar;
		}
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

	test('caches identical packaged ESM archive resolutions', async () => {
		const env: NodeJS.ProcessEnv = {
			...process.env,
			ELECTRON_RUN_AS_NODE: '1',
			VSCODE_ASAR_TRACE: packagedTracePath
		};
		delete env['NODE_OPTIONS'];
		delete env['VSCODE_DEV'];

		const { stdout } = await execFileAsync(process.execPath, [
			'--import',
			pathToFileURL(packagedBootstrapPath).href,
			packagedFixturePath
		], { env });
		const trace = await readFile(packagedTracePath, 'utf8');

		assert.deepStrictEqual({
			values: JSON.parse(stdout),
			resolveCount: trace.match(/resolve "cache-test"/g)?.length,
			archiveLookupCount: trace.match(/archive pkg\.json/g)?.length,
			cacheHitCount: trace.match(/cache ->/g)?.length,
		}, {
			values: [1, 1, 1, 1],
			resolveCount: 4,
			archiveLookupCount: 2,
			cacheHitCount: 2,
		});
	});

	test('distinguishes conditions from import attributes in the resolution cache', async () => {
		const env: NodeJS.ProcessEnv = {
			...process.env,
			ELECTRON_RUN_AS_NODE: '1',
			VSCODE_ASAR_TRACE: packagedCollisionTracePath
		};
		delete env['NODE_OPTIONS'];
		delete env['VSCODE_DEV'];

		const { stdout } = await execFileAsync(process.execPath, [
			'--import',
			pathToFileURL(packagedBootstrapPath).href,
			packagedCollisionFixturePath
		], { env });
		const trace = await readFile(packagedCollisionTracePath, 'utf8');

		assert.deepStrictEqual({
			values: JSON.parse(stdout),
			resolveCount: trace.match(/resolve "cache-collision"/g)?.length,
			archiveLookupCount: trace.match(/archive pkg\.json/g)?.length,
			cacheHitCount: trace.match(/cache ->/g)?.length ?? 0,
		}, {
			values: ['condition', 'attribute'],
			resolveCount: 2,
			archiveLookupCount: 2,
			cacheHitCount: 0,
		});
	});
});
