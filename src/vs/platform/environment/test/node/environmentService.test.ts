/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as path from 'path';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { parseExtensionHostPort, parseUserDataDir } from 'vs/platform/environment/node/environmentService';

suite('EnvironmentService', () => {

	test('parseExtensionHostPort when built', () => {
		const parse = a => parseExtensionHostPort(parseArgs(a), true);

		assert.deepEqual(parse([]), { port: null, break: false });
		assert.deepEqual(parse(['--debugPluginHost']), { port: null, break: false });
		assert.deepEqual(parse(['--debugPluginHost=1234']), { port: 1234, break: false });
		assert.deepEqual(parse(['--debugBrkPluginHost']), { port: null, break: false });
		assert.deepEqual(parse(['--debugBrkPluginHost=5678']), { port: 5678, break: true });
		assert.deepEqual(parse(['--debugPluginHost=1234', '--debugBrkPluginHost=5678']), { port: 5678, break: true });
	});

	test('parseExtensionHostPort when unbuilt', () => {
		const parse = a => parseExtensionHostPort(parseArgs(a), false);

		assert.deepEqual(parse([]), { port: 5870, break: false });
		assert.deepEqual(parse(['--debugPluginHost']), { port: 5870, break: false });
		assert.deepEqual(parse(['--debugPluginHost=1234']), { port: 1234, break: false });
		assert.deepEqual(parse(['--debugBrkPluginHost']), { port: 5870, break: false });
		assert.deepEqual(parse(['--debugBrkPluginHost=5678']), { port: 5678, break: true });
		assert.deepEqual(parse(['--debugPluginHost=1234', '--debugBrkPluginHost=5678']), { port: 5678, break: true });
	});

	test('userDataPath', () => {
		const parse = (a, b: { cwd: () => string, env: { [key: string]: string } }) => parseUserDataDir(parseArgs(a), <any>b);

		assert.equal(parse(['--user-data-dir', './dir'], { cwd: () => '/foo', env: {} }), path.resolve('/foo/dir'),
			'should use cwd when --user-data-dir is specified');
		assert.equal(parse(['--user-data-dir', './dir'], { cwd: () => '/foo', env: { 'VSCODE_CWD': '/bar' } }), path.resolve('/bar/dir'),
			'should use VSCODE_CWD as the cwd when --user-data-dir is specified');
	});

	test('userDataPath should always take the first one', () => {
		const parse = (a, b: { cwd: () => string, env: { [key: string]: string } }) => parseUserDataDir(parseArgs(a), <any>b);

		assert.equal(parse(['--user-data-dir', './dir1', '--user-data-dir', './dir2'], { cwd: () => '/foo', env: {} }), path.resolve('/foo/dir1'),
			'should pick first --user-data-dir (dir1)');
	});
});