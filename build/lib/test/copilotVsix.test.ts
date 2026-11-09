/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import { getPackageArguments, getStagedDependencies, stagePackage } from '../copilotVsix.ts';

suite('copilotVsix', () => {

	test('stages dependencies in the hoisted layout relative to the extension, also those hoisted to a parent folder', () => {
		const extensions = path.join(os.tmpdir(), 'extensions');
		const extension = path.join(extensions, 'copilot');
		const store = path.join(extensions, 'node_modules', '.pnpm');
		const staged = getStagedDependencies(extension, [
			{ folder: path.join(extension, 'node_modules', '@github', 'copilot'), source: path.join(store, '@github+copilot@1.0.0', 'node_modules', '@github', 'copilot') },
			{ folder: path.join(extension, 'node_modules', 'a', 'node_modules', 'b'), source: path.join(store, 'b@2.0.0', 'node_modules', 'b') },
			{ folder: path.join(extensions, 'node_modules', 'b'), source: path.join(store, 'b@1.0.0', 'node_modules', 'b') },
		]);

		assert.deepStrictEqual([...staged].map(([folder, dependency]) => [folder, path.relative(store, dependency.source)]), [
			['node_modules/@github/copilot', path.join('@github+copilot@1.0.0', 'node_modules', '@github', 'copilot')],
			['node_modules/a/node_modules/b', path.join('b@2.0.0', 'node_modules', 'b')],
			['node_modules/b', path.join('b@1.0.0', 'node_modules', 'b')],
		]);
		assert.throws(() => getStagedDependencies(extension, [
			{ folder: path.join(extension, 'node_modules', 'b'), source: path.join(store, 'b@2.0.0', 'node_modules', 'b') },
			{ folder: path.join(extensions, 'node_modules', 'b'), source: path.join(store, 'b@1.0.0', 'node_modules', 'b') },
		]), /would both be staged at node_modules\/b/);
	});

	test('stages the files of a package without its node_modules folder', t => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-copilot-vsix-'));
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		const source = path.join(root, 'source');
		for (const file of ['package.json', 'bin/tool', 'lib/node_modules/vendored.js', 'node_modules/.bin/dependency', 'node_modules/nested/package.json']) {
			fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
			fs.writeFileSync(path.join(source, file), file);
		}
		fs.chmodSync(path.join(source, 'bin', 'tool'), 0o755);

		const target = path.join(root, 'target');
		stagePackage(source, target);

		const files = fs.readdirSync(target, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => path.relative(target, path.join(entry.parentPath, entry.name)));
		assert.deepStrictEqual({ files: files.sort(), mode: fs.statSync(path.join(target, 'bin', 'tool')).mode & 0o777 }, {
			files: [path.join('bin', 'tool'), path.join('lib', 'node_modules', 'vendored.js'), 'package.json'],
			mode: 0o755,
		});
	});

	test('resolves the output path of vsce against the current folder', () => {
		const cwd = path.join(os.tmpdir(), 'cwd');
		assert.deepStrictEqual([
			getPackageArguments(['-o', 'out/copilot.vsix', '--allow-package-secrets', 'sendgrid'], cwd),
			getPackageArguments(['--out=copilot.vsix'], cwd),
			getPackageArguments([], cwd),
		], [
			['-o', path.join(cwd, 'out', 'copilot.vsix'), '--allow-package-secrets', 'sendgrid'],
			[`--out=${path.join(cwd, 'copilot.vsix')}`],
			['--out', cwd],
		]);
	});
});
