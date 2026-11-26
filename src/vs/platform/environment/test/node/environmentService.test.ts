/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAppBundleRoot, parseExtensionHostDebugPort } from '../../common/environmentService.js';
import { OPTIONS, parseArgs } from '../../node/argv.js';
import { NativeEnvironmentService } from '../../node/environmentService.js';
import product from '../../../product/common/product.js';

suite('EnvironmentService', () => {

	suite('application bundle root', () => {
		test('keeps source builds at appRoot even when the checkout resembles a packaged layout', () => {
			class SourceEnvironmentService extends NativeEnvironmentService {
				override get appRoot(): string { return '/workspace/resources/app'; }
				override get isBuilt(): boolean { return false; }
			}
			const service = new SourceEnvironmentService(parseArgs([], OPTIONS), { _serviceBrand: undefined, ...product });
			assert.strictEqual(service.appBundleRoot, '/workspace/resources/app');
		});

		for (const { name, os, appRoot, versioned, expected } of [
			{ name: 'macOS Insiders', os: OperatingSystem.Macintosh, appRoot: '/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app', expected: '/Applications/Visual Studio Code - Insiders.app/Contents' },
			{ name: 'relocated macOS', os: OperatingSystem.Macintosh, appRoot: '/custom/Code.app/Contents/Resources/app', expected: '/custom/Code.app/Contents' },
			{ name: 'Windows', os: OperatingSystem.Windows, appRoot: 'C:\\Program Files\\Microsoft VS Code\\resources\\app', expected: 'C:\\Program Files\\Microsoft VS Code' },
			{ name: 'versioned Windows', os: OperatingSystem.Windows, appRoot: 'C:\\Custom Code\\commit-hash\\resources\\app', versioned: true, expected: 'C:\\Custom Code' },
			{ name: 'Linux', os: OperatingSystem.Linux, appRoot: '/usr/share/code-insiders/resources/app', expected: '/usr/share/code-insiders' },
			{ name: 'relocated Linux', os: OperatingSystem.Linux, appRoot: '/opt/custom code/resources/app', expected: '/opt/custom code' },
			{ name: 'source checkout', os: OperatingSystem.Linux, appRoot: '/home/user/vscode', expected: '/home/user/vscode' },
			{ name: 'standalone server', os: OperatingSystem.Linux, appRoot: '/home/user/.vscode-server/bin/commit', expected: '/home/user/.vscode-server/bin/commit' },
			{ name: 'non-bundle macOS', os: OperatingSystem.Macintosh, appRoot: '/custom/resources/app', expected: '/custom/resources/app' },
			{ name: 'filesystem root', os: OperatingSystem.Linux, appRoot: '/resources/app', expected: '/resources/app' },
			{ name: 'versioned Windows drive root', os: OperatingSystem.Windows, appRoot: 'C:\\version\\resources\\app', versioned: true, expected: 'C:\\version\\resources\\app' },
		]) {
			test(name, () => {
				assert.strictEqual(getAppBundleRoot(appRoot, os, versioned ?? false), expected);
			});
		}
	});

	test('parseExtensionHostPort when built', () => {
		const parse = (a: string[]) => parseExtensionHostDebugPort(parseArgs(a, OPTIONS), true);

		assert.deepStrictEqual(parse([]), { port: null, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--debugPluginHost']), { port: null, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--debugPluginHost=1234']), { port: 1234, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--debugBrkPluginHost']), { port: null, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--debugBrkPluginHost=5678']), { port: 5678, break: true, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--debugPluginHost=1234', '--debugBrkPluginHost=5678', '--debugId=7']), { port: 5678, break: true, env: undefined, debugId: '7' });

		assert.deepStrictEqual(parse(['--inspect-extensions']), { port: null, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--inspect-extensions=1234']), { port: 1234, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--inspect-brk-extensions']), { port: null, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--inspect-brk-extensions=5678']), { port: 5678, break: true, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--inspect-extensions=1234', '--inspect-brk-extensions=5678', '--debugId=7']), { port: 5678, break: true, env: undefined, debugId: '7' });
		assert.deepStrictEqual(parse(['--inspect-extensions=1234', '--inspect-brk-extensions=5678', '--extensionEnvironment={"COOL":"1"}']), { port: 5678, break: true, env: { COOL: '1' }, debugId: undefined });
	});

	test('parseExtensionHostPort when unbuilt', () => {
		const parse = (a: string[]) => parseExtensionHostDebugPort(parseArgs(a, OPTIONS), false);

		assert.deepStrictEqual(parse([]), { port: 5870, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--debugPluginHost']), { port: 5870, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--debugPluginHost=1234']), { port: 1234, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--debugBrkPluginHost']), { port: 5870, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--debugBrkPluginHost=5678']), { port: 5678, break: true, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--debugPluginHost=1234', '--debugBrkPluginHost=5678', '--debugId=7']), { port: 5678, break: true, env: undefined, debugId: '7' });

		assert.deepStrictEqual(parse(['--inspect-extensions']), { port: 5870, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--inspect-extensions=1234']), { port: 1234, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--inspect-brk-extensions']), { port: 5870, break: false, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--inspect-brk-extensions=5678']), { port: 5678, break: true, env: undefined, debugId: undefined });
		assert.deepStrictEqual(parse(['--inspect-extensions=1234', '--inspect-brk-extensions=5678', '--debugId=7']), { port: 5678, break: true, env: undefined, debugId: '7' });
	});

	// https://github.com/microsoft/vscode/issues/78440
	test('careful with boolean file names', function () {
		let actual = parseArgs(['-r', 'arg.txt'], OPTIONS);
		assert(actual['reuse-window']);
		assert.deepStrictEqual(actual._, ['arg.txt']);

		actual = parseArgs(['-r', 'true.txt'], OPTIONS);
		assert(actual['reuse-window']);
		assert.deepStrictEqual(actual._, ['true.txt']);
	});

	test('userDataDir', () => {
		const service1 = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), { _serviceBrand: undefined, ...product });
		assert.ok(service1.userDataPath.length > 0);

		const args = parseArgs(process.argv, OPTIONS);
		args['user-data-dir'] = '/userDataDir/folder';

		const service2 = new NativeEnvironmentService(args, { _serviceBrand: undefined, ...product });
		assert.notStrictEqual(service1.userDataPath, service2.userDataPath);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
