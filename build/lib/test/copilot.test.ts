/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { copilotPlatforms, getCopilotExcludeFilter, getCopilotRuntimePrebuildFiles } from '../copilot.ts';

suite('copilot', () => {
	test('keeps the public copilot platform package include list scoped to the selected package', () => {
		const files = getCopilotRuntimePrebuildFiles('linux', 'x64');

		assert.deepStrictEqual(files, [
			'node_modules/@github/copilot-linux-x64/**',
			'!node_modules/@github/copilot-linux-x64/clipboard/**',
			'!node_modules/@github/copilot-linux-x64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-linux-x64/mxc-bin/**',
			'!node_modules/@github/copilot-linux-x64/pvrecorder/**',
			'!node_modules/@github/copilot-linux-x64/prebuilds/*/computer.node',
		]);
		assertCopilotPlatformPackageIncludes(files, 'node_modules/@github/copilot-linux-x64', [
			'copilot',
			'prebuilds/linux-x64/runtime.node',
			'prebuilds/linux-x64/pty.node',
		]);
		assertOptionalCopilotNativeDependenciesExcluded(files, 'node_modules/@github/copilot-linux-x64');
	});

	test('uses the linuxmusl package runtime for alpine builds', () => {
		const files = getCopilotRuntimePrebuildFiles('alpine', 'x64');

		assert.deepStrictEqual(files, [
			'node_modules/@github/copilot-linuxmusl-x64/**',
			'!node_modules/@github/copilot-linuxmusl-x64/clipboard/**',
			'!node_modules/@github/copilot-linuxmusl-x64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-linuxmusl-x64/mxc-bin/**',
			'!node_modules/@github/copilot-linuxmusl-x64/pvrecorder/**',
			'!node_modules/@github/copilot-linuxmusl-x64/prebuilds/*/computer.node',
		]);
		assertCopilotPlatformPackageIncludes(files, 'node_modules/@github/copilot-linuxmusl-x64', [
			'copilot',
			'prebuilds/linuxmusl-x64/runtime.node',
		]);
		assertOptionalCopilotNativeDependenciesExcluded(files, 'node_modules/@github/copilot-linuxmusl-x64');
	});

	test('uses the .exe package runtime for windows builds', () => {
		assert.deepStrictEqual(getCopilotRuntimePrebuildFiles('win32', 'x64'), [
			'node_modules/@github/copilot-win32-x64/**',
			'!node_modules/@github/copilot-win32-x64/clipboard/**',
			'!node_modules/@github/copilot-win32-x64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-win32-x64/mxc-bin/**',
			'!node_modules/@github/copilot-win32-x64/pvrecorder/**',
			'!node_modules/@github/copilot-win32-x64/prebuilds/*/computer.node',
		]);
		assertCopilotPlatformPackageIncludes(getCopilotRuntimePrebuildFiles('win32', 'x64'), 'node_modules/@github/copilot-win32-x64', [
			'copilot.exe',
			'prebuilds/win32-x64/runtime.node',
			'prebuilds/win32-x64/conpty.node',
			'prebuilds/win32-x64/conpty_console_list.node',
			'prebuilds/win32-x64/conpty/OpenConsole.exe',
			'prebuilds/win32-x64/conpty/conpty.dll',
		]);

		assert.deepStrictEqual(getCopilotRuntimePrebuildFiles('win32', 'arm64'), [
			'node_modules/@github/copilot-win32-arm64/**',
			'!node_modules/@github/copilot-win32-arm64/clipboard/**',
			'!node_modules/@github/copilot-win32-arm64/foundry-local-sdk/**',
			'!node_modules/@github/copilot-win32-arm64/mxc-bin/**',
			'!node_modules/@github/copilot-win32-arm64/pvrecorder/**',
			'!node_modules/@github/copilot-win32-arm64/prebuilds/*/computer.node',
		]);
		assertOptionalCopilotNativeDependenciesExcluded(getCopilotRuntimePrebuildFiles('win32', 'x64'), 'node_modules/@github/copilot-win32-x64');
	});

	test('keeps macOS runtime prebuilds in the selected platform package', () => {
		const files = getCopilotRuntimePrebuildFiles('darwin', 'arm64');

		assertCopilotPlatformPackageIncludes(files, 'node_modules/@github/copilot-darwin-arm64', [
			'copilot',
			'index.js',
			'app.js',
			'sea-loader.js',
			'prebuilds/darwin-arm64/runtime.node',
			'prebuilds/darwin-arm64/pty.node',
			'prebuilds/darwin-arm64/spawn-helper',
		]);
		assertOptionalCopilotNativeDependenciesExcluded(files, 'node_modules/@github/copilot-darwin-arm64');
	});

	test('strips all copilot platform packages for unsupported armhf builds', () => {
		assert.deepStrictEqual(
			getCopilotExcludeFilter('linux', 'armhf'),
			[
				'**',
				...copilotPlatforms.map(platform => `!**/node_modules/@github/copilot-${platform}/**`)
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
	for (const dir of ['clipboard', 'foundry-local-sdk', 'mxc-bin', 'pvrecorder']) {
		assert(patterns.includes(`!${packageDir}/${dir}/**`), dir);
		assert(!matchesGlob(`${packageDir}/${dir}/index.js`, patterns), dir);
	}
	assert(patterns.includes(`!${packageDir}/prebuilds/*/computer.node`), 'computer.node');
	assert(!matchesGlob(`${packageDir}/prebuilds/linux-x64/computer.node`, patterns), 'computer.node');
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
	if (pattern.endsWith('/**')) {
		return file.startsWith(pattern.slice(0, -2));
	}

	if (pattern.includes('*')) {
		const regex = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('[^/]+')}$`);
		return regex.test(file);
	}

	return file === pattern;
}

function escapeRegExp(value: string): string {
	return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}
