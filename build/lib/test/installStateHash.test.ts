/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { suite, test, type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

type InstallStateHash = typeof import('../../npm/installStateHash.ts');

async function fixture(t: TestContext): Promise<{ root: string; installStateHash: InstallStateHash }> {
	const parent = path.join(repositoryRoot, '.build');
	fs.mkdirSync(parent, { recursive: true });
	const root = fs.realpathSync.native(fs.mkdtempSync(path.join(parent, 'install-state-test-')));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));

	const npmDirectory = path.join(root, 'build/npm');
	fs.mkdirSync(npmDirectory, { recursive: true });
	fs.copyFileSync(path.join(repositoryRoot, 'build/npm/installStateHash.ts'), path.join(npmDirectory, 'installStateHash.ts'));
	fs.writeFileSync(path.join(npmDirectory, 'dirs.ts'), `export const dirs = ['', 'remote', 'extensions/git', 'extensions/empty'];`);

	fs.writeFileSync(path.join(root, '.nvmrc'), '24.18.0\n');
	for (const [dir, dependencies] of [['', { electron: '1.0.0' }], ['remote', { 'node-pty': '1.0.0' }], ['extensions/git', { 'which': '1.0.0' }], ['extensions/empty', {}]] as const) {
		const base = path.join(root, dir);
		fs.mkdirSync(base, { recursive: true });
		fs.writeFileSync(path.join(base, 'package.json'), JSON.stringify({ name: dir || 'root', type: 'module', dependencies }));
		fs.writeFileSync(path.join(base, 'package-lock.json'), JSON.stringify({ name: dir || 'root', lockfileVersion: 3, packages: {} }));
		fs.writeFileSync(path.join(base, '.npmrc'), 'target="1.0.0"\n');
		if (Object.keys(dependencies).length > 0) {
			fs.mkdirSync(path.join(base, 'node_modules'));
		}
	}

	const installStateHash: InstallStateHash = await import(pathToFileURL(path.join(npmDirectory, 'installStateHash.ts')).href);
	return { root, installStateHash };
}

suite('npm install state', () => {
	test('reports only the directories whose dependencies need to be installed', async t => {
		const { root, installStateHash } = await fixture(t);
		const { getOutdatedDirs, computeState, stateFile } = installStateHash;
		const saveState = () => fs.writeFileSync(stateFile, JSON.stringify(computeState()));
		const withChange = (file: string, content: string) => {
			const original = fs.readFileSync(path.join(root, file), 'utf8');
			fs.writeFileSync(path.join(root, file), content);
			const outdated = getOutdatedDirs();
			fs.writeFileSync(path.join(root, file), original);
			return outdated;
		};

		const withoutState = getOutdatedDirs();
		saveState();
		const upToDate = getOutdatedDirs();
		const lockfileChanged = withChange('extensions/git/package-lock.json', JSON.stringify({ name: 'extensions/git', lockfileVersion: 3, packages: { 'node_modules/which': {} } }));
		const versionOnlyLockfileChange = withChange('remote/package-lock.json', JSON.stringify({ name: 'remote', version: '2.0.0', lockfileVersion: 3, packages: {} }));
		const npmrcChanged = withChange('remote/.npmrc', 'target="2.0.0"\n');
		const nodeVersionChanged = withChange('.nvmrc', '26.0.0\n');
		fs.rmSync(path.join(root, 'remote/node_modules'), { recursive: true });
		const nodeModulesMissing = getOutdatedDirs();

		assert.deepStrictEqual({
			withoutState,
			upToDate,
			lockfileChanged,
			versionOnlyLockfileChange,
			npmrcChanged,
			nodeVersionChanged,
			nodeModulesMissing,
		}, {
			withoutState: ['', 'remote', 'extensions/git', 'extensions/empty'],
			upToDate: [],
			lockfileChanged: ['extensions/git'],
			versionOnlyLockfileChange: [],
			npmrcChanged: ['remote'],
			nodeVersionChanged: ['', 'remote', 'extensions/git', 'extensions/empty'],
			nodeModulesMissing: ['remote'],
		});
	});
});
