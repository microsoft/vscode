/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import 'mocha';
import * as os from 'os';
import * as path from 'path';
import { findExecutableOnPath } from '../../utils/findExecutable.electron';

suite('findExecutableOnPath', () => {

	test('only searches absolute PATH entries', () => {
		const existing = new Set([
			'node.exe',
			'.\\node.exe',
			'workspace\\node.exe',
			'\\workspace\\node.exe',
			'C:workspace\\node.exe',
			'C:\\trusted\\node.exe',
			'C:\\quoted dir\\node.com',
			'/usr/bin/node',
			'node',
		]);
		const isFile = (candidate: string) => existing.has(candidate);
		assert.deepStrictEqual({
			windows: findExecutableOnPath('node', { Path: ';.;workspace;\\workspace;C:workspace;C:\\trusted' }, 'win32', isFile),
			windowsQuotedAndComFirst: findExecutableOnPath('node', { PATH: '"C:\\quoted dir";C:\\trusted' }, 'win32', isFile),
			windowsOnlyRelative: findExecutableOnPath('node', { PATH: '.;workspace' }, 'win32', isFile),
			windowsNoPath: findExecutableOnPath('node', {}, 'win32', isFile),
			posix: findExecutableOnPath('node', { PATH: ':.:/usr/bin' }, 'linux', isFile),
			posixOnlyRelative: findExecutableOnPath('node', { PATH: '.:' }, 'linux', isFile),
		}, {
			windows: 'C:\\trusted\\node.exe',
			windowsQuotedAndComFirst: 'C:\\quoted dir\\node.com',
			windowsOnlyRelative: undefined,
			windowsNoPath: undefined,
			posix: '/usr/bin/node',
			posixOnlyRelative: undefined,
		});
	});

	test('ignores an executable in the current working directory', () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), 'find-executable-'));
		const previousCwd = process.cwd();
		try {
			const name = process.platform === 'win32' ? 'node.exe' : 'node';
			const workspace = path.join(root, 'workspace');
			const trusted = path.join(root, 'trusted');
			fs.mkdirSync(workspace);
			fs.mkdirSync(trusted);
			fs.writeFileSync(path.join(workspace, name), '', { mode: 0o755 });
			fs.writeFileSync(path.join(trusted, name), '', { mode: 0o755 });
			process.chdir(workspace);

			assert.deepStrictEqual([
				findExecutableOnPath('node', { PATH: ['.', '', trusted].join(path.delimiter) }),
				findExecutableOnPath('node', { PATH: '.' }),
			], [path.join(trusted, name), undefined]);
		} finally {
			process.chdir(previousCwd);
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
