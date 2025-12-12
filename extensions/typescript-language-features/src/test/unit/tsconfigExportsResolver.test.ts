/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { resolveNodeModulePathUsingExports } from '../../languageFeatures/tsconfig';

suite('resolveNodeModulePathUsingExports', () => {
	let root: vscode.Uri;

	setup(async () => {
		root = vscode.Uri.file(path.join(os.tmpdir(), `vscode-tsconfig-exports-${Date.now()}-${Math.random().toString(16).slice(2)}`));
		await vscode.workspace.fs.createDirectory(root);
	});

	teardown(async () => {
		try {
			await vscode.workspace.fs.delete(root, { recursive: true, useTrash: false });
		} catch {
			// noop
		}
	});

	test('resolves an exports subpath mapping from package.json in node_modules', async () => {
		const baseDir = vscode.Uri.joinPath(root, 'a', 'b', 'c');
		await vscode.workspace.fs.createDirectory(baseDir);

		const packageRoot = vscode.Uri.joinPath(root, 'node_modules', 'pkg');
		await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(packageRoot, 'configs'));

		await writeFile(
			vscode.Uri.joinPath(packageRoot, 'package.json'),
			`{\n\t// jsonc comment\n\t\"name\": \"pkg\",\n\t\"exports\": {\n\t\t\"./base/tsconfig.json\": \"./configs/base.json\",\n\t},\n}\n`);

		const expected = vscode.Uri.joinPath(packageRoot, 'configs', 'base.json');
		await writeFile(expected, '{}');

		const resolved = await resolveNodeModulePathUsingExports(baseDir, 'pkg/base/tsconfig.json');
		assert.ok(resolved);
		assert.strictEqual(resolved!.fsPath, expected.fsPath);
	});

	test('resolves wildcard exports patterns', async () => {
		const baseDir = vscode.Uri.joinPath(root, 'project', 'src');
		await vscode.workspace.fs.createDirectory(baseDir);

		const packageRoot = vscode.Uri.joinPath(root, 'node_modules', 'pkg');
		await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(packageRoot, 'configs', 'base'));

		await writeFile(
			vscode.Uri.joinPath(packageRoot, 'package.json'),
			JSON.stringify({
				name: 'pkg',
				exports: {
					'./*/tsconfig.json': './configs/*/tsconfig.json'
				}
			}, undefined, '\t'));

		const expected = vscode.Uri.joinPath(packageRoot, 'configs', 'base', 'tsconfig.json');
		await writeFile(expected, '{}');

		const resolved = await resolveNodeModulePathUsingExports(baseDir, 'pkg/base/tsconfig.json');
		assert.ok(resolved);
		assert.strictEqual(resolved!.fsPath, expected.fsPath);
	});

	test('prefers node+import but falls back to node+require when import target is invalid', async () => {
		const baseDir = vscode.Uri.joinPath(root, 'app');
		await vscode.workspace.fs.createDirectory(baseDir);

		const packageRoot = vscode.Uri.joinPath(root, 'node_modules', 'pkg');
		await vscode.workspace.fs.createDirectory(packageRoot);

		await writeFile(
			vscode.Uri.joinPath(packageRoot, 'package.json'),
			JSON.stringify({
				name: 'pkg',
				exports: {
					node: {
						import: 'bad.js',
						require: './ok.cjs'
					}
				}
			}, undefined, '\t'));

		const expected = vscode.Uri.joinPath(packageRoot, 'ok.cjs');
		await writeFile(expected, '');

		const resolved = await resolveNodeModulePathUsingExports(baseDir, 'pkg');
		assert.ok(resolved);
		assert.strictEqual(resolved!.fsPath, expected.fsPath);
	});

	test('returns undefined when package.json has no exports', async () => {
		const baseDir = vscode.Uri.joinPath(root, 'app');
		await vscode.workspace.fs.createDirectory(baseDir);

		const packageRoot = vscode.Uri.joinPath(root, 'node_modules', 'pkg');
		await vscode.workspace.fs.createDirectory(packageRoot);
		await writeFile(vscode.Uri.joinPath(packageRoot, 'package.json'), JSON.stringify({ name: 'pkg' }));

		const resolved = await resolveNodeModulePathUsingExports(baseDir, 'pkg/base/tsconfig.json');
		assert.strictEqual(resolved, undefined);
	});

	test('returns undefined when the package cannot be found in node_modules', async () => {
		const baseDir = vscode.Uri.joinPath(root, 'app');
		await vscode.workspace.fs.createDirectory(baseDir);

		const resolved = await resolveNodeModulePathUsingExports(baseDir, 'missing/base/tsconfig.json');
		assert.strictEqual(resolved, undefined);
	});

	test('returns undefined when the resolved exports target does not exist on disk', async () => {
		const baseDir = vscode.Uri.joinPath(root, 'app');
		await vscode.workspace.fs.createDirectory(baseDir);

		const packageRoot = vscode.Uri.joinPath(root, 'node_modules', 'pkg');
		await vscode.workspace.fs.createDirectory(packageRoot);
		await writeFile(
			vscode.Uri.joinPath(packageRoot, 'package.json'),
			JSON.stringify({
				name: 'pkg',
				exports: {
					'./base/tsconfig.json': './missing.json'
				}
			}, undefined, '\t'));

		const resolved = await resolveNodeModulePathUsingExports(baseDir, 'pkg/base/tsconfig.json');
		assert.strictEqual(resolved, undefined);
	});
});

async function writeFile(uri: vscode.Uri, contents: string): Promise<void> {
	await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(contents));
}
