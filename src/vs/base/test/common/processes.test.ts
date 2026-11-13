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
			ELECTRON_GET_USE_PROXY: '2',
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
		assert.strictEqual(env['ELECTRON_GET_USE_PROXY'], '2');
		assert.strictEqual(env['VSCODE_SHELL_LOGIN'], '1');
		assert.strictEqual(env['VSCODE_PORTABLE'], '3');
		assert.strictEqual(env['VSCODE_PYTHON_BASH_ACTIVATE'], undefined);
		assert.strictEqual(env['VSCODE_PYTHON_ZSH_ACTIVATE'], undefined);
		assert.strictEqual(env['VSCODE_PYTHON_PWSH_ACTIVATE'], undefined);
		assert.strictEqual(env['VSCODE_PYTHON_FISH_ACTIVATE'], undefined);
		assert.strictEqual(env['VSCODE_PYTHON_AUTOACTIVATE_GUARD'], undefined);
		assert.strictEqual(Object.keys(env).length, 4);
	});

	test('removeDangerousEnvVariables', () => {
		const env = {
			SAFE: 'value',
			DEBUG: 'value',
			debug: 'value',
			NODE_OPTIONS: '--import=data:text/javascript,',
			Node_Options: '--require=module',
			VSCODE_NODE_OPTIONS: '--import=data:text/javascript,',
			Vscode_Node_Options: '--require=module',
			LD_PRELOAD: 'library',
			ld_preload: 'library',
			DYLD_INSERT_LIBRARIES: 'library',
			Dyld_Insert_Libraries: 'library'
		};

		processes.removeDangerousEnvVariables(env);

		assert.deepStrictEqual(env, { SAFE: 'value' });
	});
});
