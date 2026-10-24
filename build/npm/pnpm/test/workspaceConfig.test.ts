/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { suite, test } from 'node:test';
import { convertPackageJsonText } from '../installRoots.ts';
import { parseNpmLockfile, type NpmLockfile } from '../npmLockfile.ts';
import { computeWorkspaceSettings, convertNpmOverrides, getGeneratedOverrides, getPatchedDependencies, mergeAllowBuilds, parseOverrideKey, renderWorkspaceYaml, type ConfigNote, type NpmFolder } from '../workspaceConfig.ts';

const fixture = path.join(import.meta.dirname, 'fixtures', 'workspace');
const rootFolder: NpmFolder = {
	folder: '',
	packageJson: JSON.parse(fs.readFileSync(path.join(fixture, 'package.fixture.json'), 'utf8')),
	lockfile: parseNpmLockfile(fs.readFileSync(path.join(fixture, 'package-lock.fixture.json'), 'utf8')),
};

function lockfileWith(packages: Record<string, { version: string; dependencies?: Record<string, string> }>): NpmLockfile {
	return { lockfileVersion: 3, packages: { '': {}, ...packages } };
}

const exactOrCaret = (version: string, range: string) => range.startsWith('^') ? version.split('.')[0] === range.substring(1).split('.')[0] && version >= range.substring(1) : version === range;

suite('pnpm conversion: workspace configuration', () => {

	test('npm overrides become pnpm overrides', () => {
		assert.deepStrictEqual([...convertNpmOverrides({
			'a': '1.0.0',
			'b@2.1.1': { 'c': '7.1.0' },
			'd': { '.': '3.0.0', 'e': 'npm:e@1.2.0' },
		})], [
			['a', '1.0.0'],
			['b@2.1.1>c', '7.1.0'],
			['d', '3.0.0'],
			['d>e', 'npm:e@1.2.0'],
		]);
		assert.deepStrictEqual([parseOverrideKey('b@2.1.1>c'), parseOverrideKey('@s/d>@s/e'), parseOverrideKey('a')], [
			{ parent: { name: 'b', version: '2.1.1' }, name: 'c' },
			{ parent: { name: '@s/d' }, name: '@s/e' },
			{ parent: undefined, name: 'a' },
		]);
	});

	test('generated overrides keep file: mocks and dist-tags that npm locked', () => {
		const notes: ConfigNote[] = [];
		assert.deepStrictEqual([...getGeneratedOverrides('extensions/x', rootFolder.lockfile, notes)], [
			['a@1.2.0>mock', 'file:extensions/x/mocks/mock'],
			['a@1.2.0>tagged', '0.0.2-20'],
		]);
		assert.deepStrictEqual(notes.map(n => n.kind), ['dist-tag-direct', 'override-generated', 'override-generated']);
	});

	test('allowScripts of all folders are merged, denials win', () => {
		const notes: ConfigNote[] = [];
		const member: NpmFolder = { folder: 'm', packageJson: { allowScripts: { 'b': true, 'c@1.0.0': true } }, lockfile: lockfileWith({}) };
		assert.deepStrictEqual(mergeAllowBuilds([rootFolder, member], notes), { 'a@1.2.0': true, 'b': false, 'c@1.0.0': true });
		assert.deepStrictEqual(notes.map(n => n.kind), ['allow-builds-conflict']);
	});

	test('allowScripts keys of git dependencies become name and commit URL keys', () => {
		const sha = 'a34d15e895472003bf4a9cbc1bae77d56d1b9a4c';
		const folder: NpmFolder = {
			folder: 'npm',
			packageJson: { allowScripts: { [`github:microsoft/vsda#${sha}`]: true, 'github:microsoft/other#0123456789abcdef0123456789abcdef01234567': true, 'tool@1.0.0': true } },
			lockfile: { lockfileVersion: 3, packages: { 'node_modules/vsda': { version: '1.0.0', resolved: `git+ssh://git@github.com/microsoft/vsda.git#${sha}` } } },
		};
		const notes: ConfigNote[] = [];
		assert.deepStrictEqual({ allowBuilds: mergeAllowBuilds([folder], notes), notes: notes.map(n => n.kind) }, {
			allowBuilds: { 'tool@1.0.0': true, [`vsda@git+https://github.com/microsoft/vsda.git#${sha}`]: true },
			notes: ['allow-builds-git-unresolved'],
		});
	});

	test('a folder without allowScripts approves the install scripts that npm ran, unless a key decides them', () => {
		const lockfile: NpmLockfile = { lockfileVersion: 3, packages: {
			'node_modules/esbuild': { version: '0.27.2', hasInstallScript: true },
			'node_modules/plain': { version: '1.0.0' },
			'node_modules/denied': { version: '2.0.0', hasInstallScript: true },
		} };
		const notes: ConfigNote[] = [];
		const withDenial: NpmFolder = { folder: '', packageJson: { allowScripts: { 'denied': false } }, lockfile: lockfileWith({}) };
		const withoutAllowScripts: NpmFolder = { folder: 'm', packageJson: {}, lockfile };
		assert.deepStrictEqual({ allowBuilds: mergeAllowBuilds([withDenial, withoutAllowScripts], notes), notes: notes.map(n => n.message) }, {
			allowBuilds: { 'denied': false, 'esbuild@0.27.2': true },
			notes: ['esbuild@0.27.2: true (no allowScripts; npm ran its install script)'],
		});
	});

	test('member overrides are merged only when they change no other folder', () => {
		const notes: ConfigNote[] = [];
		const harmless: NpmFolder = { folder: 'm1', packageJson: { overrides: { 'lodash-es': '4.18.1' } }, lockfile: lockfileWith({ 'node_modules/lodash-es': { version: '4.18.1' } }) };
		const harmful: NpmFolder = { folder: 'm2', packageJson: { overrides: { 'zod': '3.25.76' } }, lockfile: lockfileWith({ 'node_modules/zod': { version: '3.25.76' } }) };
		const other: NpmFolder = { folder: 'm3', packageJson: {}, lockfile: lockfileWith({ 'node_modules/zod': { version: '4.4.3' }, 'node_modules/lodash-es': { version: '4.18.1' } }) };
		const settings = computeWorkspaceSettings([rootFolder, harmless, harmful, other], notes, exactOrCaret);
		assert.deepStrictEqual({ packages: settings.packages, overrides: settings.overrides, notes: notes.map(n => `${n.kind} ${n.folder}: ${n.message}`) }, {
			packages: ['m1', 'm2', 'm3'],
			overrides: {
				'b': '^2.0.0',
				'a@1.2.0>tagged': '0.0.2-20',
				'lodash-es': '4.18.1',
				'a@1.2.0>mock': 'file:mocks/mock',
			},
			notes: [
				'override-merged m1: lodash-es: 4.18.1',
				'override-dropped m2: zod: 3.25.76 would change other folders (m3 has zod@4.4.3); dropped',
				'dist-tag-direct : tool: latest is a dist-tag; the import uses npm\'s locked 0.1.1 and the lockfile keeps the specifier',
				'override-generated : a@1.2.0>mock: file:mocks/mock (npm satisfies mock@^2.0.0 with the project\'s file: folder)',
				'override-generated : a@1.2.0>tagged: 0.0.2-20 (npm locked the dist-tag next)',
			],
		});
	});

	test('pnpm-workspace.yaml is rendered in a fixed order', () => {
		assert.strictEqual(renderWorkspaceYaml({
			patchedDependencies: { 'foundry-local-sdk': 'build/npm/patches/foundry-local-sdk.patch' },
			overrides: { '@typescript-eslint/types': '8.66.0', 'kerberos@2.1.1>node-addon-api': '7.1.0' },
			allowBuilds: { 'node-pty@1.2.0-beta.18': true, 'husky': false },
			nodeLinker: 'hoisted',
			minimumReleaseAge: 10080,
			minimumReleaseAgeExclude: ['@vscode/*', 'electron'],
			packages: ['extensions/git', '.vscode/extensions/vscode-extras'],
		}), [
			'# Generated from the npm configuration by build/npm/pnpm/convert.ts during the npm to pnpm migration.',
			'# Setting names must be in knownSettingNames in build/npm/pnpm/workspaceConfig.ts.',
			'packages:',
			'  - extensions/git',
			'  - .vscode/extensions/vscode-extras',
			'nodeLinker: hoisted',
			'minimumReleaseAge: 10080',
			'minimumReleaseAgeExclude:',
			'  - \'@vscode/*\'',
			'  - electron',
			'allowBuilds:',
			'  node-pty@1.2.0-beta.18: true',
			'  husky: false',
			'overrides:',
			'  \'@typescript-eslint/types\': 8.66.0',
			'  kerberos@2.1.1>node-addon-api: 7.1.0',
			'patchedDependencies:',
			'  foundry-local-sdk: build/npm/patches/foundry-local-sdk.patch',
			'',
		].join('\n'));
	});

	test('a root gets the dependency patches of the packages its projects install, relative to the root', () => {
		const patches = { 'patched': 'build/npm/patches/patched.patch', 'absent': 'build/npm/patches/absent.patch' };
		const member: NpmFolder = { folder: 'remote/web', packageJson: {}, lockfile: lockfileWith({ 'node_modules/x/node_modules/patched': { version: '1.0.0' } }) };
		const remote: NpmFolder = { folder: 'remote', packageJson: {}, lockfile: lockfileWith({}) };
		assert.deepStrictEqual([
			getPatchedDependencies([remote, member], patches),
			getPatchedDependencies([remote], patches),
			computeWorkspaceSettings([remote, member], [], exactOrCaret, { dependencyPatches: patches }).patchedDependencies,
			computeWorkspaceSettings([remote], [], exactOrCaret, { dependencyPatches: patches }).patchedDependencies,
		], [
			{ 'patched': '../build/npm/patches/patched.patch' },
			{},
			{ 'patched': '../build/npm/patches/patched.patch' },
			undefined,
		]);
	});

	test('package.json keeps its formatting, loses npm-only fields and gets packageManager', () => {
		const text = '{\n  "name": "x",\n  "version": "1.0.0",\n  "overrides": {\n    "a": "1"\n  },\n  "allowScripts": {},\n  "dependencies": {\n    "a": "^1.0.0"\n  }\n}\n';
		assert.deepStrictEqual([
			convertPackageJsonText(text, { isInstallRoot: true }),
			convertPackageJsonText(text, { isInstallRoot: false }),
			convertPackageJsonText('{\n\t"private": true\n}', { isInstallRoot: true }),
		], [
			'{\n  "name": "x",\n  "version": "1.0.0",\n  "packageManager": "pnpm@11.28.8",\n  "dependencies": {\n    "a": "^1.0.0"\n  }\n}\n',
			'{\n  "name": "x",\n  "version": "1.0.0",\n  "dependencies": {\n    "a": "^1.0.0"\n  }\n}\n',
			'{\n\t"packageManager": "pnpm@11.28.8",\n\t"private": true\n}',
		]);
	});
});
