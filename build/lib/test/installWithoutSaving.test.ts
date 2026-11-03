/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import { getFilesToRestore, installWithoutSaving, parseGroups } from '../../npm/installWithoutSaving.ts';

const repoRoot = path.join(import.meta.dirname, '..', '..', '..');

function scriptGroups(name: string) {
	const script: string = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts[name];
	return parseGroups(script.split(' ').slice(script.split(' ').indexOf('build/npm/installWithoutSaving.ts') + 1));
}

suite('installWithoutSaving', () => {

	test('restores the lockfile and workspace file of the install root that owns each folder', () => {
		assert.deepStrictEqual({
			folders: scriptGroups('install-local-component-explorer').map(group => group.folder),
			files: getFilesToRestore(scriptGroups('install-local-component-explorer').map(group => group.folder)),
			member: getFilesToRestore(['extensions/git']),
		}, {
			folders: ['.', 'build/rspack', 'build/vite'],
			files: [
				'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
				'build/rspack/package.json', 'build/rspack/pnpm-lock.yaml', 'build/rspack/pnpm-workspace.yaml',
				'build/vite/package.json', 'build/vite/pnpm-lock.yaml', 'build/vite/pnpm-workspace.yaml',
			],
			member: ['extensions/git/package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'],
		});
		assert.throws(() => getFilesToRestore(['not/a/project']), /not a pnpm project folder/);
	});

	test('puts back every changed file and removes files that pnpm created', t => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-install-without-saving-'));
		t.after(() => fs.rmSync(root, { recursive: true, force: true }));
		const original: Record<string, string> = {
			'package.json': '{"name":"root"}',
			'pnpm-lock.yaml': 'root lock',
			'pnpm-workspace.yaml': 'root workspace',
			'build/rspack/package.json': '{"name":"rspack"}',
			'build/rspack/pnpm-lock.yaml': 'rspack lock',
			'build/rspack/pnpm-workspace.yaml': 'rspack workspace',
			'build/vite/package.json': '{"name":"vite"}',
		};
		for (const [file, contents] of Object.entries(original)) {
			fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
			fs.writeFileSync(path.join(root, file), contents);
		}
		const calls: string[] = [];
		installWithoutSaving(parseGroups(['.', 'a.tgz', '--', 'build/rspack', 'b.tgz', '--', 'build/vite', 'c.tgz']), root, (folder, args) => {
			calls.push(`${folder}: ${args.join(' ')}`);
			const installRoot = folder === '.' ? '' : folder;
			fs.writeFileSync(path.join(root, folder, 'package.json'), 'changed');
			fs.writeFileSync(path.join(root, installRoot, 'pnpm-lock.yaml'), 'changed');
		});
		const after = Object.fromEntries(Object.keys(original).map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
		assert.deepStrictEqual({ calls, after, viteLockfile: fs.existsSync(path.join(root, 'build/vite/pnpm-lock.yaml')) }, {
			calls: ['.: add --workspace-root a.tgz', 'build/rspack: add b.tgz', 'build/vite: add c.tgz'],
			after: original,
			viteLockfile: false,
		});
	});
});
