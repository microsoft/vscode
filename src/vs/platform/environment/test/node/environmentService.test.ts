/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseExtensionHostDebugPort } from '../../common/environmentService.js';
import { OPTIONS, parseArgs } from '../../node/argv.js';
import { NativeEnvironmentService } from '../../node/environmentService.js';
import product from '../../../product/common/product.js';

suite('EnvironmentService', () => {

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
