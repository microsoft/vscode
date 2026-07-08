/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { suite, test } from 'node:test';
import { create } from 'tar';
import { copilotPlatforms, ensureCopilotPlatformPackage, getCopilotExcludeFilter, getCopilotRuntimePrebuildFiles, prepareBuiltInCopilotRipgrepShim } from '../copilot.ts';

suite('copilot', () => {
	test('keeps the public copilot platform package include list scoped to the selected package', () => {
		const files = getCopilotRuntimePrebuildFiles('linux', 'x64');

		assert.deepStrictEqual(files, [
			'node_modules/@github/copilot-linux-x64/**',
			'!node_modules/@github/copilot-linux-x64/copilot',
			'!node_modules/@github/copilot-linux-x64/copilot.exe',
			'!node_modules/@github/copilot-linux-x64/clipboard/**',
			'!node_modules/@github/copilot-linux-x64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-linux-x64/mxc-bin/**',
			'!node_modules/@github/copilot-linux-x64/pvrecorder/**',
			'!node_modules/@github/copilot-linux-x64/prebuilds/*/computer.node',
			'!node_modules/@github/copilot-linux-x64/prebuilds/*/computer-use-mcp',
			'!node_modules/@github/copilot-linux-x64/prebuilds/*/computer-use-mcp.exe',
			'!node_modules/@github/copilot-linux-x64/prebuilds/*/Copilot Computer Use.app/**',
			'!node_modules/@github/copilot-linux-x64/prebuilds/*/CopilotComputerUse.exe',
			'!node_modules/@github/copilot-linux-x64/prebuilds/*/keytar.node',
			'!node_modules/@github/copilot-linux-x64/prebuilds/*/cli-native.node',
		]);
		assertCopilotPlatformPackageIncludes(files, 'node_modules/@github/copilot-linux-x64', [
			'index.js',
			'app.js',
			'prebuilds/linux-x64/runtime.node',
			'prebuilds/linux-x64/pty.node',
		]);
		assertCopilotStandaloneExecutableExcluded(files, 'node_modules/@github/copilot-linux-x64');
		assertOptionalCopilotNativeDependenciesExcluded(files, 'node_modules/@github/copilot-linux-x64');
	});

	test('uses the linuxmusl package runtime for alpine builds', () => {
		const files = getCopilotRuntimePrebuildFiles('alpine', 'x64');

		assert.deepStrictEqual(files, [
			'node_modules/@github/copilot-linuxmusl-x64/**',
			'!node_modules/@github/copilot-linuxmusl-x64/copilot',
			'!node_modules/@github/copilot-linuxmusl-x64/copilot.exe',
			'!node_modules/@github/copilot-linuxmusl-x64/clipboard/**',
			'!node_modules/@github/copilot-linuxmusl-x64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-linuxmusl-x64/mxc-bin/**',
			'!node_modules/@github/copilot-linuxmusl-x64/pvrecorder/**',
			'!node_modules/@github/copilot-linuxmusl-x64/prebuilds/*/computer.node',
			'!node_modules/@github/copilot-linuxmusl-x64/prebuilds/*/computer-use-mcp',
			'!node_modules/@github/copilot-linuxmusl-x64/prebuilds/*/computer-use-mcp.exe',
			'!node_modules/@github/copilot-linuxmusl-x64/prebuilds/*/Copilot Computer Use.app/**',
			'!node_modules/@github/copilot-linuxmusl-x64/prebuilds/*/CopilotComputerUse.exe',
			'!node_modules/@github/copilot-linuxmusl-x64/prebuilds/*/keytar.node',
			'!node_modules/@github/copilot-linuxmusl-x64/prebuilds/*/cli-native.node',
		]);
		assertCopilotPlatformPackageIncludes(files, 'node_modules/@github/copilot-linuxmusl-x64', [
			'index.js',
			'app.js',
			'prebuilds/linuxmusl-x64/runtime.node',
		]);
		assertCopilotStandaloneExecutableExcluded(files, 'node_modules/@github/copilot-linuxmusl-x64');
		assertOptionalCopilotNativeDependenciesExcluded(files, 'node_modules/@github/copilot-linuxmusl-x64');
	});

	test('uses the .exe package runtime for windows builds', () => {
		assert.deepStrictEqual(getCopilotRuntimePrebuildFiles('win32', 'x64'), [
			'node_modules/@github/copilot-win32-x64/**',
			'!node_modules/@github/copilot-win32-x64/copilot',
			'!node_modules/@github/copilot-win32-x64/copilot.exe',
			'!node_modules/@github/copilot-win32-x64/clipboard/**',
			'!node_modules/@github/copilot-win32-x64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-win32-x64/mxc-bin/**',
			'!node_modules/@github/copilot-win32-x64/pvrecorder/**',
			'!node_modules/@github/copilot-win32-x64/prebuilds/*/computer.node',
			'!node_modules/@github/copilot-win32-x64/prebuilds/*/computer-use-mcp',
			'!node_modules/@github/copilot-win32-x64/prebuilds/*/computer-use-mcp.exe',
			'!node_modules/@github/copilot-win32-x64/prebuilds/*/Copilot Computer Use.app/**',
			'!node_modules/@github/copilot-win32-x64/prebuilds/*/CopilotComputerUse.exe',
			'!node_modules/@github/copilot-win32-x64/prebuilds/*/keytar.node',
		]);
		assertCopilotPlatformPackageIncludes(getCopilotRuntimePrebuildFiles('win32', 'x64'), 'node_modules/@github/copilot-win32-x64', [
			'index.js',
			'app.js',
			'prebuilds/win32-x64/cli-native.node',
			'prebuilds/win32-x64/runtime.node',
			'prebuilds/win32-x64/conpty.node',
			'prebuilds/win32-x64/conpty_console_list.node',
			'prebuilds/win32-x64/conpty/OpenConsole.exe',
			'prebuilds/win32-x64/conpty/conpty.dll',
		]);
		assertCopilotStandaloneExecutableExcluded(getCopilotRuntimePrebuildFiles('win32', 'x64'), 'node_modules/@github/copilot-win32-x64');

		assert.deepStrictEqual(getCopilotRuntimePrebuildFiles('win32', 'arm64'), [
			'node_modules/@github/copilot-win32-arm64/**',
			'!node_modules/@github/copilot-win32-arm64/copilot',
			'!node_modules/@github/copilot-win32-arm64/copilot.exe',
			'!node_modules/@github/copilot-win32-arm64/clipboard/**',
			'!node_modules/@github/copilot-win32-arm64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-win32-arm64/mxc-bin/**',
			'!node_modules/@github/copilot-win32-arm64/pvrecorder/**',
			'!node_modules/@github/copilot-win32-arm64/prebuilds/*/computer.node',
			'!node_modules/@github/copilot-win32-arm64/prebuilds/*/computer-use-mcp',
			'!node_modules/@github/copilot-win32-arm64/prebuilds/*/computer-use-mcp.exe',
			'!node_modules/@github/copilot-win32-arm64/prebuilds/*/Copilot Computer Use.app/**',
			'!node_modules/@github/copilot-win32-arm64/prebuilds/*/CopilotComputerUse.exe',
			'!node_modules/@github/copilot-win32-arm64/prebuilds/*/keytar.node',
		]);
		assertOptionalCopilotNativeDependenciesExcluded(getCopilotRuntimePrebuildFiles('win32', 'x64'), 'node_modules/@github/copilot-win32-x64');
		assertCopilotStandaloneExecutableExcluded(getCopilotRuntimePrebuildFiles('win32', 'arm64'), 'node_modules/@github/copilot-win32-arm64');
	});

	test('keeps macOS runtime prebuilds in the selected platform package', () => {
		const files = getCopilotRuntimePrebuildFiles('darwin', 'arm64');

		assertCopilotPlatformPackageIncludes(files, 'node_modules/@github/copilot-darwin-arm64', [
			'index.js',
			'app.js',
			'sea-loader.js',
			'prebuilds/darwin-arm64/runtime.node',
			'prebuilds/darwin-arm64/pty.node',
			'prebuilds/darwin-arm64/spawn-helper',
		]);
		assertCopilotStandaloneExecutableExcluded(files, 'node_modules/@github/copilot-darwin-arm64');
		assertOptionalCopilotNativeDependenciesExcluded(files, 'node_modules/@github/copilot-darwin-arm64');
	});

	test('materializes missing target platform packages from the lockfile', () => {
		const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-copilot-platform-test-'));
		const nodeModulesRoot = path.join(repoRoot, 'node_modules');
		try {
			fs.mkdirSync(nodeModulesRoot, { recursive: true });
			fs.writeFileSync(path.join(repoRoot, 'package-lock.json'), JSON.stringify({
				packages: {
					'node_modules/@github/copilot-darwin-x64': {
						version: '1.0.64-1',
					}
				}
			}));

			ensureCopilotPlatformPackage('darwin', 'x64', nodeModulesRoot, {
				packPackage: (_packageName, _version, tempDir) => {
					const packageRoot = path.join(tempDir, 'package');
					fs.mkdirSync(path.join(packageRoot, 'prebuilds', 'darwin-x64'), { recursive: true });
					fs.writeFileSync(path.join(packageRoot, 'index.js'), '');
					fs.writeFileSync(path.join(packageRoot, 'prebuilds', 'darwin-x64', 'runtime.node'), '');
					const tarball = path.join(tempDir, 'copilot-darwin-x64.tgz');
					create({ file: tarball, cwd: tempDir, gzip: true, sync: true }, ['package']);
					return tarball;
				}
			});

			assert(fs.existsSync(path.join(nodeModulesRoot, '@github', 'copilot-darwin-x64', 'index.js')));
			assert(fs.existsSync(path.join(nodeModulesRoot, '@github', 'copilot-darwin-x64', 'prebuilds', 'darwin-x64', 'runtime.node')));
		} finally {
			fs.rmSync(repoRoot, { recursive: true, force: true });
		}
	});

	test('excludes standalone copilot executables from the platform package dependency stream', () => {
		const files = getCopilotExcludeFilter('linux', 'x64');

		assert(files.includes('**'));
		assert(files.includes('!**/node_modules/@github/copilot-*/copilot'));
		assert(files.includes('!**/node_modules/@github/copilot-*/copilot.exe'));
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
			fs.mkdirSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'conpty'), { recursive: true });
			fs.writeFileSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'runtime.node'), '');
			fs.writeFileSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'conpty.node'), '');
			fs.writeFileSync(path.join(platformPackageDir, 'prebuilds', 'win32-x64', 'conpty', 'OpenConsole.exe'), '');
			fs.mkdirSync(path.join(platformPackageDir, 'tgrep', 'bin', 'win32-x64'), { recursive: true });
			fs.writeFileSync(path.join(platformPackageDir, 'tgrep', 'bin', 'win32-x64', 'tgrep.exe'), '');
			fs.mkdirSync(path.join(appNodeModulesDir, '@vscode', 'ripgrep-universal', 'bin', 'win32-x64'), { recursive: true });
			fs.writeFileSync(path.join(appNodeModulesDir, '@vscode', 'ripgrep-universal', 'bin', 'win32-x64', 'rg.exe'), '');

			prepareBuiltInCopilotRipgrepShim('win32', 'x64', builtInCopilotExtensionDir, appNodeModulesDir);

			assert(fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'win32-x64', 'runtime.node')));
			assert(fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'win32-x64', 'conpty.node')));
			assert(fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'win32-x64', 'conpty', 'OpenConsole.exe')));
			assert(!fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'prebuilds', 'linux-x64')));
			assert(fs.existsSync(path.join(extensionCopilotDir, 'tgrep', 'bin', 'win32-x64', 'tgrep.exe')));
			assert(fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'tgrep', 'bin', 'win32-x64', 'tgrep.exe')));
			assert(fs.existsSync(path.join(extensionCopilotDir, 'sdk', 'ripgrep', 'bin', 'win32-x64', 'rg.exe')));
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
				'!**/node_modules/@github/copilot-*/copilot',
				'!**/node_modules/@github/copilot-*/copilot.exe',
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

function assertCopilotStandaloneExecutableExcluded(patterns: string[], packageDir: string): void {
	for (const executable of ['copilot', 'copilot.exe']) {
		assert(patterns.includes(`!${packageDir}/${executable}`), executable);
		assert(!matchesGlob(`${packageDir}/${executable}`, patterns), executable);
	}
}

function assertOptionalCopilotNativeDependenciesExcluded(patterns: string[], packageDir: string): void {
	for (const dir of ['clipboard', 'foundry-local-sdk', 'mxc-bin', 'pvrecorder']) {
		assert(patterns.includes(`!${packageDir}/${dir}/**`), dir);
		assert(!matchesGlob(`${packageDir}/${dir}/index.js`, patterns), dir);
	}
	assert(patterns.includes(`!${packageDir}/prebuilds/*/computer.node`), 'computer.node');
	assert(!matchesGlob(`${packageDir}/prebuilds/linux-x64/computer.node`, patterns), 'computer.node');
	assert(patterns.includes(`!${packageDir}/prebuilds/*/computer-use-mcp`), 'computer-use-mcp');
	assert(!matchesGlob(`${packageDir}/prebuilds/darwin-arm64/computer-use-mcp`, patterns), 'computer-use-mcp');
	assert(patterns.includes(`!${packageDir}/prebuilds/*/computer-use-mcp.exe`), 'computer-use-mcp.exe');
	assert(!matchesGlob(`${packageDir}/prebuilds/win32-x64/computer-use-mcp.exe`, patterns), 'computer-use-mcp.exe');
	assert(patterns.includes(`!${packageDir}/prebuilds/*/Copilot Computer Use.app/**`), 'Copilot Computer Use.app');
	assert(!matchesGlob(`${packageDir}/prebuilds/darwin-arm64/Copilot Computer Use.app/Contents/MacOS/Copilot Computer Use`, patterns), 'Copilot Computer Use.app');
	assert(patterns.includes(`!${packageDir}/prebuilds/*/CopilotComputerUse.exe`), 'CopilotComputerUse.exe');
	assert(!matchesGlob(`${packageDir}/prebuilds/win32-x64/CopilotComputerUse.exe`, patterns), 'CopilotComputerUse.exe');
	assert(patterns.includes(`!${packageDir}/prebuilds/*/keytar.node`), 'keytar.node');
	assert(!matchesGlob(`${packageDir}/prebuilds/linux-x64/keytar.node`, patterns), 'keytar.node');

	if (!packageDir.includes('win32')) {
		assert(patterns.includes(`!${packageDir}/prebuilds/*/cli-native.node`), 'cli-native.node');
		assert(!matchesGlob(`${packageDir}/prebuilds/linux-x64/cli-native.node`, patterns), 'cli-native.node');
	}
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
