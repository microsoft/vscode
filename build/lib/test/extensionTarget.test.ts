/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { getExtensionTarget, getPlatformSpecificAssetName } from '../extensionTarget.ts';

suite('extensionTarget', () => {
	test('getExtensionTarget resolves marketplace target platforms', () => {
		const notAlpine = () => false;
		const alpine = () => true;

		assert.deepStrictEqual({
			darwinX64: getExtensionTarget('darwin', 'x64'),
			darwinArm64: getExtensionTarget('darwin', 'arm64'),
			win32X64: getExtensionTarget('win32', 'x64'),
			win32Arm64: getExtensionTarget('win32', 'arm64'),
			win32Ia32: getExtensionTarget('win32', 'ia32'),
			linuxX64: getExtensionTarget('linux', 'x64', notAlpine),
			linuxArm64: getExtensionTarget('linux', 'arm64', notAlpine),
			linuxArmhf: getExtensionTarget('linux', 'armhf', notAlpine),
			linuxArmProcess: getExtensionTarget('linux', 'arm', notAlpine),
			linuxUnsupportedArch: getExtensionTarget('linux', 'riscv64', notAlpine),
			alpineX64: getExtensionTarget('linux', 'x64', alpine),
			alpineArm64: getExtensionTarget('linux', 'arm64', alpine),
			unsupported: getExtensionTarget('sunos', 'x64'),
		}, {
			darwinX64: 'darwin-x64',
			darwinArm64: 'darwin-arm64',
			win32X64: 'win32-x64',
			win32Arm64: 'win32-arm64',
			win32Ia32: undefined,
			linuxX64: 'linux-x64',
			linuxArm64: 'linux-arm64',
			linuxArmhf: 'linux-armhf',
			linuxArmProcess: 'linux-armhf',
			linuxUnsupportedArch: undefined,
			alpineX64: 'alpine-x64',
			alpineArm64: 'alpine-arm64',
			unsupported: undefined,
		});
	});

	test('getPlatformSpecificAssetName uses the <name>-<target>.vsix convention', () => {
		assert.deepStrictEqual({
			darwinX64: getPlatformSpecificAssetName('my-ext', 'darwin-x64'),
			darwinArm64: getPlatformSpecificAssetName('my-ext', 'darwin-arm64'),
			win32X64: getPlatformSpecificAssetName('my-ext', 'win32-x64'),
			win32Arm64: getPlatformSpecificAssetName('my-ext', 'win32-arm64'),
			linuxX64: getPlatformSpecificAssetName('my-ext', 'linux-x64'),
			linuxArm64: getPlatformSpecificAssetName('my-ext', 'linux-arm64'),
			linuxArmhf: getPlatformSpecificAssetName('my-ext', 'linux-armhf'),
			alpineX64: getPlatformSpecificAssetName('my-ext', 'alpine-x64'),
			alpineArm64: getPlatformSpecificAssetName('my-ext', 'alpine-arm64'),
		}, {
			darwinX64: 'my-ext-darwin-x64.vsix',
			darwinArm64: 'my-ext-darwin-arm64.vsix',
			win32X64: 'my-ext-win32-x64.vsix',
			win32Arm64: 'my-ext-win32-arm64.vsix',
			linuxX64: 'my-ext-linux-x64.vsix',
			linuxArm64: 'my-ext-linux-arm64.vsix',
			linuxArmhf: 'my-ext-linux-armhf.vsix',
			alpineX64: 'my-ext-alpine-x64.vsix',
			alpineArm64: 'my-ext-alpine-arm64.vsix',
		});
	});

	test('getPlatformSpecificAssetName throws for unsupported targets', () => {
		assert.throws(() => getPlatformSpecificAssetName('my-ext', 'linux'), /Invalid target platform/);
		assert.throws(() => getPlatformSpecificAssetName('my-ext', 'win32-x86'), /Invalid target platform/);
		assert.throws(() => getPlatformSpecificAssetName('my-ext', 'freebsd-x64'), /Invalid target platform/);
		assert.throws(() => getPlatformSpecificAssetName('my-ext', ''), /Invalid target platform/);
	});
});
