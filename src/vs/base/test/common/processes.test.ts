/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as processes from '../../common/processes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Processes', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('removeDangerousEnvVariables', () => {
		test('removes DEBUG', () => {
			const env = { DEBUG: 'myapp:*', OTHER: 'value' };
			processes.removeDangerousEnvVariables(env);
			assert.strictEqual(env['DEBUG'], undefined);
			assert.strictEqual(env['OTHER'], 'value');
		});

		test('removes dangerous NODE_OPTIONS flags but keeps safe ones', () => {
			const env = { NODE_OPTIONS: '--max-old-space-size=4096 --require=./evil.js --inspect=9229' };
			processes.removeDangerousEnvVariables(env);
			assert.strictEqual(env['NODE_OPTIONS'], '--max-old-space-size=4096');
		});

		test('removes dangerous NODE_OPTIONS flags whose value is a separate token', () => {
			const env = { NODE_OPTIONS: '--max-old-space-size=4096 --require ./evil.js --stack-size=984' };
			processes.removeDangerousEnvVariables(env);
			assert.strictEqual(env['NODE_OPTIONS'], '--max-old-space-size=4096 --stack-size=984');
		});

		test('removes a dangerous flag with a quoted value containing spaces', () => {
			const env = { NODE_OPTIONS: '--require "./a evil.js" --max-old-space-size=4096' };
			processes.removeDangerousEnvVariables(env);
			assert.strictEqual(env['NODE_OPTIONS'], '--max-old-space-size=4096');
		});

		test('removes --eval and -e code execution flags', () => {
			const env = { NODE_OPTIONS: '--max-old-space-size=4096 -e "process.exit(1)"' };
			processes.removeDangerousEnvVariables(env);
			assert.strictEqual(env['NODE_OPTIONS'], '--max-old-space-size=4096');
		});

		test('preserves and re-quotes a safe value containing spaces', () => {
			const env = { NODE_OPTIONS: '--title="My App" --inspect=9229' };
			processes.removeDangerousEnvVariables(env);
			assert.strictEqual(env['NODE_OPTIONS'], '"--title=My App"');
		});

		test('removes NODE_OPTIONS entirely when only dangerous flags remain', () => {
			const env = { NODE_OPTIONS: '--require=./evil.js --inspect' };
			processes.removeDangerousEnvVariables(env);
			assert.strictEqual(env['NODE_OPTIONS'], undefined);
		});

		test('preserves NODE_OPTIONS with only safe flags', () => {
			const env = { NODE_OPTIONS: '--max-old-space-size=4096 --stack-size=65536' };
			processes.removeDangerousEnvVariables(env);
			assert.strictEqual(env['NODE_OPTIONS'], '--max-old-space-size=4096 --stack-size=65536');
		});

		test('removes all known dangerous NODE_OPTIONS flags', () => {
			const cases: [string, string | undefined][] = [
				// `--flag=value` form
				['--require=./mod.js', undefined],
				['-r=./mod.js', undefined],
				['--loader=./hook.js', undefined],
				['--experimental-loader=./hook.js', undefined],
				['--import=./mod.js', undefined],
				['--eval=1', undefined],
				['-e=1', undefined],
				['--inspect', undefined],
				['--inspect=9229', undefined],
				['--inspect-brk', undefined],
				['--inspect-brk=9229', undefined],
				['--inspect-port=9229', undefined],
				['--inspect-publish-uid=http', undefined],
				['--inspect-wait', undefined],
				['--debug', undefined],
				['--debug-brk', undefined],
				// `--flag value` (separate token) form
				['--require ./mod.js', undefined],
				['-r ./mod.js', undefined],
				['--loader ./hook.js', undefined],
				['--experimental-loader ./hook.js', undefined],
				['--import ./mod.js', undefined],
				['--inspect 9229', undefined],
				['--eval "code()"', undefined],
				['-e "code()"', undefined],
				// Safe flags are preserved
				['--max-old-space-size=4096', '--max-old-space-size=4096'],
			];
			for (const [input, expected] of cases) {
				const env = { NODE_OPTIONS: input };
				processes.removeDangerousEnvVariables(env);
				assert.strictEqual(env['NODE_OPTIONS'], expected, `input: ${input}`);
			}
		});

		test('handles undefined env gracefully', () => {
			assert.doesNotThrow(() => processes.removeDangerousEnvVariables(undefined));
		});
	});

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
});
