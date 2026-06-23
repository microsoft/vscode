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
}

function matchesGlob(file: string, patterns: string[]): boolean {
	let included = false;
	for (const pattern of patterns) {
		const isExclude = pattern.startsWith('!');
		const glob = isExclude ? pattern.slice(1) : pattern;
		if (glob.endsWith('/**') && file.startsWith(glob.slice(0, -2))) {
			included = !isExclude;
		} else if (file === glob) {
			included = !isExclude;
		}
	}
	return included;
}
