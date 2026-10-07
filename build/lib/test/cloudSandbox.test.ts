/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { suite, test, type TestContext } from 'node:test';
import { prepareCloudSandbox, raiseCloudSandboxFileLimit, finishCloudSandbox } from '../../npm/cloudSandbox.ts';
import { isExpectedElectronInstalled } from '../electronVersion.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const packages = [
	'build-essential', 'ca-certificates', 'curl', 'pkg-config', 'python3', 'util-linux', 'xz-utils',
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
	fs.mkdirSync(path.join(directory, 'host-bin'));
	for (const executable of ['node', 'npm', 'npx']) {
		fs.writeFileSync(path.join(directory, 'host-bin', executable), '', { mode: 0o755 });
	}
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
				env: { GITHUB_ENVIRONMENT_ID: 'environment', PATH: path.join(root, 'host-bin') },
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
						for (const executable of ['node', 'npm', 'npx']) {
							fs.writeFileSync(path.join(extracted, executable), 'replacement', { mode: 0o755 });
						}
					} else if (path.basename(command) === 'node') {
						if (command !== 'node') {
							assert.equal(fs.readFileSync(cachedNode, 'utf8'), 'stale');
						}
						return replacement === 'wrong-version' ? 'v22.20.0\n' : 'v24.18.0\n';
					} else {
						throw new Error(`Unexpected command ${command}`);
					}
					return '';
				},
			};
			if (replacement === 'valid') {
				assert.equal(prepareCloudSandbox(options), cachedNode);
			} else {
				assert.throws(() => prepareCloudSandbox(options), replacement === 'bad-checksum'
					? /checksum verification failed/ : /downloaded Node.js version does not match/);
			}
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
			raiseCloudSandboxFileLimit(0, { ...options, run, root: '/nonexistent' });
			finishCloudSandbox({ ...options, run, root: '/nonexistent' });
		}
	});

	test('raises the sandbox process soft limit, preserves the hard limit, and verifies the result', () => {
		const calls: { command: string; args: readonly string[] }[] = [];
		const responses = ['1024 2097152', '1048576 2097152'];
		raiseCloudSandboxFileLimit(4321, {
			platform: 'linux', env: { GITHUB_ENVIRONMENT_ID: 'environment' },
			run: (command, args, captureOutput) => {
				calls.push({ command, args });
				return captureOutput ? responses.shift()! : '';
			},
		});
		const query = ['--pid', '4321', '--nofile', '--noheadings', '--raw', '--output', 'SOFT,HARD'];
		assert.deepStrictEqual(calls, [
			{ command: 'prlimit', args: query },
			{ command: 'prlimit', args: ['--pid', '4321', '--nofile=1048576:'] },
			{ command: 'prlimit', args: query },
		]);
	});

	test('leaves sufficient or unlimited soft limits unchanged', () => {
		const calls: string[][] = [];
		for (const limits of ['1048576 1048576', '2097152 2097152', 'unlimited unlimited']) {
			raiseCloudSandboxFileLimit(4321, {
				platform: 'linux', env: { GITHUB_ENVIRONMENT_ID: 'environment' },
				run: (_command, args) => { calls.push([...args]); return limits; },
			});
		}
		assert.deepStrictEqual(calls, Array.from({ length: 3 }, () => ['--pid', '4321', '--nofile', '--noheadings', '--raw', '--output', 'SOFT,HARD']));
	});

	test('raises a too-low hard limit along with the soft limit', () => {
		const calls: string[][] = [];
		const responses = ['1024 4096', '1048576 1048576'];
		raiseCloudSandboxFileLimit(4321, {
			platform: 'linux', env: { GITHUB_ENVIRONMENT_ID: 'environment' },
			run: (_command, args, captureOutput) => {
				calls.push([...args]);
				return captureOutput ? responses.shift()! : '';
			},
		});
		assert.deepStrictEqual(calls[1], ['--pid', '4321', '--nofile=1048576:1048576']);
	});

	test('rejects unsafe target IDs and malformed limit responses', () => {
		const options = { platform: 'linux' as const, env: { GITHUB_ENVIRONMENT_ID: 'environment' } };
		for (const pid of [0, 1, -1, NaN, 1.5]) {
			assert.throws(() => raiseCloudSandboxFileLimit(pid, {
				...options, run: () => { throw new Error('Invalid target must not run prlimit'); },
			}), /process ID greater than 1/);
		}
		for (const output of ['', 'invalid response', '1024', '1024 1048576 unexpected']) {
			assert.throws(() => raiseCloudSandboxFileLimit(4321, {
				...options, run: () => output,
			}), /unable to read file-descriptor limits/);
		}
	});

	test('reports denied or ineffective file-limit updates rather than continuing', () => {
		for (const denied of [true, false]) {
			assert.throws(() => raiseCloudSandboxFileLimit(4321, {
				platform: 'linux', env: { GITHUB_ENVIRONMENT_ID: 'environment' },
				run: (_command, _args, captureOutput) => {
					if (!captureOutput && denied) {
						throw new Error('prlimit permission denied');
					}
					return '1024 1048576';
				},
			}), denied ? /permission denied/ : /still has a file-descriptor limit below/);
		}
	});

	test('future child commands inherit the raised limit on Linux', t => {
		if (process.platform !== 'linux') {
			t.skip('prlimit and Linux process limits are required.');
			return;
		}
		const root = fixture(t);
		const script = path.join(root, 'file-limit-inheritance.ts');
		fs.writeFileSync(script, `
			import { execFileSync, spawnSync } from 'node:child_process';
			import { raiseCloudSandboxFileLimit } from ${JSON.stringify(new URL('../../npm/cloudSandbox.ts', import.meta.url).href)};
			const hard = execFileSync('prlimit', ['--pid', String(process.pid), '--nofile', '--noheadings', '--raw', '--output', 'HARD'], { encoding: 'utf8' }).trim();
			if (hard !== 'unlimited' && Number(hard) < 1048576) {
				const probe = spawnSync('prlimit', ['--pid', String(process.pid), '--nofile=1048576:1048576'], {
					encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' },
				});
				if (probe.status === 1 && probe.stderr.includes('Operation not permitted')) {
					console.error('The Linux host cannot raise its hard file limit of ' + hard + ' to 1048576.');
					process.exit(77);
				}
				if (probe.status !== 0) {
					throw probe.error ?? new Error(probe.stderr);
				}
			}
			execFileSync('prlimit', ['--pid', String(process.pid), '--nofile=1024:']);
			raiseCloudSandboxFileLimit(process.pid, { env: { ...process.env, GITHUB_ENVIRONMENT_ID: 'test-environment' } });
			const inherited = execFileSync('/bin/sh', ['-c', 'ulimit -Sn'], { encoding: 'utf8' }).trim();
			console.log(JSON.stringify({ inherited }));
		`);
		const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 10_000 });
		if (result.status === 77) {
			t.skip(result.stderr.trim());
			return;
		}
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.deepStrictEqual(JSON.parse(result.stdout.trim().split('\n').at(-1)!), { inherited: '1048576' });
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
		test(`installs Node for ${nodeVersion} and continues without PATH changes in the parent`, t => {
			const root = fixture(t);
			const archive = Buffer.from('test Node archive');
			const checksum = createHash('sha256').update(archive).digest('hex');
			const downloads: string[] = [];
			const options = {
				root, home: root, platform: 'linux' as const, arch: 'arm64', nodeVersion,
				env: { GITHUB_ENVIRONMENT_ID: 'environment', PATH: path.join(root, 'host-bin') },
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
						for (const executable of ['node', 'npm', 'npx']) {
							fs.writeFileSync(path.join(extracted, executable), '', { mode: 0o755 });
						}
					} else if (path.basename(command) === 'node') {
						return 'v24.18.0\n';
					} else {
						throw new Error(`Unexpected command ${command}`);
					}
					return '';
				},
			};
			const nodeBin = path.join(root, '.local/share/vscode-cloud-sandbox/node-v24.18.0-linux-arm64/bin');
			for (let attempt = 0; attempt < 2; attempt++) {
				assert.equal(prepareCloudSandbox(options), path.join(nodeBin, 'node'));
			}
			prepareCloudSandbox({ ...options, nodeVersion: '24.18.0' });
			assert.deepStrictEqual({
				downloads,
				files: fs.readdirSync(path.join(root, '.local/share/vscode-cloud-sandbox')),
				links: ['node', 'npm', 'npx'].map(executable => fs.readlinkSync(path.join(root, 'host-bin', executable))),
			}, {
				downloads: [
					'https://nodejs.org/dist/v24.18.0/node-v24.18.0-linux-arm64.tar.xz',
					'https://nodejs.org/dist/v24.18.0/SHASUMS256.txt',
				],
				files: ['node-v24.18.0-linux-arm64'],
				links: ['node', 'npm', 'npx'].map(executable => path.join(nodeBin, executable)),
			});
		});
	}

	for (const unusable of ['missing', 'non-executable']) {
		test(`validates cached npx before replacing any host executable (${unusable})`, t => {
			const root = fixture(t);
			const bin = path.join(root, '.local/share/vscode-cloud-sandbox/node-v24.18.0-linux-x64/bin');
			fs.mkdirSync(bin, { recursive: true });
			for (const executable of ['node', 'npm']) {
				fs.writeFileSync(path.join(bin, executable), '', { mode: 0o755 });
			}
			if (unusable === 'non-executable') {
				fs.writeFileSync(path.join(bin, 'npx'), '', { mode: 0o644 });
			}
			const options = {
				root, home: root, platform: 'linux' as const, arch: 'x64', nodeVersion: '26.0.0',
				env: { GITHUB_ENVIRONMENT_ID: 'environment', PATH: path.join(root, 'host-bin') },
				run: (command: string) => command === 'dpkg-query' ? installedPackages : 'v24.18.0\n',
			};
			assert.throws(() => prepareCloudSandbox(options), unusable === 'missing' ? /ENOENT/ : /EACCES/);
			assert.deepStrictEqual(['node', 'npm', 'npx'].map(executable => ({
				link: fs.lstatSync(path.join(root, 'host-bin', executable)).isSymbolicLink(),
				data: fs.readFileSync(path.join(root, 'host-bin', executable), 'utf8'),
			})), Array.from({ length: 3 }, () => ({ link: false, data: '' })));

			fs.writeFileSync(path.join(bin, 'npx'), '');
			fs.chmodSync(path.join(bin, 'npx'), 0o755);
			assert.equal(prepareCloudSandbox(options), path.join(bin, 'node'));
		});
	}

	test('selects node, npm and npx from their independently resolved PATH directories', t => {
		const root = fixture(t);
		const earlierBin = path.join(root, 'earlier-bin');
		fs.mkdirSync(earlierBin);
		for (const executable of ['npm', 'npx']) {
			fs.writeFileSync(path.join(earlierBin, executable), '', { mode: 0o755 });
		}
		const bin = path.join(root, '.local/share/vscode-cloud-sandbox/node-v24.18.0-linux-x64/bin');
		fs.mkdirSync(bin, { recursive: true });
		for (const executable of ['node', 'npm', 'npx']) {
			fs.writeFileSync(path.join(bin, executable), '', { mode: 0o755 });
		}
		const options = {
			root, home: root, platform: 'linux' as const, arch: 'x64', nodeVersion: '26.0.0',
			env: { GITHUB_ENVIRONMENT_ID: 'environment', PATH: `${earlierBin}${path.delimiter}${path.join(root, 'host-bin')}` },
			run: (command: string) => command === 'dpkg-query' ? installedPackages : 'v24.18.0\n',
		};
		assert.equal(prepareCloudSandbox(options), path.join(bin, 'node'));
		// A retry already running the downloaded Node must repair other PATH tools too.
		fs.unlinkSync(path.join(earlierBin, 'npx'));
		fs.writeFileSync(path.join(earlierBin, 'npx'), '', { mode: 0o755 });
		assert.equal(prepareCloudSandbox({ ...options, nodeVersion: '24.18.0', nodeExecutable: path.join(bin, 'node') }), path.join(bin, 'node'));
		assert.deepStrictEqual({
			node: fs.readlinkSync(path.join(root, 'host-bin/node')),
			npm: fs.readlinkSync(path.join(earlierBin, 'npm')),
			npx: fs.readlinkSync(path.join(earlierBin, 'npx')),
		}, {
			node: path.join(bin, 'node'),
			npm: path.join(bin, 'npm'),
			npx: path.join(bin, 'npx'),
		});
	});

	test('creates missing npm and npx alongside the selected host Node executable', t => {
		const root = fixture(t);
		const bin = path.join(root, '.local/share/vscode-cloud-sandbox/node-v24.18.0-linux-x64/bin');
		fs.mkdirSync(bin, { recursive: true });
		for (const executable of ['node', 'npm', 'npx']) {
			fs.writeFileSync(path.join(bin, executable), '', { mode: 0o755 });
		}
		for (const executable of ['npm', 'npx']) {
			fs.unlinkSync(path.join(root, 'host-bin', executable));
		}
		prepareCloudSandbox({
			root, home: root, platform: 'linux', arch: 'x64', nodeVersion: '26.0.0',
			env: { GITHUB_ENVIRONMENT_ID: 'environment', PATH: path.join(root, 'host-bin') },
			run: command => command === 'dpkg-query' ? installedPackages : 'v24.18.0\n',
		});
		assert.deepStrictEqual(['node', 'npm', 'npx'].map(executable => fs.readlinkSync(path.join(root, 'host-bin', executable))),
			['node', 'npm', 'npx'].map(executable => path.join(bin, executable)));
	});

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

	test('the startup hook prepares cold npm install and npm ci before dependency scripts', t => {
		const root = fixture(t);
		const npmDirectory = path.join(root, 'build/npm');
		fs.mkdirSync(npmDirectory, { recursive: true });
		for (const name of ['fast-install.ts', 'preinstall.ts', 'postinstall.ts']) {
			fs.copyFileSync(path.join(repositoryRoot, 'build/npm', name), path.join(npmDirectory, name));
		}
		fs.writeFileSync(path.join(npmDirectory, 'cloudSandbox.ts'), `
			import fs from 'node:fs';
			export function isCloudSandbox() { return Boolean(process.env.GITHUB_ENVIRONMENT_ID); }
			export function prepareCloudSandbox() { fs.appendFileSync('calls', 'prepare\\n'); return process.execPath; }
			export function raiseCloudSandboxFileLimit(pid) {
				if (!Number.isSafeInteger(pid) || pid <= 1) { throw new Error('Invalid limit target'); }
				fs.appendFileSync('calls', 'limit\\n');
				fs.appendFileSync('limit-targets', pid + '\\n');
			}
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
		assert.deepStrictEqual(results, ['finish\n', 'finish\n', 'finish\n']);

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
			fs.mkdirSync('node_modules/.bin', { recursive: true });
			fs.writeFileSync('node_modules/.bin/node-gyp', '');
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
			if (!fs.existsSync(${JSON.stringify(path.join(gyp, 'node_modules/.bin/node-gyp'))})) {
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

		const hook = JSON.parse(fs.readFileSync(path.join(repositoryRoot, '.github/hooks/cloud-sandbox.json'), 'utf8')) as {
			hooks: { sessionStart: { bash: string }[] };
		};
		fs.copyFileSync(path.join(repositoryRoot, 'build/npm/cloudSandboxSetup.ts'), path.join(npmDirectory, 'cloudSandboxSetup.ts'));
		const hookCommand = hook.hooks.sessionStart[0].bash;
		const hookOptions = {
			...options,
			env: { ...options.env, HOME: root, GITHUB_ENVIRONMENT_ID: 'test-environment' },
		};
		// Simulate the Linux sandbox while keeping these offline fixtures runnable on macOS.
		const installCommands = [['install'], ['ci'], ['run', 'install-fast', '--', '--force']];
		for (const [index, args] of installCommands.entries()) {
			const startup = spawnSync('bash', ['-c', `uname() { printf 'Linux\\n'; }\n${hookCommand}`], hookOptions);
			assert.equal(startup.status, 0, startup.stdout + startup.stderr);
			const targetPids = fs.readFileSync(path.join(root, 'limit-targets'), 'utf8').trim().split('\n').map(Number);
			assert.deepStrictEqual({ agent: targetPids[0], setupIsSeparateProcess: targetPids[1] !== process.pid }, {
				agent: process.pid, setupIsSeparateProcess: true,
			});
			fs.unlinkSync(path.join(root, 'limit-targets'));
			const installAfterStartup = spawnSync('npm', args, options);
			assert.equal(installAfterStartup.status, 0, installAfterStartup.stdout + installAfterStartup.stderr);
			assert.deepStrictEqual(fs.readFileSync(path.join(root, 'calls'), 'utf8').split('\n').filter(Boolean), [
				...(index === 0 ? ['prepare'] : []), 'limit', 'limit', ...(index === 0 ? ['headers'] : []),
				'native', ...(args.includes('install-fast') ? ['headers'] : []), 'finish',
			]);
			fs.unlinkSync(path.join(root, 'calls'));
			fs.rmSync(path.join(root, 'node_modules'), { recursive: true, force: true });
		}
		fs.unlinkSync(path.join(root, '.build/cloud-sandbox-setup'));
		fs.writeFileSync(path.join(gyp, 'install.ts'), 'throw new Error("Header setup failed");');
		const failedStartup = spawnSync('bash', ['-c', `uname() { printf 'Linux\\n'; }\n${hookCommand}`], hookOptions);
		assert.notEqual(failedStartup.status, 0);
		assert.match(failedStartup.stderr, /Header setup failed/);
		assert.ok(!failedStartup.stdout.includes('prerequisites are ready'));
	});

	test('the session-start hook does not invoke Node for local sessions or non-Linux hosts', t => {
		if (process.platform === 'win32') {
			t.skip('The hook uses bash only.');
			return;
		}
		const root = fixture(t);
		const hook = JSON.parse(fs.readFileSync(path.join(repositoryRoot, '.github/hooks/cloud-sandbox.json'), 'utf8')) as {
			hooks: { sessionStart: { bash: string }[] };
		};
		const results = [
			{ environmentId: '', platform: 'Linux' },
			{ environmentId: 'environment', platform: 'Darwin' },
		].map(({ environmentId, platform }) => {
			const result = spawnSync('bash', ['-c', `
				uname() { printf '${platform}\\n'; }
				node() { printf 'Unexpected setup invocation\\n' >&2; return 1; }
				${hook.hooks.sessionStart[0].bash}
			`], {
				cwd: root, encoding: 'utf8',
				env: { ...process.env, GITHUB_ENVIRONMENT_ID: environmentId },
			});
			return { status: result.status, stdout: result.stdout, stderr: result.stderr };
		});
		assert.deepStrictEqual(results, Array.from({ length: 2 }, () => ({ status: 0, stdout: '', stderr: '' })));
	});

	test('the dev launcher uses the existing shared-memory workaround for Linux Cloud Sandboxes', t => {
		if (process.platform === 'win32') {
			t.skip('The development launcher uses bash.');
			return;
		}
		const root = fixture(t);
		fs.mkdirSync(path.join(root, 'scripts'));
		fs.copyFileSync(path.join(repositoryRoot, 'scripts/code.sh'), path.join(root, 'scripts/code.sh'));
		fs.mkdirSync(path.join(root, '.build/electron'), { recursive: true });
		const fakeNode = path.join(root, 'host-bin/node');
		fs.writeFileSync(fakeNode, '#!/bin/sh\nprintf "code\\n"\n', { mode: 0o755 });
		fs.writeFileSync(path.join(root, '.build/electron/code'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
		const result = spawnSync('bash', ['-c', 'OSTYPE=linux-gnu; source "$0" --test-launch', path.join(root, 'scripts/code.sh')], {
			encoding: 'utf8', timeout: 10_000,
			env: { ...process.env, PATH: `${path.dirname(fakeNode)}${path.delimiter}${process.env.PATH}`, GITHUB_ENVIRONMENT_ID: 'environment', VSCODE_SKIP_PRELAUNCH: '1' },
		});
		assert.deepStrictEqual({
			status: result.status,
			args: result.stdout.trim().split('\n'),
		}, { status: 0, args: ['.', '--disable-extension=vscode.vscode-api-tests', '--disable-dev-shm-usage', '--test-launch'] }, result.stderr);
	});

	test('startup continues under the selected Node executable without a manual second invocation', t => {
		if (process.platform === 'win32') {
			t.skip('The sandbox startup executable fixture uses a POSIX shell.');
			return;
		}
		const root = fixture(t);
		const npmDirectory = path.join(root, 'build/npm');
		fs.mkdirSync(path.join(npmDirectory, 'gyp'), { recursive: true });
		fs.mkdirSync(path.join(root, 'remote'));
		fs.writeFileSync(path.join(root, 'remote/.npmrc'), '');
		for (const file of ['package.json', 'package-lock.json']) {
			fs.writeFileSync(path.join(npmDirectory, 'gyp', file), '{}');
		}
		const selectedNode = path.join(root, 'selected-node');
		const quote = (value: string) => `'${value.replaceAll('\'', '\'\\\'\'')}'`;
		fs.writeFileSync(selectedNode, `#!/bin/sh
export SELECTED_NODE_EXECUTED=1
exec ${quote(process.execPath)} "$@"
`, { mode: 0o755 });
		fs.copyFileSync(path.join(repositoryRoot, 'build/npm/cloudSandboxSetup.ts'), path.join(npmDirectory, 'cloudSandboxSetup.ts'));
		fs.writeFileSync(path.join(npmDirectory, 'installStateHash.ts'), 'export const root = process.cwd();');
		fs.writeFileSync(path.join(npmDirectory, 'cloudSandbox.ts'), `
			export function isCloudSandbox() { return true; }
			export function prepareCloudSandbox() { return ${JSON.stringify(selectedNode)}; }
			export function raiseCloudSandboxFileLimit() {}
		`);
		fs.writeFileSync(path.join(npmDirectory, 'preinstall.ts'), `
			import assert from 'node:assert/strict';
			import fs from 'node:fs';
			assert.equal(process.env.SELECTED_NODE_EXECUTED, '1');
			assert.equal(process.env.PATH.split(${JSON.stringify(path.delimiter)})[0], ${JSON.stringify(root)});
			fs.mkdirSync('build/npm/gyp/node_modules/.bin', { recursive: true });
			fs.writeFileSync('build/npm/gyp/node_modules/.bin/node-gyp', '');
		`);
		const result = spawnSync(process.execPath, [path.join(npmDirectory, 'cloudSandboxSetup.ts')], {
			cwd: root, encoding: 'utf8', timeout: 10_000,
			env: { ...process.env, HOME: root, USERPROFILE: root, GITHUB_ENVIRONMENT_ID: 'environment' },
		});
		assert.deepStrictEqual({
			status: result.status,
			completed: fs.existsSync(path.join(root, '.build/cloud-sandbox-setup')),
			lockRemaining: fs.existsSync(path.join(root, '.local/share/vscode-cloud-sandbox/setup.lock')),
		}, { status: 0, completed: true, lockRemaining: false }, result.stdout + result.stderr);
	});

	for (const failFirst of [false, true]) {
		test(`concurrent sessions serialize setup and reuse success (initial failure: ${failFirst})`, async t => {
			const root = fixture(t);
			const npmDirectory = path.join(root, 'build/npm');
			fs.mkdirSync(path.join(npmDirectory, 'gyp'), { recursive: true });
			fs.mkdirSync(path.join(root, 'remote'));
			fs.writeFileSync(path.join(root, 'remote/.npmrc'), '');
			for (const file of ['package.json', 'package-lock.json']) {
				fs.writeFileSync(path.join(npmDirectory, 'gyp', file), '{}');
			}
			fs.copyFileSync(path.join(repositoryRoot, 'build/npm/cloudSandboxSetup.ts'), path.join(npmDirectory, 'cloudSandboxSetup.ts'));
			fs.writeFileSync(path.join(npmDirectory, 'installStateHash.ts'), 'export const root = process.cwd();');
			fs.writeFileSync(path.join(npmDirectory, 'cloudSandbox.ts'), `
				import fs from 'node:fs';
				export function isCloudSandbox() { return true; }
				export function prepareCloudSandbox() {
					fs.appendFileSync('calls', 'prepare\\n');
					fs.writeFileSync('mutation', 'prepare', { flag: 'wx' });
					Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
					fs.unlinkSync('mutation');
					return process.execPath;
				}
				export function raiseCloudSandboxFileLimit() { fs.appendFileSync('calls', 'limit\\n'); }
			`);
			fs.writeFileSync(path.join(npmDirectory, 'preinstall.ts'), `
				import fs from 'node:fs';
				fs.appendFileSync('calls', 'headers\\n');
				fs.writeFileSync('mutation', 'headers', { flag: 'wx' });
				try {
					Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
					if (fs.existsSync('fail-once')) {
						fs.unlinkSync('fail-once');
						throw new Error('Header setup failed once');
					}
					fs.mkdirSync('build/npm/gyp/node_modules/.bin', { recursive: true });
					fs.writeFileSync('build/npm/gyp/node_modules/.bin/node-gyp', '');
				} finally {
					fs.unlinkSync('mutation');
				}
			`);
			if (failFirst) {
				fs.writeFileSync(path.join(root, 'fail-once'), '');
			}
			const options = {
				cwd: root,
				env: { ...process.env, HOME: root, USERPROFILE: root, GITHUB_ENVIRONMENT_ID: 'environment' },
			};
			const start = () => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
				const child = spawn(process.execPath, ['build/npm/cloudSandboxSetup.ts', '--agent-pid', String(process.pid)], { ...options, timeout: 10_000 });
				let output = '';
				child.stdout.on('data', data => { output += data; });
				child.stderr.on('data', data => { output += data; });
				child.on('error', reject);
				child.on('close', code => resolve({ code, output }));
			});
			const results = await Promise.all([start(), start(), start()]);
			assert.deepStrictEqual(results.map(result => result.code).sort(), failFirst ? [0, 0, 1] : [0, 0, 0], results.map(result => result.output).join('\n'));
			const calls = () => fs.readFileSync(path.join(root, 'calls'), 'utf8').trim().split('\n');
			const expectedSetups = failFirst ? 2 : 1;
			assert.deepStrictEqual({
				prepares: calls().filter(call => call === 'prepare').length,
				headers: calls().filter(call => call === 'headers').length,
				limits: calls().filter(call => call === 'limit').length,
				mutationLeft: fs.existsSync(path.join(root, 'mutation')),
				lockLeft: fs.existsSync(path.join(root, '.local/share/vscode-cloud-sandbox/setup.lock')),
				completed: fs.existsSync(path.join(root, '.build/cloud-sandbox-setup')),
			}, {
				prepares: expectedSetups, headers: expectedSetups, limits: 6,
				mutationLeft: false, lockLeft: false, completed: true,
			});

			// Changes to setup inputs or missing header dependencies must invalidate completion.
			fs.appendFileSync(path.join(npmDirectory, 'preinstall.ts'), '\n// Changed setup input\n');
			assert.equal((await start()).code, 0);
			fs.unlinkSync(path.join(npmDirectory, 'gyp/node_modules/.bin/node-gyp'));
			assert.equal((await start()).code, 0);
			assert.deepStrictEqual({
				prepares: calls().filter(call => call === 'prepare').length,
				headers: calls().filter(call => call === 'headers').length,
			}, { prepares: expectedSetups + 2, headers: expectedSetups + 2 });

			const exited = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' });
			assert.equal(exited.status, 0, exited.stderr);
			const lockFile = path.join(root, '.local/share/vscode-cloud-sandbox/setup.lock');
			fs.writeFileSync(lockFile, exited.stdout.trim());
			const blocked = await start();
			assert.equal(blocked.code, 1);
			assert.match(blocked.output, /stale lock.*exited process/);
			assert.equal(fs.readFileSync(lockFile, 'utf8'), exited.stdout.trim());
		});
	}
});
