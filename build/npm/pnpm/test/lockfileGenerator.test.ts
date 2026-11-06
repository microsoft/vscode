/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test, type TestContext } from 'node:test';
import { parsePnpmLockfile } from '../../../lib/pnpmLock.ts';
import { createUniverse } from '../checks.ts';
import { addPnpmfileChecksum, computePins, getPinnedDistTags, getPnpmfileChecksum, getShadowWorkspace, restoreImporterSpecifiers, type LockfilePlan } from '../lockfileGenerator.ts';
import { createNativeBuildHooks, getNativeBuildEnv, getNativeBuildExtraEnv, readNativeBuildConfig, type NativeBuildConfig } from '../nativeBuildEnv.ts';
import { parseNpmLockfile, type NpmLockfile } from '../npmLockfile.ts';
import { checkPnpmfileChecksum } from '../verify-locks.ts';
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
			workspaceYaml: 'pnpmfile: .pnpmfile.mjs\nnodeLinker: hoisted\npatchedDependencies:\n  p: ../build/npm/patches/p.patch\n',
		};
		assert.deepStrictEqual([getShadowWorkspace(plan), getShadowWorkspace(patched)], [
			{ yaml: '', patchFiles: [] },
			{
				yaml: renderWorkspaceYaml({ nodeLinker: 'hoisted', patchedDependencies: { 'p': '.patches/p.patch' } }),
				patchFiles: [{ source: path.join('/repo/remote', '../build/npm/patches/p.patch'), target: '.patches/p.patch' }],
			},
		]);
	});

	test('the lockfile gets the checksum that pnpm records for the pnpmfile', t => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pnpmfile-checksum-'));
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		// pnpm 12.16.0 records this checksum for this pnpmfile, with LF and with CRLF line endings
		fs.writeFileSync(path.join(dir, 'lf.mjs'), 'export const hooks = { updateConfig(c) { return c; } };\n');
		fs.writeFileSync(path.join(dir, 'crlf.mjs'), 'export const hooks = { updateConfig(c) { return c; } };\r\n');
		const checksum = 'sha256-+FsN8NjyKs0W8ycSINvHQMEHDbbLZbkDHyZzLZ504ZQ=';
		const withPatches = 'lockfileVersion: \'9.0\'\n\noverrides:\n  a: 1.0.0\n\npatchedDependencies:\n  a: 0123\n\nimporters:\n  .: {}\n';
		const withoutPatches = 'lockfileVersion: \'9.0\'\n\nimporters:\n  .: {}\n';
		const lockfile = parsePnpmLockfile(addPnpmfileChecksum(withoutPatches, checksum));
		assert.deepStrictEqual([
			getPnpmfileChecksum(dir, { pnpmfile: 'lf.mjs' }),
			getPnpmfileChecksum(dir, { pnpmfile: 'crlf.mjs' }),
			getPnpmfileChecksum(dir, {}),
			addPnpmfileChecksum(withPatches, checksum),
			addPnpmfileChecksum(withoutPatches, checksum),
			checkPnpmfileChecksum(lockfile, dir, { pnpmfile: 'crlf.mjs' }, 'r').length,
			checkPnpmfileChecksum(lockfile, dir, {}, 'r').map(f => f.severity),
			checkPnpmfileChecksum(parsePnpmLockfile(withoutPatches), dir, {}, 'r').length,
		], [
			checksum,
			checksum,
			undefined,
			`lockfileVersion: '9.0'\n\noverrides:\n  a: 1.0.0\n\npnpmfileChecksum: ${checksum}\n\npatchedDependencies:\n  a: 0123\n\nimporters:\n  .: {}\n`,
			`lockfileVersion: '9.0'\n\npnpmfileChecksum: ${checksum}\n\nimporters:\n  .: {}\n`,
			0,
			['error'],
			0,
		]);
	});
});

suite('pnpm conversion: native build environment', () => {

	function createRoot(t: TestContext, nativeBuild: NativeBuildConfig | undefined): string {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-native-build-env-'));
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
		fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'root', nativeBuild }));
		return dir;
	}

	// build/: no target, builds for the running Node.js on the host architecture
	const build: NativeBuildConfig = { runtime: 'node', disturl: 'https://nodejs.org/dist', buildFromSource: true, forceProcessConfig: true };
	// remote/: builds for the remote server's Node.js version
	const remote: NativeBuildConfig = { runtime: 'node', target: '24.22.1', disturl: 'https://nodejs.org/dist', msBuildId: '488038', buildFromSource: true, forceProcessConfig: true };
	// root: builds for Electron
	const electron: NativeBuildConfig = { runtime: 'electron', target: '43.8.3', disturl: 'https://electronjs.org/headers', msBuildId: '15784459', buildFromSource: true };

	test('reads the nativeBuild field of package.json and clears native build keys it does not set', t => {
		const buildRoot = createRoot(t, build);
		const remoteRoot = createRoot(t, remote);
		assert.deepStrictEqual([
			readNativeBuildConfig(buildRoot),
			readNativeBuildConfig(createRoot(t, undefined)),
			getNativeBuildEnv(buildRoot, { hostArch: true, runningNodeTarget: true }, 'darwin', 'arm64', '22.21.1'),
			getNativeBuildEnv(remoteRoot, {}, 'linux', 'x64', '22.21.1'),
			getNativeBuildEnv(createRoot(t, electron), {}, 'darwin', 'arm64', '22.21.1'),
		], [
			build,
			undefined,
			{
				npm_config_disturl: 'https://nodejs.org/dist',
				npm_config_target: '22.21.1',
				npm_config_ms_build_id: undefined,
				npm_config_runtime: 'node',
				npm_config_build_from_source: 'true',
				npm_config_force_process_config: 'true',
				npm_config_arch: 'arm64',
			},
			{
				npm_config_disturl: 'https://nodejs.org/dist',
				npm_config_target: '24.22.1',
				npm_config_ms_build_id: '488038',
				npm_config_runtime: 'node',
				npm_config_build_from_source: 'true',
				// process.config only has the clang settings that node-gyp needs on macOS
				npm_config_force_process_config: undefined,
			},
			{
				npm_config_disturl: 'https://electronjs.org/headers',
				npm_config_target: '43.8.3',
				npm_config_ms_build_id: '15784459',
				npm_config_runtime: 'electron',
				npm_config_build_from_source: 'true',
				npm_config_force_process_config: undefined,
			},
		]);
	});

	test('rejects an invalid nativeBuild field', t => {
		const messages = [
			'not an object',
			{ runtime: 'electron', disturl: 'x', ms_build_id: '1' },
			{ runtime: 'electron', disturl: 'x', buildFromSource: 'true' },
			{ runtime: 'bun', disturl: 'x' },
			{ runtime: 'node' },
		].map(nativeBuild => {
			const dir = createRoot(t, nativeBuild as unknown as NativeBuildConfig);
			try {
				getNativeBuildEnv(dir);
				return 'no error';
			} catch (error) {
				return (error as Error).message.replace(`Invalid nativeBuild field in ${path.join(dir, 'package.json')}: `, '').replace('. See NativeBuildConfig in build/npm/pnpm/nativeBuildEnv.ts.', '');
			}
		});
		assert.deepStrictEqual(messages, [
			'expected an object',
			'unknown property "ms_build_id"',
			'"buildFromSource" must be a boolean',
			'"runtime" must be "electron" or "node"',
			'"disturl" is required',
		]);
	});

	test('passes the native build variables as extraEnv, with empty values for keys to clear', t => {
		const remoteRoot = createRoot(t, { runtime: 'node', target: '24.22.1', disturl: 'https://nodejs.org/dist' });
		// The root postinstall installs remote/ with the root's Electron variables in its environment:
		// the keys that the nativeBuild field of remote/package.json doesn't set get empty values instead
		assert.deepStrictEqual(getNativeBuildExtraEnv(remoteRoot, {}, { npm_command: 'install', other: 'kept' }, 'linux', 'x64', '22.21.1'), {
			npm_command: 'install',
			other: 'kept',
			npm_config_disturl: 'https://nodejs.org/dist',
			npm_config_target: '24.22.1',
			npm_config_ms_build_id: '',
			npm_config_runtime: 'node',
			npm_config_build_from_source: '',
			npm_config_force_process_config: '',
		});
	});

	test('passes the frozen lockfile of pnpm ci on to the nested installs', t => {
		const root = createRoot(t, electron);
		const frozen = (command: string, exportFrozenLockfileOfCi: boolean) => getNativeBuildExtraEnv(root, { exportFrozenLockfileOfCi }, { npm_command: command }, 'linux', 'x64', '22.21.1').pnpm_config_frozen_lockfile;
		// pnpm reports `pnpm ci` and its aliases (clean-install, ic, install-clean) as `ci`, and
		// `pnpm install --frozen-lockfile` as `install`.
		assert.deepStrictEqual([frozen('ci', true), frozen('install', true), frozen('add', true), frozen('ci', false)], ['true', undefined, undefined, undefined]);
	});

	test('the updateConfig hook keeps the rest of the configuration', t => {
		const root = createRoot(t, electron);
		const config = createNativeBuildHooks(root, { exportFrozenLockfileOfCi: true }).updateConfig({ nodeLinker: 'hoisted', extraEnv: { npm_command: 'ci' } });
		assert.deepStrictEqual([config.nodeLinker, config.extraEnv?.npm_command, config.extraEnv?.npm_config_runtime, config.extraEnv?.pnpm_config_frozen_lockfile], ['hoisted', 'ci', 'electron', 'true']);
	});
});
