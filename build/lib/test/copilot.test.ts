/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import { create } from 'tar';
import { copilotPlatforms, ensureCopilotPlatformPackage, getCopilotExcludeFilter, getCopilotRuntimePrebuildFiles, getCopilotRuntimeVersion, prepareBuiltInCopilotRipgrepShim, renderCopilotShimLauncher } from '../copilot.ts';

/**
 * Builds a fake `@github/copilot-win32-x64@1.0.73` tarball on disk and returns
 * its path plus the `sha512-...` integrity of its bytes, so a test can pin that
 * integrity in a lockfile the build verifies against.
 */
function createPinnedCopilotWin32Tarball(dir: string): { tarball: string; integrity: string } {
	const stage = fs.mkdtempSync(path.join(dir, 'pkg-'));
	const packageRoot = path.join(stage, 'package');
	fs.mkdirSync(path.join(packageRoot, 'prebuilds', 'win32-x64'), { recursive: true });
	fs.mkdirSync(path.join(packageRoot, 'tgrep', 'bin', 'win32-x64'), { recursive: true });
	fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ version: '1.0.73' }));
	fs.writeFileSync(path.join(packageRoot, 'prebuilds', 'win32-x64', 'runtime.node'), 'EXT-NATIVE-1.0.73');
	fs.writeFileSync(path.join(packageRoot, 'tgrep', 'bin', 'win32-x64', 'tgrep.exe'), 'EXT-TGREP-1.0.73');
	const tarball = path.join(stage, 'copilot-win32-x64.tgz');
	create({ file: tarball, cwd: stage, gzip: true, sync: true }, ['package']);
	const integrity = 'sha512-' + createHash('sha512').update(fs.readFileSync(tarball)).digest('base64');
	return { tarball, integrity };
}

suite('copilot', () => {
	test('reads the runtime version owned by the SDK', () => {
		const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-copilot-version-test-'));
		try {
			const sdkDir = path.join(repoRoot, 'node_modules', '@github', 'copilot-sdk');
			fs.mkdirSync(sdkDir, { recursive: true });
			fs.writeFileSync(path.join(sdkDir, 'package.json'), JSON.stringify({ copilotCliVersion: '1.2.3' }));

			assert.strictEqual(getCopilotRuntimeVersion(path.join(repoRoot, 'node_modules')), '1.2.3');
		} finally {
			fs.rmSync(repoRoot, { recursive: true, force: true });
		}
	});

	test('keeps the SDK runtime package include list scoped to the selected platform', () => {
		const files = getCopilotRuntimePrebuildFiles('linux', 'x64');

		assert.deepStrictEqual(files, [
			'node_modules/@github/copilot-sdk-linux-x64/**',
			'!node_modules/@github/copilot-sdk-linux-x64/builtin/**',
			'!node_modules/@github/copilot-sdk-linux-x64/builtin-skills/**',
			'!node_modules/@github/copilot-sdk-linux-x64/clipboard/**',
			'!node_modules/@github/copilot-sdk-linux-x64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-sdk-linux-x64/pvrecorder/**',
			'!node_modules/@github/copilot-sdk-linux-x64/webview/**',
			'!node_modules/@github/copilot-sdk-linux-x64/plugins/computer-use/**',
			'!node_modules/@github/copilot-sdk-linux-x64/prebuilds/*/computer.node',
			'!node_modules/@github/copilot-sdk-linux-x64/prebuilds/*/keytar.node',
			'!node_modules/@github/copilot-sdk-linux-x64/prebuilds/*/mediaremote-adapter/**',
		]);
		assertCopilotPlatformPackageIncludes(files, 'node_modules/@github/copilot-sdk-linux-x64', [
			'prebuilds/linux-x64/runtime.node',
			'prebuilds/linux-x64/copilot-runtime',
			'copilot-sdk/index.js',
			'definitions/task.agent.yaml',
			'ripgrep/bin/linux-x64/rg',
			'tgrep/bin/linux-x64/tgrep',
			'mxc-bin/x64/mxc-exec',
		]);
		assertOptionalCopilotNativeDependenciesExcluded(files, 'node_modules/@github/copilot-sdk-linux-x64');
	});

	test('uses the linuxmusl package runtime for alpine builds', () => {
		const files = getCopilotRuntimePrebuildFiles('alpine', 'x64');

		assert.deepStrictEqual(files, [
			'node_modules/@github/copilot-sdk-linuxmusl-x64/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/builtin/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/builtin-skills/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/clipboard/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/pvrecorder/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/webview/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/plugins/computer-use/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/prebuilds/*/computer.node',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/prebuilds/*/keytar.node',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/prebuilds/*/mediaremote-adapter/**',
		]);
		assertCopilotPlatformPackageIncludes(files, 'node_modules/@github/copilot-sdk-linuxmusl-x64', [
			'prebuilds/linuxmusl-x64/runtime.node',
			'prebuilds/linuxmusl-x64/copilot-runtime',
			'copilot-sdk/index.js',
		]);
		assertOptionalCopilotNativeDependenciesExcluded(files, 'node_modules/@github/copilot-sdk-linuxmusl-x64');
	});

	test('uses the .exe package runtime for windows builds', () => {
		assert.deepStrictEqual(getCopilotRuntimePrebuildFiles('win32', 'x64'), [
			'node_modules/@github/copilot-sdk-win32-x64/**',
			'!node_modules/@github/copilot-sdk-win32-x64/builtin/**',
			'!node_modules/@github/copilot-sdk-win32-x64/builtin-skills/**',
			'!node_modules/@github/copilot-sdk-win32-x64/clipboard/**',
			'!node_modules/@github/copilot-sdk-win32-x64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-sdk-win32-x64/pvrecorder/**',
			'!node_modules/@github/copilot-sdk-win32-x64/webview/**',
			'!node_modules/@github/copilot-sdk-win32-x64/plugins/computer-use/**',
			'!node_modules/@github/copilot-sdk-win32-x64/prebuilds/*/computer.node',
			'!node_modules/@github/copilot-sdk-win32-x64/prebuilds/*/keytar.node',
			'!node_modules/@github/copilot-sdk-win32-x64/prebuilds/*/mediaremote-adapter/**',
		]);
		assertCopilotPlatformPackageIncludes(getCopilotRuntimePrebuildFiles('win32', 'x64'), 'node_modules/@github/copilot-sdk-win32-x64', [
			'prebuilds/win32-x64/runtime.node',
			'prebuilds/win32-x64/copilot-runtime.exe',
			'copilot-sdk/index.js',
		]);
		assertOptionalCopilotNativeDependenciesExcluded(getCopilotRuntimePrebuildFiles('win32', 'x64'), 'node_modules/@github/copilot-sdk-win32-x64');
	});

	test('keeps macOS runtime prebuilds in the selected platform package', () => {
		const files = getCopilotRuntimePrebuildFiles('darwin', 'arm64');

		assertCopilotPlatformPackageIncludes(files, 'node_modules/@github/copilot-sdk-darwin-arm64', [
			'copilot-sdk/index.js',
			'prebuilds/darwin-arm64/runtime.node',
			'prebuilds/darwin-arm64/copilot-runtime',
		]);
		assertOptionalCopilotNativeDependenciesExcluded(files, 'node_modules/@github/copilot-sdk-darwin-arm64');
	});

	for (const { platform, arch, packagePlatformArch } of [
		{ platform: 'darwin', arch: 'arm64', packagePlatformArch: 'darwin-arm64' },
		{ platform: 'darwin', arch: 'x64', packagePlatformArch: 'darwin-x64' },
		{ platform: 'linux', arch: 'arm64', packagePlatformArch: 'linux-arm64' },
		{ platform: 'linux', arch: 'x64', packagePlatformArch: 'linux-x64' },
		{ platform: 'alpine', arch: 'arm64', packagePlatformArch: 'linuxmusl-arm64' },
		{ platform: 'alpine', arch: 'x64', packagePlatformArch: 'linuxmusl-x64' },
		{ platform: 'linux', arch: 'alpine', packagePlatformArch: 'linuxmusl-x64' },
		{ platform: 'win32', arch: 'arm64', packagePlatformArch: 'win32-arm64' },
		{ platform: 'win32', arch: 'x64', packagePlatformArch: 'win32-x64' },
	]) {
		test(`keeps the SDK runtime in desktop and remote packages for ${platform}-${arch}`, () => {
			for (const nodeModulesRoot of ['node_modules', 'remote/node_modules']) {
				const sdkPackageDir = `${nodeModulesRoot}/@github/copilot-sdk-${packagePlatformArch}`;
				const executable = `${sdkPackageDir}/prebuilds/${packagePlatformArch}/${platform === 'win32' ? 'copilot-runtime.exe' : 'copilot-runtime'}`;
				const sdk = `${sdkPackageDir}/copilot-sdk/index.js`;
				assert.deepStrictEqual({
					runtimeExecutable: matchesGlob(executable, getCopilotRuntimePrebuildFiles(platform, arch, nodeModulesRoot)),
					runtimeSdk: matchesGlob(sdk, getCopilotRuntimePrebuildFiles(platform, arch, nodeModulesRoot)),
					dependenciesExecutable: matchesGlob(executable, getCopilotExcludeFilter(platform, arch)),
					dependenciesSdk: matchesGlob(sdk, getCopilotExcludeFilter(platform, arch)),
					standaloneCli: matchesGlob(`product/${nodeModulesRoot}/@github/copilot-${packagePlatformArch}/copilot`, getCopilotExcludeFilter(platform, arch)),
				}, {
					runtimeExecutable: true,
					runtimeSdk: true,
					dependenciesExecutable: true,
					dependenciesSdk: true,
					standaloneCli: false,
				}, sdkPackageDir);
			}
		});
	}

	test('materializes missing target platform packages from the lockfile', () => {
		const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-copilot-platform-test-'));
		const nodeModulesRoot = path.join(repoRoot, 'node_modules');
		try {
			fs.mkdirSync(nodeModulesRoot, { recursive: true });
			fs.writeFileSync(path.join(repoRoot, 'package-lock.json'), JSON.stringify({
				packages: {
					'node_modules/@github/copilot-sdk-darwin-x64': {
						version: '1.0.64-1',
					}
				}
			}));

			ensureCopilotPlatformPackage('darwin', 'x64', nodeModulesRoot, {
				packPackage: (packageName, _version, tempDir) => {
					assert.strictEqual(packageName, '@github/copilot-sdk-darwin-x64');
					const packageRoot = path.join(tempDir, 'package');
					fs.mkdirSync(path.join(packageRoot, 'prebuilds', 'darwin-x64'), { recursive: true });
					fs.mkdirSync(path.join(packageRoot, 'copilot-sdk'), { recursive: true });
					fs.writeFileSync(path.join(packageRoot, 'copilot-sdk', 'index.js'), '');
					fs.writeFileSync(path.join(packageRoot, 'prebuilds', 'darwin-x64', 'copilot-runtime'), '');
					fs.writeFileSync(path.join(packageRoot, 'prebuilds', 'darwin-x64', 'runtime.node'), '');
					const tarball = path.join(tempDir, 'copilot-sdk-darwin-x64.tgz');
					create({ file: tarball, cwd: tempDir, gzip: true, sync: true }, ['package']);
					return tarball;
				}
			});

			assert.deepStrictEqual({
				sdk: fs.existsSync(path.join(nodeModulesRoot, '@github', 'copilot-sdk-darwin-x64', 'copilot-sdk', 'index.js')),
				runtime: fs.existsSync(path.join(nodeModulesRoot, '@github', 'copilot-sdk-darwin-x64', 'prebuilds', 'darwin-x64', 'copilot-runtime')),
				native: fs.existsSync(path.join(nodeModulesRoot, '@github', 'copilot-sdk-darwin-x64', 'prebuilds', 'darwin-x64', 'runtime.node')),
			}, {
				sdk: true,
				runtime: true,
				native: true,
			});
		} finally {
			fs.rmSync(repoRoot, { recursive: true, force: true });
		}
	});

	test('rejects a target SDK platform package with missing runtime files', () => {
		const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-copilot-runtime-test-'));
		const nodeModulesRoot = path.join(repoRoot, 'node_modules');
		try {
			fs.mkdirSync(nodeModulesRoot, { recursive: true });
			fs.writeFileSync(path.join(repoRoot, 'package-lock.json'), JSON.stringify({
				packages: {
					'node_modules/@github/copilot-sdk-darwin-x64': {
						version: '1.0.14',
					}
				}
			}));

			assert.throws(() => ensureCopilotPlatformPackage('darwin', 'x64', nodeModulesRoot, {
				packPackage: (_packageName, _version, tempDir) => {
					const packageRoot = path.join(tempDir, 'package');
					fs.mkdirSync(packageRoot, { recursive: true });
					fs.writeFileSync(path.join(packageRoot, 'package.json'), '{}');
					const tarball = path.join(tempDir, 'copilot-sdk-darwin-x64.tgz');
					create({ file: tarball, cwd: tempDir, gzip: true, sync: true }, ['package']);
					return tarball;
				}
			}), /is missing SDK runtime files/);
		} finally {
			fs.rmSync(repoRoot, { recursive: true, force: true });
		}
	});

	test('excludes legacy and non-target Copilot platform packages from the dependency stream', () => {
		const files = getCopilotExcludeFilter('linux', 'x64');

		assert.deepStrictEqual({
			standaloneCliRuntime: matchesGlob('product/node_modules/@github/copilot-linux-x64/copilot', files),
			targetSdkEntrypoint: matchesGlob('product/node_modules/@github/copilot-sdk-linux-x64/copilot-sdk/index.js', files),
			nonTargetSdkRuntime: matchesGlob('product/node_modules/@github/copilot-sdk-darwin-arm64/prebuilds/darwin-arm64/copilot-runtime', files),
			nonTargetCliRuntime: matchesGlob('product/node_modules/@github/copilot-darwin-arm64/copilot', files),
		}, {
			standaloneCliRuntime: false,
			targetSdkEntrypoint: true,
			nonTargetSdkRuntime: false,
			nonTargetCliRuntime: false,
		});
	});

	test('materializes target Copilot SDK prebuilds and tgrep for the built-in extension', () => {
		const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-copilot-sdk-prebuild-test-'));
		try {
			const builtInCopilotExtensionDir = path.join(repoRoot, 'extensions', 'copilot');
			const extensionCopilotDir = path.join(builtInCopilotExtensionDir, 'node_modules', '@github', 'copilot');
			const appNodeModulesDir = path.join(repoRoot, 'node_modules');
			const platformPackageDir = path.join(appNodeModulesDir, '@github', 'copilot-win32-x64');

			fs.mkdirSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'linux-x64'), { recursive: true });
			fs.writeFileSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'linux-x64', 'runtime.node'), '');
			fs.writeFileSync(path.join(extensionCopilotDir, 'package.json'), JSON.stringify({ version: '1.0.73' }));
			fs.mkdirSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'conpty'), { recursive: true });
			fs.writeFileSync(path.join(platformPackageDir, 'package.json'), JSON.stringify({ version: '1.0.73' }));
			fs.mkdirSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'mediaremote-adapter', 'MediaRemoteAdapter.framework'), { recursive: true });
			fs.writeFileSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'runtime.node'), '');
			fs.writeFileSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'copilot-runtime.exe'), '');
			fs.writeFileSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'copilot-runtime-bin.exe'), '');
			fs.writeFileSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'OneAuthInterop.dll'), '');
			fs.writeFileSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'conpty.node'), '');
			fs.writeFileSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'conpty', 'OpenConsole.exe'), '');
			fs.writeFileSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'mediaremote-adapter', 'mediaremote-adapter.pl'), '');
			fs.writeFileSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'mediaremote-adapter', 'MediaRemoteAdapter.framework', 'MediaRemoteAdapter'), '');
			fs.mkdirSync(path.join(platformPackageDir, 'tgrep', 'bin', 'win32-x64'), { recursive: true });
			fs.writeFileSync(path.join(platformPackageDir, 'tgrep', 'bin', 'win32-x64', 'tgrep.exe'), '');
			fs.mkdirSync(path.join(appNodeModulesDir, '@vscode', 'ripgrep-universal', 'bin', 'win32-x64'), { recursive: true });
			fs.writeFileSync(path.join(appNodeModulesDir, '@vscode', 'ripgrep-universal', 'bin', 'win32-x64', 'rg.exe'), '');

			prepareBuiltInCopilotRipgrepShim('win32', 'x64', builtInCopilotExtensionDir, appNodeModulesDir);

			assert(fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'win32-x64', 'runtime.node')));
			assert(!fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'win32-x64', 'copilot-runtime.exe')));
			assert(!fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'win32-x64', 'copilot-runtime-bin.exe')));
			assert(fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'win32-x64', 'OneAuthInterop.dll')));
			assert(fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'win32-x64', 'conpty.node')));
			assert(fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'win32-x64', 'conpty', 'OpenConsole.exe')));
			assert(!fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'win32-x64', 'mediaremote-adapter')));
			assert(!fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'linux-x64')));
			assert(fs.existsSync(path.join(extensionCopilotDir, 'tgrep', 'bin', 'win32-x64', 'tgrep.exe')));
			assert(fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'tgrep', 'bin', 'win32-x64', 'tgrep.exe')));
			assert(fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'ripgrep', 'bin', 'win32-x64', 'rg.exe')));
		} finally {
			fs.rmSync(repoRoot, { recursive: true, force: true });
		}
	});

	test('materializes a version-matched native when app-root diverges from the pinned extension', () => {
		const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-copilot-sdk-pinned-test-'));
		try {
			const builtInCopilotExtensionDir = path.join(repoRoot, 'extensions', 'copilot');
			const extensionCopilotDir = path.join(builtInCopilotExtensionDir, 'node_modules', '@github', 'copilot');
			const appNodeModulesDir = path.join(repoRoot, 'node_modules');
			const platformPackageDir = path.join(appNodeModulesDir, '@github', 'copilot-win32-x64');

			// Extension pinned at 1.0.73.
			fs.mkdirSync(path.join(extensionCopilotDir, 'sdk'), { recursive: true });
			fs.writeFileSync(path.join(extensionCopilotDir, 'package.json'), JSON.stringify({ version: '1.0.73' }));

			// App-root updated ahead of the pinned extension — its (mismatched) native must NOT be used.
			fs.mkdirSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64'), { recursive: true });
			fs.writeFileSync(path.join(platformPackageDir, 'package.json'), JSON.stringify({ version: '9.9.9-canary' }));
			fs.writeFileSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'runtime.node'), 'CANARY-NATIVE');
			fs.mkdirSync(path.join(platformPackageDir, 'tgrep', 'bin', 'win32-x64'), { recursive: true });
			fs.writeFileSync(path.join(platformPackageDir, 'tgrep', 'bin', 'win32-x64', 'tgrep.exe'), 'CANARY-TGREP');

			fs.mkdirSync(path.join(appNodeModulesDir, '@vscode', 'ripgrep-universal', 'bin', 'win32-x64'), { recursive: true });
			fs.writeFileSync(path.join(appNodeModulesDir, '@vscode', 'ripgrep-universal', 'bin', 'win32-x64', 'rg.exe'), '');

			// Pin the fetched tarball's integrity in the extension lockfile the build verifies against.
			const { tarball, integrity } = createPinnedCopilotWin32Tarball(repoRoot);
			const extensionLockfilePath = path.join(builtInCopilotExtensionDir, 'package-lock.json');
			fs.writeFileSync(extensionLockfilePath, JSON.stringify({
				packages: { 'node_modules/@github/copilot-win32-x64': { version: '1.0.73', integrity } }
			}));

			const packCalls: { packageName: string; version: string }[] = [];
			prepareBuiltInCopilotRipgrepShim('win32', 'x64', builtInCopilotExtensionDir, appNodeModulesDir, {
				extensionLockfilePath,
				packPackage: (packageName, version) => {
					packCalls.push({ packageName, version });
					return tarball;
				}
			});

			// The version-matched (1.0.73) native was fetched and used — not app-root's canary.
			assert.deepStrictEqual(packCalls, [{ packageName: '@github/copilot-win32-x64', version: '1.0.73' }]);
			assert.strictEqual(
				fs.readFileSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'win32-x64', 'runtime.node'), 'utf8'),
				'EXT-NATIVE-1.0.73'
			);
			assert.strictEqual(
				fs.readFileSync(path.join(extensionCopilotDir, 'sdk', 'tgrep', 'bin', 'win32-x64', 'tgrep.exe'), 'utf8'),
				'EXT-TGREP-1.0.73'
			);
		} finally {
			fs.rmSync(repoRoot, { recursive: true, force: true });
		}
	});

	test('refuses to ship a fetched native that does not match the pinned extension lockfile integrity', () => {
		const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-copilot-sdk-integrity-test-'));
		try {
			const builtInCopilotExtensionDir = path.join(repoRoot, 'extensions', 'copilot');
			const extensionCopilotDir = path.join(builtInCopilotExtensionDir, 'node_modules', '@github', 'copilot');
			const appNodeModulesDir = path.join(repoRoot, 'node_modules');

			fs.mkdirSync(path.join(extensionCopilotDir, 'sdk'), { recursive: true });
			fs.writeFileSync(path.join(extensionCopilotDir, 'package.json'), JSON.stringify({ version: '1.0.73' }));
			fs.mkdirSync(path.join(appNodeModulesDir, '@vscode', 'ripgrep-universal', 'bin', 'win32-x64'), { recursive: true });
			fs.writeFileSync(path.join(appNodeModulesDir, '@vscode', 'ripgrep-universal', 'bin', 'win32-x64', 'rg.exe'), '');

			const { tarball } = createPinnedCopilotWin32Tarball(repoRoot);
			const extensionLockfilePath = path.join(builtInCopilotExtensionDir, 'package-lock.json');
			// Lockfile pins a DIFFERENT (tampered) integrity than the fetched tarball.
			fs.writeFileSync(extensionLockfilePath, JSON.stringify({
				packages: { 'node_modules/@github/copilot-win32-x64': { version: '1.0.73', integrity: `sha512-${'A'.repeat(88)}` } }
			}));

			assert.throws(() => prepareBuiltInCopilotRipgrepShim('win32', 'x64', builtInCopilotExtensionDir, appNodeModulesDir, {
				extensionLockfilePath,
				packPackage: () => tarball
			}), /integrity mismatch/);
		} finally {
			fs.rmSync(repoRoot, { recursive: true, force: true });
		}
	});

	test('strips all copilot platform packages for unsupported armhf builds', () => {
		assert.deepStrictEqual(
			getCopilotExcludeFilter('linux', 'armhf'),
			[
				'**',
				...copilotPlatforms.map(platform => `!**/node_modules/@github/copilot-${platform}/**`),
				...copilotPlatforms.map(platform => `!**/node_modules/@github/copilot-sdk-${platform}/**`),
			]
		);
	});
});

suite('copilot shim launcher', () => {
	const template = fs.readFileSync(path.join(import.meta.dirname, '..', '..', '..', 'resources', 'win32', 'bin', 'copilot.sh'), 'utf8');
	const commit = '0123456789abcdef0123456789abcdef01234567';
	const unixShells = process.platform === 'win32' ? [] : ['sh', 'bash'].filter(shell => spawnSync(shell, ['-c', 'exit 0']).status === 0);
	const inWsl = process.platform === 'linux' && /microsoft/i.test(os.release());

	interface ILauncherFixture {
		readonly root: string;
		readonly home: string;
		readonly launcher: string;
		readonly launcherDir: string;
	}

	/**
	 * Lays out the launcher the way Windows setup publishes it, under a folder name with a space like
	 * `Microsoft VS Code Insiders`, next to a `copilot.exe` stand-in.
	 */
	function createLauncher(root: string, folder: string): ILauncherFixture {
		const launcherDir = path.join(root, folder, 'bin', 'copilot-shim');
		fs.mkdirSync(launcherDir, { recursive: true });
		const launcher = path.join(launcherDir, 'copilot');
		fs.writeFileSync(launcher, renderCopilotShimLauncher(template, { commit, quality: 'insider', applicationName: 'code-insiders', dataFolderName: '.vscode-insiders', serverDataFolderName: '.vscode-server-insiders' }), { mode: 0o755 });
		fs.writeFileSync(path.join(launcherDir, 'copilot.exe'), '#!/bin/sh\nprintf "%s\\n" "shim=copilot.exe" "args=$*"\n', { mode: 0o755 });
		return { root, home: path.join(root, 'home'), launcher, launcherDir };
	}

	/**
	 * Adds a copilot shim stand-in to a VS Code Server under the home folder, modified at the given time.
	 */
	function addShim(fixture: ILauncherFixture, relativeServer: string, modified: number, mode = 0o755): void {
		const shimDir = path.join(fixture.home, relativeServer, 'bin', 'copilot-shim');
		fs.mkdirSync(shimDir, { recursive: true });
		const shim = path.join(shimDir, 'copilot');
		fs.writeFileSync(shim, `#!/bin/sh\nprintf "%s\\n" "shim=${relativeServer}" "args=$*" "path=$PATH"\n`, { mode });
		fs.utimesSync(shim, modified, modified);
	}

	function runLauncher(shell: string, fixture: ILauncherFixture, args: string[], env: Record<string, string>): { status: number | null; stdout: Record<string, string>; stderr: string } {
		const result = spawnSync(shell, [fixture.launcher, ...args], { encoding: 'utf8', env: { PATH: `${fixture.launcherDir}:/usr/bin:/bin`, HOME: fixture.home, ...env } });
		const stdout = Object.fromEntries(result.stdout.split('\n').filter(Boolean).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
		return { status: result.status, stdout, stderr: result.stderr };
	}

	function withFixture(callback: (root: string) => void): void {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-copilot-launcher-'));
		try {
			callback(root);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	}

	test('renders every product placeholder, with the marker where PATH filtering reads it', () => {
		const rendered = renderCopilotShimLauncher(template, { commit, quality: 'stable', applicationName: 'code', dataFolderName: '.vscode', serverDataFolderName: '.vscode-server' });
		assert.deepStrictEqual(
			[/@@\w+@@/.test(rendered), rendered.includes(`COMMIT="${commit}"`), rendered.includes('DATAFOLDER=".vscode"'), rendered.includes('SERVERDATAFOLDER=".vscode-server"'), Buffer.from(rendered).subarray(0, 512).includes('vscode-copilot-launcher')],
			[false, true, true, true, true]
		);
	});

	for (const shell of unixShells) {
		test(`${shell}: in WSL, runs the shim of the VS Code Server for this commit, or else the newest one`, () => {
			withFixture(root => {
				const fixture = createLauncher(root, 'Microsoft VS Code Insiders');
				const wsl = { WSL_DISTRO_NAME: 'Test' };
				const select = (servers: [string, number, number?][], env: Record<string, string> = {}) => {
					fs.rmSync(fixture.home, { recursive: true, force: true });
					for (const [server, modified, mode] of servers) {
						addShim(fixture, server, modified, mode);
					}
					return runLauncher(shell, fixture, [], { ...wsl, ...env }).stdout.shim;
				};

				assert.deepStrictEqual({
					remoteWslLayout: select([[`.vscode-server-insiders/bin/${commit}`, 1], ['.vscode-server-insiders/bin/newer', 9]]),
					remoteSshLayout: select([[`.vscode-server-insiders/cli/servers/Insiders-${commit}/server`, 1], ['.vscode-server-insiders/bin/newer', 9]]),
					codeCliLayout: select([[`.vscode-insiders/cli/servers/Insiders-${commit}/server`, 1], ['.vscode-server-insiders/bin/newer', 9]]),
					codeCliDataDir: select([[`cli-data/servers/Insiders-${commit}/server`, 1], ['.vscode-server-insiders/bin/newer', 9]], { VSCODE_CLI_DATA_DIR: path.join(fixture.home, 'cli-data') }),
					newestOfAnyQuality: select([['.vscode-server-insiders/bin/older', 1], ['.vscode-server/cli/servers/Stable-other/server', 5], ['.vscode-server/bin/newest', 9]]),
					newestIncludesCodeCli: select([['.vscode-server-insiders/bin/older', 1], ['.vscode/cli/servers/Stable-other/server', 9]]),
					skipsNonExecutable: select([[`.vscode-server-insiders/bin/${commit}`, 9, 0o644], ['.vscode-server/bin/other', 1]]),
					agentFolder: select([[`custom/bin/${commit}`, 1], ['.vscode-server-insiders/bin/newer', 9]], { VSCODE_AGENT_FOLDER: path.join(fixture.home, 'custom') }),
				}, {
					remoteWslLayout: `.vscode-server-insiders/bin/${commit}`,
					remoteSshLayout: `.vscode-server-insiders/cli/servers/Insiders-${commit}/server`,
					codeCliLayout: `.vscode-insiders/cli/servers/Insiders-${commit}/server`,
					codeCliDataDir: `cli-data/servers/Insiders-${commit}/server`,
					newestOfAnyQuality: '.vscode-server/bin/newest',
					newestIncludesCodeCli: '.vscode/cli/servers/Stable-other/server',
					skipsNonExecutable: '.vscode-server/bin/other',
					agentFolder: `custom/bin/${commit}`,
				});
			});
		});

		test(`${shell}: in WSL, hides VS Code launchers from the shim and passes the arguments`, () => {
			withFixture(root => {
				const fixture = createLauncher(root, 'Microsoft VS Code Insiders');
				const other = createLauncher(root, 'Microsoft VS Code');
				const unrelated = path.join(root, 'unrelated');
				fs.mkdirSync(unrelated);
				fs.writeFileSync(path.join(unrelated, 'copilot'), '#!/bin/sh\n', { mode: 0o755 });
				// Like a Copilot CLI executable that happens to contain the marker text far from its start.
				const large = path.join(root, 'large');
				fs.mkdirSync(large);
				fs.writeFileSync(path.join(large, 'copilot'), Buffer.concat([Buffer.alloc(4096, 0x7f), Buffer.from('vscode-copilot-launcher')]), { mode: 0o755 });
				addShim(fixture, `.vscode-server-insiders/bin/${commit}`, 1);

				const result = runLauncher(shell, fixture, ['--resume', 'a b'], { WSL_DISTRO_NAME: 'Test', PATH: `${fixture.launcherDir}::/usr/bin:${other.launcherDir}:${unrelated}:${large}:/bin` });
				assert.deepStrictEqual(result, {
					status: 0,
					stdout: { shim: `.vscode-server-insiders/bin/${commit}`, args: '--resume a b', path: `:/usr/bin:${unrelated}:${large}:/bin` },
					stderr: '',
				});
			});
		});

		test(`${shell}: in WSL, explains how to set up the command when no VS Code Server is installed`, () => {
			withFixture(root => {
				const fixture = createLauncher(root, 'Microsoft VS Code Insiders');
				const result = runLauncher(shell, fixture, [], { WSL_DISTRO_NAME: 'Test' });
				assert.deepStrictEqual([result.status, result.stdout, /Run 'code-insiders \.' to open a folder from WSL in VS Code/.test(result.stderr)], [127, {}, true]);
			});
		});

		test(`${shell}: outside WSL, runs copilot.exe from its folder`, { skip: inWsl ? 'The test runs in WSL' : false }, () => {
			withFixture(root => {
				const fixture = createLauncher(root, 'Microsoft VS Code Insiders');
				const result = runLauncher(shell, fixture, ['--resume', 'a b'], {});
				assert.deepStrictEqual(result, { status: 0, stdout: { shim: 'copilot.exe', args: '--resume a b' }, stderr: '' });
			});
		});
	}
});

function assertCopilotPlatformPackageIncludes(patterns: string[], packageDir: string, relativeFiles: string[]): void {
	assert(patterns.includes(`${packageDir}/**`));
	for (const relativeFile of relativeFiles) {
		assert(matchesGlob(`${packageDir}/${relativeFile}`, patterns), relativeFile);
	}
}

function assertOptionalCopilotNativeDependenciesExcluded(patterns: string[], packageDir: string): void {
	for (const dir of ['clipboard', 'foundry-local-sdk', 'pvrecorder', 'webview']) {
		assert(patterns.includes(`!${packageDir}/${dir}/**`), dir);
		assert(!matchesGlob(`${packageDir}/${dir}/index.js`, patterns), dir);
	}
	assert(patterns.includes(`!${packageDir}/plugins/computer-use/**`), 'plugins/computer-use');
	assert(!matchesGlob(`${packageDir}/plugins/computer-use/computer-use-mcp.exe`, patterns), 'plugins/computer-use-mcp.exe');
	assert(!matchesGlob(`${packageDir}/plugins/computer-use/CopilotComputerUse.exe`, patterns), 'plugins/CopilotComputerUse.exe');
	assert(!matchesGlob(`${packageDir}/plugins/computer-use/Copilot Computer Use.app/Contents/MacOS/Copilot Computer Use`, patterns), 'plugins/Copilot Computer Use.app');
	assert(patterns.includes(`!${packageDir}/prebuilds/*/computer.node`), 'computer.node');
	assert(!matchesGlob(`${packageDir}/prebuilds/linux-x64/computer.node`, patterns), 'computer.node');
	assert(patterns.includes(`!${packageDir}/prebuilds/*/keytar.node`), 'keytar.node');
	assert(!matchesGlob(`${packageDir}/prebuilds/linux-x64/keytar.node`, patterns), 'keytar.node');
	assert(patterns.includes(`!${packageDir}/prebuilds/*/mediaremote-adapter/**`), 'mediaremote-adapter');
	assert(!matchesGlob(`${packageDir}/prebuilds/darwin-arm64/mediaremote-adapter/MediaRemoteAdapter.framework/MediaRemoteAdapter`, patterns), 'mediaremote-adapter');
}

function matchesGlob(file: string, patterns: string[]): boolean {
	let included = false;
	for (const pattern of patterns) {
		const isExclude = pattern.startsWith('!');
		const glob = isExclude ? pattern.slice(1) : pattern;
		if (matchesPattern(file, glob)) {
			included = !isExclude;
		}
	}
	return included;
}

function matchesPattern(file: string, pattern: string): boolean {
	if (pattern.endsWith('/**') && !pattern.slice(0, -3).includes('*')) {
		return file.startsWith(pattern.slice(0, -2));
	}

	if (pattern.includes('*')) {
		const regex = new RegExp(`^${pattern.split('**').map(part => part.split('*').map(escapeRegExp).join('[^/]+')).join('.*')}$`);
		return regex.test(file);
	}

	return file === pattern;
}

function escapeRegExp(value: string): string {
	return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}
