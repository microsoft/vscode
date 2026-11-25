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

	test('sanitizeProcessEnvironment restores Snap original values', () => {
		const env = {
			FOO: 'bar',
			GTK_PATH: '/snap/code/191/usr/lib/x86_64-linux-gnu/gtk-3.0',
			GTK_PATH_VSCODE_SNAP_ORIG: '/usr/lib/original-gtk',
			GIO_MODULE_DIR: '/snap/code/191/usr/lib/gio',
			GIO_MODULE_DIR_VSCODE_SNAP_ORIG: '',
			GTK_EXE_PREFIX: '/snap/code/191/usr',
			GTK_EXE_PREFIX_VSCODE_SNAP_ORIG: '/usr',
			XDG_SESSION_TYPE: 'wayland',
			XDG_SESSION_TYPE_VSCODE_SNAP_ORIG: 'x11',
			GDK_BACKEND: 'wayland',
			GDK_BACKEND_VSCODE_SNAP_ORIG: 'x11',
			GDK_PIXBUF_MODULE_FILE: '/snap/code/191/usr/lib/gdk-pixbuf-loaders.cache',
			GDK_PIXBUF_MODULE_FILE_VSCODE_SNAP_ORIG: '/usr/lib/gdk-pixbuf-loaders.cache',
			GDK_PIXBUF_MODULEDIR: '/snap/code/191/usr/lib/gdk-pixbuf-2.0/loaders',
			GDK_PIXBUF_MODULEDIR_VSCODE_SNAP_ORIG: '/usr/lib/gdk-pixbuf-2.0/loaders',
			LIBGL_DRIVERS_PATH: '/snap/code/191/usr/lib/dri',
			LIBGL_DRIVERS_PATH_VSCODE_SNAP_ORIG: '/usr/lib/dri',
			PIPEWIRE_CONFIG_NAME: '/snap/code/191/usr/share/pipewire/client.conf',
			PIPEWIRE_CONFIG_NAME_VSCODE_SNAP_ORIG: 'pipewire-client.conf',
			MOZ_ENABLE_WAYLAND: '1',
			MOZ_ENABLE_WAYLAND_VSCODE_SNAP_ORIG: '0',
		};
		processes.sanitizeProcessEnvironment(env);
		assert.deepStrictEqual(env, {
			FOO: 'bar',
			GTK_PATH: '/usr/lib/original-gtk',
			GTK_EXE_PREFIX: '/usr',
			XDG_SESSION_TYPE: 'x11',
			GDK_BACKEND: 'x11',
			GDK_PIXBUF_MODULE_FILE: '/usr/lib/gdk-pixbuf-loaders.cache',
			GDK_PIXBUF_MODULEDIR: '/usr/lib/gdk-pixbuf-2.0/loaders',
			LIBGL_DRIVERS_PATH: '/usr/lib/dri',
			PIPEWIRE_CONFIG_NAME: 'pipewire-client.conf',
			MOZ_ENABLE_WAYLAND: '0',
		});
	});

	test('restores only Snap desktop launcher markers', () => {
		const env = {
			FOO: 'bar',
			VSCODE_PID: '123',
			GDK_BACKEND: 'wayland',
			GDK_BACKEND_VSCODE_SNAP_ORIG: 'x11',
			UNSET_VALUE: '/snap/code/191/value',
			UNSET_VALUE_VSCODE_SNAP_ORIG: '',
		};

		processes.restoreSnapExportedVariables(env);

		assert.deepStrictEqual(env, {
			FOO: 'bar',
			VSCODE_PID: '123',
			GDK_BACKEND: 'x11',
		});
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
