/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import { create } from 'tar';
import { copilotPlatforms, ensureCopilotPlatformPackage, getCopilotExcludeFilter, getCopilotRuntimePrebuildFiles, getMxcExcludeFilter, prepareBuiltInCopilotRipgrepShim } from '../copilot.ts';

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
	test('keeps the paired Copilot runtime package include list scoped to the selected platform', () => {
		const files = getCopilotRuntimePrebuildFiles('linux', 'x64');

		assert.deepStrictEqual(files, [
			'node_modules/@github/copilot-linux-x64/copilot',
			'node_modules/@github/copilot-sdk-linux-x64/**',
			'!node_modules/@github/copilot-sdk-linux-x64/clipboard/**',
			'!node_modules/@github/copilot-sdk-linux-x64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-sdk-linux-x64/mxc-bin/**',
			'!node_modules/@github/copilot-sdk-linux-x64/pvrecorder/**',
			'!node_modules/@github/copilot-sdk-linux-x64/webview/**',
			'!node_modules/@github/copilot-sdk-linux-x64/plugins/computer-use/**',
			'!node_modules/@github/copilot-sdk-linux-x64/prebuilds/*/computer.node',
			'!node_modules/@github/copilot-sdk-linux-x64/prebuilds/*/keytar.node',
			'!node_modules/@github/copilot-sdk-linux-x64/prebuilds/*/mediaremote-adapter/**',
		]);
		assertCopilotPlatformPackageIncludes(files, 'node_modules/@github/copilot-sdk-linux-x64', [
			'sdk/index.js',
			'prebuilds/linux-x64/copilot-runtime',
			'prebuilds/linux-x64/runtime.node',
			'definitions/task.agent.yaml',
			'ripgrep/bin/linux-x64/rg',
			'tgrep/bin/linux-x64/tgrep',
		]);
		assertOptionalCopilotNativeDependenciesExcluded(files, 'node_modules/@github/copilot-sdk-linux-x64');
	});

	test('uses the linuxmusl package runtime for alpine builds', () => {
		const files = getCopilotRuntimePrebuildFiles('alpine', 'x64');

		assert.deepStrictEqual(files, [
			'node_modules/@github/copilot-linuxmusl-x64/copilot',
			'node_modules/@github/copilot-sdk-linuxmusl-x64/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/clipboard/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/mxc-bin/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/pvrecorder/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/webview/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/plugins/computer-use/**',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/prebuilds/*/computer.node',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/prebuilds/*/keytar.node',
			'!node_modules/@github/copilot-sdk-linuxmusl-x64/prebuilds/*/mediaremote-adapter/**',
		]);
		assertCopilotPlatformPackageIncludes(files, 'node_modules/@github/copilot-sdk-linuxmusl-x64', [
			'sdk/index.js',
			'prebuilds/linuxmusl-x64/copilot-runtime',
			'prebuilds/linuxmusl-x64/runtime.node',
		]);
		assertOptionalCopilotNativeDependenciesExcluded(files, 'node_modules/@github/copilot-sdk-linuxmusl-x64');
	});

	test('uses the .exe package runtime for windows builds', () => {
		assert.deepStrictEqual(getCopilotRuntimePrebuildFiles('win32', 'x64'), [
			'node_modules/@github/copilot-win32-x64/copilot.exe',
			'node_modules/@github/copilot-sdk-win32-x64/**',
			'!node_modules/@github/copilot-sdk-win32-x64/clipboard/**',
			'!node_modules/@github/copilot-sdk-win32-x64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-sdk-win32-x64/mxc-bin/**',
			'!node_modules/@github/copilot-sdk-win32-x64/pvrecorder/**',
			'!node_modules/@github/copilot-sdk-win32-x64/webview/**',
			'!node_modules/@github/copilot-sdk-win32-x64/plugins/computer-use/**',
			'!node_modules/@github/copilot-sdk-win32-x64/prebuilds/*/computer.node',
			'!node_modules/@github/copilot-sdk-win32-x64/prebuilds/*/keytar.node',
			'!node_modules/@github/copilot-sdk-win32-x64/prebuilds/*/mediaremote-adapter/**',
		]);
		assertCopilotPlatformPackageIncludes(getCopilotRuntimePrebuildFiles('win32', 'x64'), 'node_modules/@github/copilot-sdk-win32-x64', [
			'sdk/index.js',
			'prebuilds/win32-x64/copilot-runtime.exe',
			'prebuilds/win32-x64/runtime.node',
		]);
		assertOptionalCopilotNativeDependenciesExcluded(getCopilotRuntimePrebuildFiles('win32', 'x64'), 'node_modules/@github/copilot-sdk-win32-x64');
	});

	test('keeps macOS runtime prebuilds in the selected platform package', () => {
		const files = getCopilotRuntimePrebuildFiles('darwin', 'arm64');

		assertCopilotPlatformPackageIncludes(files, 'node_modules/@github/copilot-sdk-darwin-arm64', [
			'sdk/index.js',
			'prebuilds/darwin-arm64/copilot-runtime',
			'prebuilds/darwin-arm64/runtime.node',
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
				const cliPackageDir = `${nodeModulesRoot}/@github/copilot-${packagePlatformArch}`;
				const sdkPackageDir = `${nodeModulesRoot}/@github/copilot-sdk-${packagePlatformArch}`;
				const executable = `${cliPackageDir}/${platform === 'win32' ? 'copilot.exe' : 'copilot'}`;
				const sdk = `${sdkPackageDir}/sdk/index.js`;
				assert.deepStrictEqual({
					runtimeExecutable: matchesGlob(executable, getCopilotRuntimePrebuildFiles(platform, arch, nodeModulesRoot)),
					runtimeSdk: matchesGlob(sdk, getCopilotRuntimePrebuildFiles(platform, arch, nodeModulesRoot)),
					dependenciesExecutable: matchesGlob(executable, getCopilotExcludeFilter(platform, arch)),
					dependenciesSdk: matchesGlob(sdk, getCopilotExcludeFilter(platform, arch)),
				}, {
					runtimeExecutable: true,
					runtimeSdk: true,
					dependenciesExecutable: true,
					dependenciesSdk: true,
				}, `${cliPackageDir}, ${sdkPackageDir}`);
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
					'node_modules/@github/copilot-darwin-x64': {
						version: '1.0.64-1',
					},
					'node_modules/@github/copilot-sdk-darwin-x64': {
						version: '1.0.64-1',
					}
				}
			}));

			ensureCopilotPlatformPackage('darwin', 'x64', nodeModulesRoot, {
				packPackage: (packageName, _version, tempDir) => {
					const packageRoot = path.join(tempDir, 'package');
					if (packageName === '@github/copilot-darwin-x64') {
						fs.mkdirSync(packageRoot, { recursive: true });
						fs.writeFileSync(path.join(packageRoot, 'copilot'), '');
					} else {
						fs.mkdirSync(path.join(packageRoot, 'prebuilds', 'darwin-x64'), { recursive: true });
						fs.mkdirSync(path.join(packageRoot, 'sdk'), { recursive: true });
						fs.writeFileSync(path.join(packageRoot, 'sdk', 'index.js'), '');
						fs.writeFileSync(path.join(packageRoot, 'prebuilds', 'darwin-x64', 'copilot-runtime'), '');
						fs.writeFileSync(path.join(packageRoot, 'prebuilds', 'darwin-x64', 'runtime.node'), '');
					}
					const tarball = path.join(tempDir, `${packageName.split('/')[1]}.tgz`);
					create({ file: tarball, cwd: tempDir, gzip: true, sync: true }, ['package']);
					return tarball;
				}
			});

			assert.deepStrictEqual({
				cli: fs.existsSync(path.join(nodeModulesRoot, '@github', 'copilot-darwin-x64', 'copilot')),
				sdk: fs.existsSync(path.join(nodeModulesRoot, '@github', 'copilot-sdk-darwin-x64', 'sdk', 'index.js')),
				runtime: fs.existsSync(path.join(nodeModulesRoot, '@github', 'copilot-sdk-darwin-x64', 'prebuilds', 'darwin-x64', 'copilot-runtime')),
				native: fs.existsSync(path.join(nodeModulesRoot, '@github', 'copilot-sdk-darwin-x64', 'prebuilds', 'darwin-x64', 'runtime.node')),
			}, {
				cli: true,
				sdk: true,
				runtime: true,
				native: true,
			});
		} finally {
			fs.rmSync(repoRoot, { recursive: true, force: true });
		}
	});

	test('excludes legacy and non-target Copilot platform packages from the dependency stream', () => {
		const files = getCopilotExcludeFilter('linux', 'x64');

		assert.deepStrictEqual({
			targetCliRuntime: matchesGlob('product/node_modules/@github/copilot-linux-x64/copilot', files),
			targetSdkEntrypoint: matchesGlob('product/node_modules/@github/copilot-sdk-linux-x64/sdk/index.js', files),
			nonTargetSdkRuntime: matchesGlob('product/node_modules/@github/copilot-sdk-darwin-arm64/prebuilds/darwin-arm64/copilot-runtime', files),
			nonTargetCliRuntime: matchesGlob('product/node_modules/@github/copilot-darwin-arm64/copilot', files),
		}, {
			targetCliRuntime: true,
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
			fs.writeFileSync(path.join(extensionCopilotDir, 'sdk', 'index.js'), '');
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

	test('restores the packaged Copilot SDK from the staged extension', () => {
		const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-copilot-sdk-restore-test-'));
		try {
			const builtInCopilotExtensionDir = path.join(repoRoot, 'product', 'extensions', 'copilot');
			const extensionCopilotDir = path.join(builtInCopilotExtensionDir, 'node_modules', '@github', 'copilot');
			const sourceCopilotSdkDir = path.join(repoRoot, '.build', 'extensions', 'copilot', 'node_modules', '@github', 'copilot', 'sdk');
			const appNodeModulesDir = path.join(repoRoot, 'node_modules');
			const platformPackageDir = path.join(appNodeModulesDir, '@github', 'copilot-win32-x64');

			fs.mkdirSync(sourceCopilotSdkDir, { recursive: true });
			fs.writeFileSync(path.join(sourceCopilotSdkDir, 'index.js'), 'SDK');
			fs.mkdirSync(extensionCopilotDir, { recursive: true });
			fs.writeFileSync(path.join(extensionCopilotDir, 'package.json'), JSON.stringify({ version: '1.0.73' }));
			fs.mkdirSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64'), { recursive: true });
			fs.writeFileSync(path.join(platformPackageDir, 'package.json'), JSON.stringify({ version: '1.0.73' }));
			fs.writeFileSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'runtime.node'), '');
			fs.mkdirSync(path.join(platformPackageDir, 'tgrep', 'bin', 'win32-x64'), { recursive: true });
			fs.writeFileSync(path.join(platformPackageDir, 'tgrep', 'bin', 'win32-x64', 'tgrep.exe'), '');
			fs.mkdirSync(path.join(appNodeModulesDir, '@vscode', 'ripgrep-universal', 'bin', 'win32-x64'), { recursive: true });
			fs.writeFileSync(path.join(appNodeModulesDir, '@vscode', 'ripgrep-universal', 'bin', 'win32-x64', 'rg.exe'), '');

			prepareBuiltInCopilotRipgrepShim('win32', 'x64', builtInCopilotExtensionDir, appNodeModulesDir, { sourceCopilotSdkDir });

			assert.strictEqual(fs.readFileSync(path.join(extensionCopilotDir, 'sdk', 'index.js'), 'utf8'), 'SDK');
			assert(fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'win32-x64', 'runtime.node')));
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
			fs.writeFileSync(path.join(extensionCopilotDir, 'sdk', 'index.js'), '');
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
			fs.writeFileSync(path.join(extensionCopilotDir, 'sdk', 'index.js'), '');
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
				...copilotPlatforms.flatMap(platform => [
					`!**/node_modules/@github/copilot-${platform}/**`,
					`!**/node_modules/@github/copilot-sdk-${platform}/**`,
				]),
			]
		);
	});

	test('keeps only the target architecture of @microsoft/mxc-sdk', () => {
		assert.deepStrictEqual(
			getMxcExcludeFilter('x64'),
			[
				'**',
				'!**/node_modules/@microsoft/mxc-sdk/bin/arm64/**',
			]
		);
		assert.deepStrictEqual(
			getMxcExcludeFilter('arm64'),
			[
				'**',
				'!**/node_modules/@microsoft/mxc-sdk/bin/x64/**',
			]
		);
	});

	test('strips every @microsoft/mxc-sdk architecture for unsupported armhf builds', () => {
		assert.deepStrictEqual(
			getMxcExcludeFilter('armhf'),
			[
				'**',
				'!**/node_modules/@microsoft/mxc-sdk/bin/x64/**',
				'!**/node_modules/@microsoft/mxc-sdk/bin/arm64/**',
			]
		);
	});
});

function assertCopilotPlatformPackageIncludes(patterns: string[], packageDir: string, relativeFiles: string[]): void {
	assert(patterns.includes(`${packageDir}/**`));
	for (const relativeFile of relativeFiles) {
		assert(matchesGlob(`${packageDir}/${relativeFile}`, patterns), relativeFile);
	}
}

function assertOptionalCopilotNativeDependenciesExcluded(patterns: string[], packageDir: string): void {
	for (const dir of ['clipboard', 'foundry-local-sdk', 'mxc-bin', 'pvrecorder', 'webview']) {
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
