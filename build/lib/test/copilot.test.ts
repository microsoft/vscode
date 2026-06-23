/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { copilotPlatforms, getCopilotExcludeFilter, getCopilotRuntimePrebuildFiles } from '../copilot.ts';

suite('copilot', () => {
	test('keeps the public copilot platform package include list narrow', () => {
		const files = getCopilotRuntimePrebuildFiles('linux', 'x64');

		assert.deepStrictEqual(files, [
			'node_modules/@github/copilot-linux-x64/package.json',
			'node_modules/@github/copilot-linux-x64/copilot',
		]);
		assertNoBundledOptionalCopilotNativeDependencies(files);
	});

	test('uses the linuxmusl package executable for alpine builds', () => {
		const files = getCopilotRuntimePrebuildFiles('alpine', 'x64');

		assert.deepStrictEqual(files, [
			'node_modules/@github/copilot-linuxmusl-x64/package.json',
			'node_modules/@github/copilot-linuxmusl-x64/copilot',
		]);
		assertNoBundledOptionalCopilotNativeDependencies(files);
	});

	test('uses the .exe package executable for windows builds', () => {
		assert.deepStrictEqual(getCopilotRuntimePrebuildFiles('win32', 'x64'), [
			'node_modules/@github/copilot-win32-x64/package.json',
			'node_modules/@github/copilot-win32-x64/copilot.exe',
		]);

		assert.deepStrictEqual(getCopilotRuntimePrebuildFiles('win32', 'arm64'), [
			'node_modules/@github/copilot-win32-arm64/package.json',
			'node_modules/@github/copilot-win32-arm64/copilot.exe',
		]);
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

function assertNoBundledOptionalCopilotNativeDependencies(files: string[]): void {
	for (const file of files) {
		assert(!file.includes('/clipboard/'), file);
		assert(!file.includes('/foundry-local-sdk/'), file);
		assert(!file.includes('/mxc-bin/'), file);
		assert(!file.includes('/pvrecorder/'), file);
	}
}
