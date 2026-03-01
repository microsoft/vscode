/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as processes from '../../common/processes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Processes', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sanitizeProcessEnvironment', () => {
		const env = {
			FOO: 'bar',
			ELECTRON_ENABLE_STACK_DUMPING: 'x',
			ELECTRON_ENABLE_LOGGING: 'x',
			ELECTRON_NO_ASAR: 'x',
			ELECTRON_NO_ATTACH_CONSOLE: 'x',
			ELECTRON_RUN_AS_NODE: 'x',
			VSCODE_CLI: 'x',
			VSCODE_DEV: 'x',
			VSCODE_IPC_HOOK: 'x',
			VSCODE_NLS_CONFIG: 'x',
			VSCODE_PORTABLE: '3',
			VSCODE_PID: 'x',
			VSCODE_SHELL_LOGIN: '1',
			VSCODE_CODE_CACHE_PATH: 'x',
			VSCODE_NEW_VAR: 'x',
			GDK_PIXBUF_MODULE_FILE: 'x',
			GDK_PIXBUF_MODULEDIR: 'x',
			VSCODE_PYTHON_BASH_ACTIVATE: 'source /path/to/venv/bin/activate',
			VSCODE_PYTHON_ZSH_ACTIVATE: 'source /path/to/venv/bin/activate',
			VSCODE_PYTHON_PWSH_ACTIVATE: '. /path/to/venv/Scripts/Activate.ps1',
			VSCODE_PYTHON_FISH_ACTIVATE: 'source /path/to/venv/bin/activate.fish',
			VSCODE_PYTHON_AUTOACTIVATE_GUARD: '1'
		};
		processes.sanitizeProcessEnvironment(env);
		assert.strictEqual(env['FOO'], 'bar');
		assert.strictEqual(env['VSCODE_SHELL_LOGIN'], '1');
		assert.strictEqual(env['VSCODE_PORTABLE'], '3');
		assert.strictEqual(env['VSCODE_PYTHON_BASH_ACTIVATE'], undefined);
		assert.strictEqual(env['VSCODE_PYTHON_ZSH_ACTIVATE'], undefined);
		assert.strictEqual(env['VSCODE_PYTHON_PWSH_ACTIVATE'], undefined);
		assert.strictEqual(env['VSCODE_PYTHON_FISH_ACTIVATE'], undefined);
		assert.strictEqual(env['VSCODE_PYTHON_AUTOACTIVATE_GUARD'], undefined);
		assert.strictEqual(Object.keys(env).length, 3);
	});

	test('sanitizeProcessEnvironment restores snap original values', () => {
		const env: Record<string, string> = {
			FOO: 'bar',
			GTK_PATH: '/snap/code/191/usr/lib/x86_64-linux-gnu/gtk-3.0',
			GTK_PATH_VSCODE_SNAP_ORIG: '/usr/lib/original-gtk',
			GIO_MODULE_DIR: '/snap/code/191/usr/lib/gio',
			GIO_MODULE_DIR_VSCODE_SNAP_ORIG: '',
			GTK_EXE_PREFIX: '/snap/code/191/usr',
			GTK_EXE_PREFIX_VSCODE_SNAP_ORIG: '/usr',
		};
		processes.sanitizeProcessEnvironment(env);
		assert.deepStrictEqual(env, {
			FOO: 'bar',
			GTK_PATH: '/usr/lib/original-gtk',
			GTK_EXE_PREFIX: '/usr',
		});
	});
});
