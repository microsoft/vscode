/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { suite, test, type TestContext } from 'node:test';
import { prepareCloudSandbox, finishCloudSandbox } from '../../npm/cloudSandbox.ts';
import { isExpectedElectronInstalled } from '../electronVersion.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const packages = [
	'build-essential', 'ca-certificates', 'curl', 'pkg-config', 'python3', 'xz-utils',
	'libxkbfile-dev', 'libkrb5-dev', 'libgtk-3-dev', 'libgbm-dev', 'libnss3', 'libasound2-dev',
	'xvfb', 'rpm',
];
const installedPackages = packages.map(name => `${name} install ok installed`).join('\n');

function fixture(t: TestContext): string {
	const parent = path.join(repositoryRoot, '.build');
	fs.mkdirSync(parent, { recursive: true });
	const directory = fs.mkdtempSync(path.join(parent, 'cloud-sandbox-test-'));
	t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
	fs.writeFileSync(path.join(directory, '.nvmrc'), '24.18.0\n');
	fs.writeFileSync(path.join(directory, '.npmrc'), 'target="43.7.7"\nms_build_id="15553055"\n');
	return directory;
}

suite('Cloud Sandbox install setup', () => {
	for (const replacement of ['valid', 'bad-checksum', 'wrong-version']) {
		test(`repairs a stale Node cache only after replacement validation: ${replacement}`, t => {
			const root = fixture(t);
			const nodeDirectory = path.join(root, '.local/share/vscode-cloud-sandbox/node-v24.18.0-linux-x64');
			const cachedNode = path.join(nodeDirectory, 'bin/node');
			fs.mkdirSync(path.dirname(cachedNode), { recursive: true });
			fs.writeFileSync(cachedNode, 'stale');
			const archive = Buffer.from('replacement archive');
			const checksum = createHash('sha256').update(archive).digest('hex');
			const options = {
				root, home: root, platform: 'linux' as const, arch: 'x64', nodeVersion: '26.0.0',
				env: { GITHUB_ENVIRONMENT_ID: 'environment' },
				run: (command: string, args: readonly string[]) => {
					if (command === 'dpkg-query') {
						return installedPackages;
					}
					if (command === cachedNode) {
						return 'v22.20.0\n';
					}
					if (command === 'curl') {
						const url = args[args.indexOf('--output') - 1];
						fs.writeFileSync(args[args.indexOf('--output') + 1], url.endsWith('SHASUMS256.txt')
							? `${replacement === 'bad-checksum' ? 'invalid' : checksum}  node-v24.18.0-linux-x64.tar.xz\n` : archive);
					} else if (command === 'tar') {
						assert.equal(fs.readFileSync(cachedNode, 'utf8'), 'stale');
						const extracted = path.join(args[args.indexOf('-C') + 1], 'node-v24.18.0-linux-x64/bin');
						fs.mkdirSync(extracted, { recursive: true });
						fs.writeFileSync(path.join(extracted, 'node'), 'replacement');
					} else if (path.basename(command) === 'node') {
						assert.equal(fs.readFileSync(cachedNode, 'utf8'), 'stale');
						return replacement === 'wrong-version' ? 'v22.20.0\n' : 'v24.18.0\n';
					} else {
						throw new Error(`Unexpected command ${command}`);
					}
					return '';
				},
			};
			const message = replacement === 'valid' ? /export PATH=/ : replacement === 'bad-checksum'
				? /checksum verification failed/ : /downloaded Node.js version does not match/;
			assert.throws(() => prepareCloudSandbox(options), message);
			assert.deepStrictEqual({
				cached: fs.readFileSync(cachedNode, 'utf8'),
				directories: fs.readdirSync(path.dirname(nodeDirectory)),
			}, {
				cached: replacement === 'valid' ? 'replacement' : 'stale',
				directories: ['node-v24.18.0-linux-x64'],
			});
		});
	}

	test('does nothing outside Linux cloud sandboxes, without touching the filesystem', () => {
		const run = () => { throw new Error('A local install must not run sandbox commands.'); };
		for (const options of [
			{ platform: 'linux' as const, env: {} },
			{ platform: 'linux' as const, env: { GITHUB_ENVIRONMENT_ID: '' } },
			{ platform: 'linux' as const, env: { GITHUB_ENVIRONMENT_ID: ' ' } },
			{ platform: 'darwin' as const, env: { GITHUB_ENVIRONMENT_ID: 'environment' } },
			{ platform: 'win32' as const, env: { GITHUB_ENVIRONMENT_ID: 'environment' } },
			{ platform: 'linux' as const, env: { GH_TOKEN: 'not-a-sandbox-marker', CI: 'true', CODESPACES: 'true' } },
		]) {
			prepareCloudSandbox({ ...options, run, root: '/nonexistent' });
			finishCloudSandbox({ ...options, run, root: '/nonexistent' });
		}
	});

	test('only installs missing packages, using noninteractive sudo for non-root users', t => {
		const root = fixture(t);
		const calls: { command: string; args: readonly string[] }[] = [];
		const options = {
			root, platform: 'linux' as const, arch: 'x64', nodeVersion: '24.18.0',
			env: { GITHUB_ENVIRONMENT_ID: 'environment' },
			run: (command: string, args: readonly string[]) => {
				calls.push({ command, args });
				return command === 'dpkg-query' ? installedPackages.replace('xvfb install ok installed', 'xvfb deinstall ok config-files') : '1000\n';
			},
		};
		prepareCloudSandbox(options);
		assert.deepStrictEqual(calls, [
			{ command: 'dpkg-query', args: ['-W', '-f=${Package} ${Status}\\n'] },
			{ command: 'id', args: ['-u'] },
			{ command: 'sudo', args: ['-n', 'env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get', '-o', 'Acquire::Retries=3', '-o', 'DPkg::Lock::Timeout=120', 'update'] },
			{ command: 'sudo', args: ['-n', 'env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get', '-o', 'Acquire::Retries=3', '-o', 'DPkg::Lock::Timeout=120', 'install', '-y', '--no-install-recommends', 'xvfb'] },
		]);
	});

	test('does not use sudo as root and propagates prerequisite failures', t => {
		const root = fixture(t);
		const calls: string[] = [];
		assert.throws(() => prepareCloudSandbox({
			root, platform: 'linux', arch: 'x64', nodeVersion: '24.18.0', env: { GITHUB_ENVIRONMENT_ID: 'environment' },
			run: (command, args) => {
				calls.push(command);
				if (command === 'dpkg-query') {
					return '';
				}
				if (command === 'id') {
					return '0';
				}
				if (args.includes('install')) {
					throw new Error('apt install failed');
				}
				return '';
			},
		}), /apt install failed/);
		assert.deepStrictEqual(calls, ['dpkg-query', 'id', 'env', 'env']);
	});

	test('accepts the required Node patch version or newer versions of the same major', t => {
		const root = fixture(t);
		const calls: string[] = [];
		for (const nodeVersion of ['24.18.0', '24.18.1', '24.19.0']) {
			prepareCloudSandbox({
				root, platform: 'linux', arch: 'x64', nodeVersion, env: { GITHUB_ENVIRONMENT_ID: 'environment' },
				run: command => {
					calls.push(command);
					return installedPackages;
				},
			});
		}
		assert.deepStrictEqual(calls, ['dpkg-query', 'dpkg-query', 'dpkg-query']);
	});

	for (const nodeVersion of ['24.17.9', '22.20.0', '26.0.0']) {
		test(`installs Node for ${nodeVersion}, reports PATH instructions and stops until rerun`, t => {
			const root = fixture(t);
			const archive = Buffer.from('test Node archive');
			const checksum = createHash('sha256').update(archive).digest('hex');
			const downloads: string[] = [];
			const options = {
				root, home: root, platform: 'linux' as const, arch: 'arm64', nodeVersion, env: { GITHUB_ENVIRONMENT_ID: 'environment' },
				run: (command: string, args: readonly string[]) => {
					if (command === 'dpkg-query') {
						return installedPackages;
					}
					if (command === 'curl') {
						const url = args[args.indexOf('--output') - 1];
						downloads.push(url);
						fs.writeFileSync(args[args.indexOf('--output') + 1], url.endsWith('SHASUMS256.txt')
							? `${checksum}  node-v24.18.0-linux-arm64.tar.xz\n` : archive);
					} else if (command === 'tar') {
						const extracted = path.join(args[args.indexOf('-C') + 1], 'node-v24.18.0-linux-arm64', 'bin');
						fs.mkdirSync(extracted, { recursive: true });
						fs.writeFileSync(path.join(extracted, 'node'), '');
					} else if (path.basename(command) === 'node') {
						return 'v24.18.0\n';
					} else {
						throw new Error(`Unexpected command ${command}`);
					}
					return '';
				},
			};
			for (let attempt = 0; attempt < 2; attempt++) {
				assert.throws(() => prepareCloudSandbox(options), /export PATH='.*node-v24\.18\.0-linux-arm64\/bin':"\$PATH"\nhash -r/);
			}
			prepareCloudSandbox({ ...options, nodeVersion: '24.18.0' });
			assert.deepStrictEqual({
				downloads,
				files: fs.readdirSync(path.join(root, '.local/share/vscode-cloud-sandbox')),
			}, {
				downloads: [
					'https://nodejs.org/dist/v24.18.0/node-v24.18.0-linux-arm64.tar.xz',
					'https://nodejs.org/dist/v24.18.0/SHASUMS256.txt',
				],
				files: ['node-v24.18.0-linux-arm64'],
			});
		});
	}

	test('rejects a bad Node checksum and removes partial downloads', t => {
		const root = fixture(t);
		assert.throws(() => prepareCloudSandbox({
			root, home: root, platform: 'linux', arch: 'x64', nodeVersion: '26.0.0', env: { GITHUB_ENVIRONMENT_ID: 'environment' },
			run: (command, args) => {
				if (command === 'dpkg-query') {
					return installedPackages;
				}
				assert.equal(command, 'curl');
				fs.writeFileSync(args[args.indexOf('--output') + 1], 'invalid archive or checksums');
				return '';
			},
		}), /checksum verification failed/);
		assert.deepStrictEqual(fs.readdirSync(path.join(root, '.local/share/vscode-cloud-sandbox')), []);
	});

	test('removes partial Node downloads when the network fails', t => {
		const root = fixture(t);
		assert.throws(() => prepareCloudSandbox({
			root, home: root, platform: 'linux', arch: 'x64', nodeVersion: '26.0.0', env: { GITHUB_ENVIRONMENT_ID: 'environment' },
			run: command => {
				if (command === 'dpkg-query') {
					return installedPackages;
				}
				throw new Error('Node download failed');
			},
		}), /Node download failed/);
		assert.deepStrictEqual(fs.readdirSync(path.join(root, '.local/share/vscode-cloud-sandbox')), []);
	});

	test('rejects unsupported architectures and invalid required versions before installing packages', t => {
		const root = fixture(t);
		const options = {
			root, platform: 'linux' as const, arch: 'riscv64', env: { GITHUB_ENVIRONMENT_ID: 'environment' },
			run: () => { throw new Error('Must not install packages for invalid setup inputs.'); },
		};
		assert.throws(() => prepareCloudSandbox(options), /unsupported architecture riscv64/);
		fs.writeFileSync(path.join(root, '.nvmrc'), '24\n');
		assert.throws(() => prepareCloudSandbox({ ...options, arch: 'x64' }), /complete Node.js version/);
	});

	test('checks browser downloads on cached installs without repeating Playwright OS setup', t => {
		const root = fixture(t);
		const playwright = path.join(root, 'node_modules', 'playwright');
		fs.mkdirSync(playwright, { recursive: true });
		fs.writeFileSync(path.join(playwright, 'package.json'), '{"version":"1.56.0"}');
		const calls: { command: string; args: readonly string[] }[] = [];
		const options = {
			root, platform: 'linux' as const, arch: 'x64', env: { GITHUB_ENVIRONMENT_ID: 'environment' },
			run: (command: string, args: readonly string[]) => {
				calls.push({ command, args });
				return '';
			},
		};
		finishCloudSandbox(options);
		finishCloudSandbox(options);
		fs.writeFileSync(path.join(playwright, 'package.json'), '{"version":"1.57.0"}');
		finishCloudSandbox(options);
		finishCloudSandbox({ ...options, env: { GITHUB_ENVIRONMENT_ID: 'replacement' } });
		assert.deepStrictEqual(calls, [true, false, true, true].flatMap(withDeps => [
			{ command: 'npm', args: ['run', 'electron', '--', 'x64'] },
			{ command: 'npm', args: ['exec', '--', 'playwright', 'install', ...(withDeps ? ['--with-deps'] : [])] },
		]));
	});

	test('does not report success when browser setup fails', t => {
		const root = fixture(t);
		assert.throws(() => finishCloudSandbox({
			root, platform: 'linux', env: { GITHUB_ENVIRONMENT_ID: 'environment' },
			run: () => { throw new Error('Electron download failed'); },
		}), /Electron download failed/);
	});

	test('reuses the expected Electron cache offline and refreshes absent or stale versions', t => {
		const root = fixture(t);
		const versionFile = path.join(root, '.build/electron/version');
		fs.mkdirSync(path.dirname(versionFile), { recursive: true });
		fs.mkdirSync(path.join(root, 'node_modules/playwright'), { recursive: true });
		fs.writeFileSync(path.join(root, 'node_modules/playwright/package.json'), '{"version":"1.56.0"}');
		const results = [];
		for (const version of ['43.7.7', 'v43.7.7\n', '43.7.6', undefined]) {
			if (version === undefined) {
				fs.unlinkSync(versionFile);
			} else {
				fs.writeFileSync(versionFile, version);
			}
			const calls: string[][] = [];
			finishCloudSandbox({
				root, platform: 'linux', arch: 'x64', env: { GITHUB_ENVIRONMENT_ID: 'environment' },
				run: (command, args) => {
					assert.equal(command, 'npm');
					calls.push([...args]);
					if (args.includes('electron') && version?.trim().replace(/^v/, '') === '43.7.7') {
						throw new Error('Cached Electron must not need the network');
					}
					return '';
				},
			});
			results.push({ expectedInstalled: isExpectedElectronInstalled(root), calls });
		}
		assert.deepStrictEqual(results, [
			{ expectedInstalled: true, calls: [['exec', '--', 'playwright', 'install', '--with-deps']] },
			{ expectedInstalled: true, calls: [['exec', '--', 'playwright', 'install']] },
			{ expectedInstalled: false, calls: [['run', 'electron', '--', 'x64'], ['exec', '--', 'playwright', 'install']] },
			{ expectedInstalled: false, calls: [['run', 'electron', '--', 'x64'], ['exec', '--', 'playwright', 'install']] },
		]);
	});

	test('retries Playwright OS setup after failure rather than caching success', t => {
		const root = fixture(t);
		fs.mkdirSync(path.join(root, 'node_modules', 'playwright'), { recursive: true });
		fs.writeFileSync(path.join(root, 'node_modules', 'playwright', 'package.json'), '{"version":"1.56.0"}');
		const calls: string[][] = [];
		const options = {
			root, platform: 'linux' as const, env: { GITHUB_ENVIRONMENT_ID: 'environment' },
			run: (command: string, args: readonly string[]) => {
				if (args.includes('playwright')) {
					calls.push([...args]);
					throw new Error('Playwright prerequisites failed');
				}
				assert.equal(command, 'npm');
				return '';
			},
		};
		for (let attempt = 0; attempt < 2; attempt++) {
			assert.throws(() => finishCloudSandbox(options), /Playwright prerequisites failed/);
		}
		assert.deepStrictEqual({
			calls,
			saved: fs.existsSync(path.join(root, '.build', 'cloud-sandbox-playwright-deps')),
		}, {
			calls: Array.from({ length: 2 }, () => ['exec', '--', 'playwright', 'install', '--with-deps']),
			saved: false,
		});
	});

	test('npm install, npm ci and the install-fast cache path invoke sandbox setup', t => {
		const root = fixture(t);
		const npmDirectory = path.join(root, 'build/npm');
		fs.mkdirSync(npmDirectory, { recursive: true });
		for (const name of ['fast-install.ts', 'preinstall.ts', 'postinstall.ts']) {
			fs.copyFileSync(path.join(repositoryRoot, 'build/npm', name), path.join(npmDirectory, name));
		}
		fs.writeFileSync(path.join(npmDirectory, 'cloudSandbox.ts'), `
			import fs from 'node:fs';
			export function prepareCloudSandbox() { fs.appendFileSync('calls', 'prepare\\n'); return true; }
			export function finishCloudSandbox() { fs.appendFileSync('calls', 'finish\\n'); }
		`);
		fs.writeFileSync(path.join(npmDirectory, 'electronTypes.ts'), 'export async function ensureElectronTypes() {}');
		fs.writeFileSync(path.join(npmDirectory, 'dirs.ts'), 'export const dirs = [];');
		fs.writeFileSync(path.join(npmDirectory, 'installStateHash.ts'), `
			export const root = process.cwd(), stateFile = root + '/node_modules/.postinstall-state',
				stateContentsFile = root + '/node_modules/.postinstall-state-contents', forceInstallMessage = '';
			export function isUpToDate() { return true; }
			export function computeState() { return {}; }
			export function computeContents() { return {}; }
		`);
		fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
			name: 'sandbox-install-test', version: '1.0.0', type: 'module',
			scripts: {
				preinstall: 'node build/npm/preinstall.ts',
				postinstall: 'node build/npm/postinstall.ts',
				'install-fast': 'node build/npm/fast-install.ts',
			},
		}));
		fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({
			name: 'sandbox-install-test', version: '1.0.0', lockfileVersion: 3,
			packages: { '': { name: 'sandbox-install-test', version: '1.0.0', hasInstallScript: true } },
		}));
		const git = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8' });
		assert.equal(git.status, 0, git.stderr);
		const results = [];
		for (const args of [['install'], ['ci'], ['run', 'install-fast']]) {
			const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [...args, '--offline', '--no-audit', '--no-fund'], {
				cwd: root, encoding: 'utf8', timeout: 30_000, shell: process.platform === 'win32',
				env: { ...process.env, GITHUB_ENVIRONMENT_ID: '', npm_config_cache: path.join(root, 'cache'), npm_config_userconfig: path.join(root, 'user.npmrc'), VSCODE_FORCE_INSTALL: '', VSCODE_SKIP_NODE_VERSION_CHECK: '' },
			});
			assert.equal(result.status, 0, result.stdout + result.stderr);
			results.push(fs.readFileSync(path.join(root, 'calls'), 'utf8'));
			fs.unlinkSync(path.join(root, 'calls'));
		}
		assert.deepStrictEqual(results, ['prepare\nfinish\n', 'prepare\nfinish\n', 'prepare\nfinish\n']);

		if (process.platform === 'win32') {
			return; // The cold sandbox path is Linux-only and preinstall checks the host's Visual Studio on Windows.
		}
		const gyp = path.join(npmDirectory, 'gyp');
		fs.mkdirSync(gyp, { recursive: true });
		const gypPackage = {
			name: 'sandbox-gyp-test', version: '1.0.0', type: 'module',
			scripts: { install: 'node install.ts' },
		};
		fs.writeFileSync(path.join(gyp, 'package.json'), JSON.stringify(gypPackage));
		fs.writeFileSync(path.join(gyp, 'package-lock.json'), JSON.stringify({
			name: gypPackage.name, version: '1.0.0', lockfileVersion: 3,
			packages: { '': { name: gypPackage.name, version: '1.0.0', hasInstallScript: true } },
		}));
		fs.writeFileSync(path.join(gyp, 'install.ts'), `
			import fs from 'node:fs';
			fs.appendFileSync(${JSON.stringify(path.join(root, 'calls'))}, 'headers\\n');
		`);
		fs.writeFileSync(path.join(root, '.npmrc'), '');
		fs.mkdirSync(path.join(root, 'remote'));
		fs.writeFileSync(path.join(root, 'remote', '.npmrc'), '');
		fs.mkdirSync(path.join(root, '.github'));
		fs.writeFileSync(path.join(root, '.github', 'copilot-instructions.md'), '');
		fs.mkdirSync(path.join(root, '.agents', 'skills'), { recursive: true });
		const native = path.join(root, 'native');
		fs.mkdirSync(native);
		fs.writeFileSync(path.join(native, 'package.json'), JSON.stringify({
			name: 'sandbox-native-test', version: '1.0.0', type: 'module',
			scripts: { install: 'node install.ts' },
		}));
		fs.writeFileSync(path.join(native, 'install.ts'), `
			import fs from 'node:fs';
			const log = ${JSON.stringify(path.join(root, 'calls'))};
			if (!fs.existsSync(log) || !fs.readFileSync(log, 'utf8').includes('headers\\n')) {
				throw new Error('Native prerequisite not prepared before dependency installation');
			}
			fs.appendFileSync(log, 'native\\n');
		`);
		const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
		packageJson.dependencies = { 'sandbox-native-test': 'file:./native' };
		fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(packageJson));
		const options = {
			cwd: root, encoding: 'utf8' as const, timeout: 30_000,
			env: {
				...process.env, GITHUB_ENVIRONMENT_ID: '', VSCODE_FORCE_INSTALL: '', VSCODE_SKIP_NODE_VERSION_CHECK: '',
				npm_config_cache: path.join(root, 'cache'), npm_config_userconfig: path.join(root, 'user.npmrc'),
				npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
			},
		};
		const coldInstall = spawnSync('npm', ['install'], options);
		assert.notEqual(coldInstall.status, 0);
		assert.match(coldInstall.stderr, /Native prerequisite not prepared/);
		fs.rmSync(path.join(root, 'node_modules'), { recursive: true, force: true });
		const fastInstall = spawnSync('npm', ['run', 'install-fast', '--', '--force'], options);
		assert.equal(fastInstall.status, 0, fastInstall.stdout + fastInstall.stderr);
		assert.deepStrictEqual(fs.readFileSync(path.join(root, 'calls'), 'utf8').split('\n').filter(Boolean), [
			'prepare', 'prepare', 'headers', 'native', 'prepare', 'headers', 'finish',
		]);
	});
});
