/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import * as esbuild from 'esbuild';
import { findUndeclaredBundledPackages } from '../bundledPackages.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..', '..');

/**
 * Creates a project with pnpm's isolated layout: `a` (a dependency, which links its dependency `b`
 * next to it and requires the undeclared `h` from the store's hoisting folder), `d` (a
 * devDependency), `t` (a devDependency for types only) and `p` (a polyfill that isn't declared).
 */
function createProject(t: { after: (fn: () => void) => void }): string {
	const root = fs.mkdtempSync(path.join(import.meta.dirname, '.bundled-packages-test-'));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const write = (file: string, content: string | object) => {
		fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		fs.writeFileSync(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content));
	};
	const link = (target: string, file: string) => {
		fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		fs.symlinkSync(path.join(root, target), path.join(root, file), 'junction');
	};
	const addPackage = (name: string, code: string) => {
		write(`node_modules/.pnpm/${name}@1.0.0/node_modules/${name}/package.json`, { name, version: '1.0.0', type: 'module', main: 'index.js' });
		write(`node_modules/.pnpm/${name}@1.0.0/node_modules/${name}/index.js`, code);
	};

	write('package.json', { name: 'project', dependencies: { a: '1.0.0' }, devDependencies: { d: '1.0.0', t: '1.0.0' } });
	addPackage('a', `import b from 'b'; import h from 'h'; export default () => b + h;`);
	addPackage('b', `export default 'b';`);
	addPackage('h', `export default 'h';`);
	addPackage('d', `export default 'd';`);
	addPackage('t', `export default 't';`);
	addPackage('p', `export default 'p';`);
	link('node_modules/.pnpm/b@1.0.0/node_modules/b', 'node_modules/.pnpm/a@1.0.0/node_modules/b');
	link('node_modules/.pnpm/h@1.0.0/node_modules/h', 'node_modules/.pnpm/node_modules/h');
	for (const name of ['a', 'd', 't']) {
		link(`node_modules/.pnpm/${name}@1.0.0/node_modules/${name}`, `node_modules/${name}`);
	}
	write('src/main.ts', `import a from 'a'; import d from 'd'; import util from 'util'; import type { T } from 't'; export const value: T = [a(), d, util];`);
	write('src/test.ts', `import d from 'd'; export const value = d;`);
	return root;
}

async function check(root: string, entryPoints: string[], isShipped?: (output: string) => boolean): Promise<string[]> {
	const alias = { util: path.join(root, 'node_modules/.pnpm/p@1.0.0/node_modules/p') };
	const result = await esbuild.build({ absWorkingDir: root, entryPoints, bundle: true, platform: 'browser', format: 'esm', outdir: 'out', write: false, metafile: true, alias });
	const label = path.relative(repositoryRoot, root).split(path.sep).join('/');
	return findUndeclaredBundledPackages(result.metafile, { workingDirectory: root, project: root, aliases: Object.keys(alias), isShipped })
		.map(problem => problem.split(label).join('<project>'));
}

test('reports bundled devDependencies, undeclared aliases and hoisted imports, but not type-only imports', async t => {
	const root = createProject(t);
	assert.deepStrictEqual(await check(root, ['src/main.ts']), [
		`a@1.0.0 imports 'h' without declaring it, and gets h@1.0.0 from <project>/node_modules/.pnpm/node_modules/h. Declare it with packageExtensions in pnpm-workspace.yaml.`,
		`<project>: 'd' is bundled (d@1.0.0, imported by <project>/src/main.ts) but is a devDependency of <project>. Declare it in dependencies.`,
		`<project>: the build resolves 'util' to p@1.0.0, which isn't a production dependency of <project>.`,
	]);
});

test('ignores outputs that do not ship', async t => {
	const root = createProject(t);
	assert.deepStrictEqual(await check(root, ['src/test.ts'], output => !output.endsWith('test.js')), []);
});
