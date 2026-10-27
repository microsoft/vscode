/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test, type TestContext } from 'node:test';
import { createUniverse } from '../checks.ts';
import { computePins, getPinnedDistTags, getShadowWorkspace, restoreImporterSpecifiers, type LockfilePlan } from '../lockfileGenerator.ts';
import { exportFrozenLockfileOption, getNativeBuildEnv, readNpmrc } from '../nativeBuildEnv.ts';
import { parseNpmLockfile, type NpmLockfile } from '../npmLockfile.ts';
import { renderWorkspaceYaml, type NpmFolder } from '../workspaceConfig.ts';

const fixture = path.join(import.meta.dirname, 'fixtures', 'workspace');
const rootProject: NpmFolder = {
	folder: '',
	packageJson: JSON.parse(fs.readFileSync(path.join(fixture, 'package.fixture.json'), 'utf8')),
	lockfile: parseNpmLockfile(fs.readFileSync(path.join(fixture, 'package-lock.fixture.json'), 'utf8')),
};
const memberLockfile: NpmLockfile = { lockfileVersion: 3, packages: { '': {}, 'node_modules/b': { version: '2.0.0' }, 'node_modules/c': { version: '3.0.0' } } };
const member: NpmFolder = { folder: 'ext', packageJson: { dependencies: { c: '^3.0.0' } }, lockfile: memberLockfile };
const plan: LockfilePlan = {
	folder: '',
	sourceDir: fixture,
	projects: [rootProject, member],
	packageJsonTexts: new Map(),
	settings: { overrides: { 'b': '^2.0.0', 'x>mock': 'file:mocks/mock' } },
	workspaceYaml: '',
};

suite('pnpm conversion: lockfile generation', () => {

	test('pins: the root prefers its own versions, then the members\' versions of other packages; members also get override targets', () => {
		const pins = computePins(plan, createUniverse([rootProject.lockfile, memberLockfile]), (version, range) => range === '^2.0.0' && version.startsWith('2.'));
		assert.deepStrictEqual(Object.fromEntries([...pins].map(([folder, set]) => [folder, [...set].sort()])), {
			'': ['@scope/ts6@6.0.2', 'a@1.2.0', 'b@2.0.0', 'b@2.1.0', 'c@3.0.0', 'tagged@0.0.2-20', 'tool@0.1.1', 'ts-real@6.0.3'],
			'ext': ['b@2.0.0', 'b@2.1.0', 'c@3.0.0'],
		});
	});

	test('direct dist-tag dependencies are pinned for the import and restored in the lockfile', () => {
		const distTags = getPinnedDistTags(plan);
		assert.deepStrictEqual(distTags, [{ folder: '', importerId: '.', name: 'tool', specifier: 'latest', pinned: '0.1.1' }]);
		const lockfile = 'lockfileVersion: \'9.0\'\n\nimporters:\n\n  .:\n    devDependencies:\n      tool:\n        specifier: 0.1.1\n        version: 0.1.1\n\npackages:\n\n  tool@0.1.1:\n    resolution: {integrity: sha512-x}\n';
		assert.strictEqual(restoreImporterSpecifiers(lockfile, distTags), lockfile.replace('specifier: 0.1.1', 'specifier: latest'));
		assert.throws(() => restoreImporterSpecifiers(lockfile.replace('specifier: 0.1.1', 'specifier: 0.1.2'), distTags));
	});

	test('the temporary copy has no pnpmfile and its own copies of the patch files', () => {
		const patched: LockfilePlan = {
			...plan,
			folder: 'remote',
			sourceDir: '/repo/remote',
			settings: { nodeLinker: 'hoisted', patchedDependencies: { 'p': '../build/npm/patches/p.patch' } },
			workspaceYaml: 'pnpmfile: .pnpmfile.mts\nnodeLinker: hoisted\npatchedDependencies:\n  p: ../build/npm/patches/p.patch\n',
		};
		assert.deepStrictEqual([getShadowWorkspace(plan), getShadowWorkspace(patched)], [
			{ yaml: '', patchFiles: [] },
			{
				yaml: renderWorkspaceYaml({ nodeLinker: 'hoisted', patchedDependencies: { 'p': '.patches/p.patch' } }),
				patchFiles: [{ source: path.join('/repo/remote', '../build/npm/patches/p.patch'), target: '.patches/p.patch' }],
			},
		]);
	});
});

suite('pnpm conversion: native build environment', () => {

	function createRoot(t: TestContext, npmrc: string): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-native-build-env-'));
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		fs.writeFileSync(path.join(dir, '.npmrc'), npmrc);
		return dir;
	}

	test('reads .npmrc and clears native build keys it does not set', t => {
		// build/: no target in .npmrc, builds for the running Node.js on the host architecture
		const build = createRoot(t, '# comment\ndisturl="https://nodejs.org/dist"\nruntime="node"\nforce_process_config="true"\n');
		// remote/: builds for the remote server's Node.js version in .npmrc
		const remote = createRoot(t, 'disturl="https://nodejs.org/dist"\ntarget="24.22.1"\nruntime="node"\n');
		assert.deepStrictEqual(Object.fromEntries(readNpmrc(path.join(build, '.npmrc'))), { disturl: 'https://nodejs.org/dist', runtime: 'node', force_process_config: 'true' });
		assert.deepStrictEqual([
			getNativeBuildEnv(build, { forceProcessConfigOnDarwin: true, hostArch: true, runningNodeTarget: true }, 'darwin', 'arm64', '22.21.1'),
			getNativeBuildEnv(remote, { forceProcessConfigOnDarwin: true }, 'linux', 'x64', '22.21.1'),
		], [
			{
				npm_config_disturl: 'https://nodejs.org/dist',
				npm_config_target: '22.21.1',
				npm_config_ms_build_id: undefined,
				npm_config_runtime: 'node',
				npm_config_build_from_source: undefined,
				npm_config_force_process_config: 'true',
				npm_config_arch: 'arm64',
			},
			{
				npm_config_disturl: 'https://nodejs.org/dist',
				npm_config_target: '24.22.1',
				npm_config_ms_build_id: undefined,
				npm_config_runtime: 'node',
				npm_config_build_from_source: undefined,
				npm_config_force_process_config: undefined,
			},
		]);
	});

	test('exports the --frozen-lockfile option of the pnpm command for the nested installs', () => {
		const cases: [args: string, env?: NodeJS.ProcessEnv][] = [
			['install'],
			['install', { pnpm_config_frozen_lockfile: 'true' }],
			['install --frozen-lockfile'],
			['--frozen-lockfile i'],
			['install --frozen-lockfile=false'],
			['install --no-frozen-lockfile', { pnpm_config_frozen_lockfile: 'true' }],
			['run test -- --frozen-lockfile'],
			['ci'],
			['clean-install'],
			['ic'],
			['install-clean'],
			['-C /repo ci'],
			['ci --no-frozen-lockfile'],
			['ci --frozen-lockfile=false'],
			['add ci'],
			['run ci'],
			['help ci'],
		];
		assert.deepStrictEqual(cases.map(([args, env = {}]) => {
			exportFrozenLockfileOption(['/usr/bin/node', '/usr/bin/pnpm', ...args.split(' ')], env);
			return `${args}: ${env.pnpm_config_frozen_lockfile}`;
		}), [
			'install: undefined',
			'install: true',
			'install --frozen-lockfile: true',
			'--frozen-lockfile i: true',
			'install --frozen-lockfile=false: false',
			'install --no-frozen-lockfile: false',
			'run test -- --frozen-lockfile: undefined',
			'ci: true',
			'clean-install: true',
			'ic: true',
			'install-clean: true',
			'-C /repo ci: true',
			'ci --no-frozen-lockfile: false',
			'ci --frozen-lockfile=false: false',
			'add ci: undefined',
			'run ci: undefined',
			'help ci: undefined',
		]);
	});
});
