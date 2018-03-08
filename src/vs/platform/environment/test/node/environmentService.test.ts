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

		assert.deepEqual(parse([]), { port: null, break: false, debugId: undefined });
		assert.deepEqual(parse(['--debugPluginHost']), { port: null, break: false, debugId: undefined });
		assert.deepEqual(parse(['--debugPluginHost=1234']), { port: 1234, break: false, debugId: undefined });
		assert.deepEqual(parse(['--debugBrkPluginHost']), { port: null, break: false, debugId: undefined });
		assert.deepEqual(parse(['--debugBrkPluginHost=5678']), { port: 5678, break: true, debugId: undefined });
		assert.deepEqual(parse(['--debugPluginHost=1234', '--debugBrkPluginHost=5678', '--debugId=7']), { port: 5678, break: true, debugId: '7' });
	});

	test('parseExtensionHostPort when unbuilt', () => {
		const parse = a => parseExtensionHostPort(parseArgs(a), false);

		assert.deepEqual(parse([]), { port: 5870, break: false, debugId: undefined });
		assert.deepEqual(parse(['--debugPluginHost']), { port: 5870, break: false, debugId: undefined });
		assert.deepEqual(parse(['--debugPluginHost=1234']), { port: 1234, break: false, debugId: undefined });
		assert.deepEqual(parse(['--debugBrkPluginHost']), { port: 5870, break: false, debugId: undefined });
		assert.deepEqual(parse(['--debugBrkPluginHost=5678']), { port: 5678, break: true, debugId: undefined });
		assert.deepEqual(parse(['--debugPluginHost=1234', '--debugBrkPluginHost=5678', '--debugId=7']), { port: 5678, break: true, debugId: '7' });
	});

	test('userDataPath', () => {
		const parse = (a, b: { cwd: () => string, env: { [key: string]: string } }) => parseUserDataDir(parseArgs(a), <any>b);

		assert.equal(parse(['--user-data-dir', './dir'], { cwd: () => '/foo', env: {} }), path.resolve('/foo/dir'),
			'should use cwd when --user-data-dir is specified');
		assert.equal(parse(['--user-data-dir', './dir'], { cwd: () => '/foo', env: { 'VSCODE_CWD': '/bar' } }), path.resolve('/bar/dir'),
			'should use VSCODE_CWD as the cwd when --user-data-dir is specified');
	});
});
