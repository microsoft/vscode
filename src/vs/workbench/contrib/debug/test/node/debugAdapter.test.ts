/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { prepareWindowsBatchCommand } from '../../node/debugAdapter.js';

suite('Debug - Debug Adapter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('escapes Windows batch commands and arguments', () => {
		assert.deepStrictEqual(
			prepareWindowsBatchCommand(
				'C:\\Program Files\\adapter.cmd',
				['plain', 'with spaces', 'quote" & calc.exe & "', '|<>()^%!', 'C:\\path\\', '%PATH:z=z%']
			),
			[
				'/e:ON',
				'/v:OFF',
				'/d',
				'/c',
				'""C:\\Program Files\\adapter.cmd" plain "with spaces" "quote"" & calc.exe & """ "|<>()^%%cd:~,%!" "C:\\path\\\\" "%%cd:~,%PATH:z=z%%cd:~,%""'
			]
		);
	});

	test('escapes backslash runs around quotes', () => {
		assert.deepStrictEqual(
			prepareWindowsBatchCommand('adapter.cmd', ['two\\\\', 'three\\\\\\', 'two\\\\"quote', 'three\\\\\\"quote']),
			[
				'/e:ON',
				'/v:OFF',
				'/d',
				'/c',
				'""adapter.cmd" "two\\\\\\\\" "three\\\\\\\\\\\\" "two\\\\\\\\""quote" "three\\\\\\\\\\\\""quote""'
			]
		);
	});

	test('rejects invalid Windows batch command characters', () => {
		assert.deepStrictEqual(
			[
				() => prepareWindowsBatchCommand('adapter.cmd', ['safe\r\ncalc.exe']),
				() => prepareWindowsBatchCommand('adapter.cmd', ['safe\0calc.exe']),
				() => prepareWindowsBatchCommand('adapter".cmd', [])
			].map(run => {
				try {
					run();
					return false;
				} catch {
					return true;
				}
			}),
			[true, true, true]
		);
	});

	test('round-trips Windows batch arguments without executing metacharacters', async function () {
		if (process.platform !== 'win32') {
			this.skip();
		}

		const testDirectory = await mkdtemp(join(tmpdir(), 'vscode-debug-adapter-'));
		const adapterPath = join(testDirectory, 'adapter.cmd');
		const captureScriptPath = join(testDirectory, 'capture.cjs');
		const outputPath = join(testDirectory, 'arguments.json');
		const sideEffectPath = join(testDirectory, 'side-effect.txt');

		try {
			const roundTripArgs = [
				'plain',
				'with spaces',
				'',
				'|<>()^%!',
				'C:\\path\\',
				'%PATH:z=z%',
				'two\\\\slashes'
			];
			const args = [...roundTripArgs, `quote" & echo unexpected>"${sideEffectPath}" & "`];
			const forwardedArgs = args.map((_, index) => `"%~${index + 1}"`).join(' ');
			await writeFile(adapterPath, `@echo off\r\n"%VSCODE_TEST_NODE%" "%VSCODE_TEST_CAPTURE_SCRIPT%" ${forwardedArgs}\r\n`);
			await writeFile(captureScriptPath, 'require("fs").writeFileSync(process.env.VSCODE_TEST_OUTPUT, JSON.stringify(process.argv.slice(2)));');

			const result = spawnSync(process.env['ComSpec'] || 'cmd.exe', prepareWindowsBatchCommand(adapterPath, args), {
				encoding: 'utf8',
				env: {
					...process.env,
					ELECTRON_RUN_AS_NODE: '1',
					VSCODE_TEST_NODE: process.execPath,
					VSCODE_TEST_CAPTURE_SCRIPT: captureScriptPath,
					VSCODE_TEST_OUTPUT: outputPath
				},
				windowsVerbatimArguments: true
			});
			const capturedArgs: string[] | undefined = existsSync(outputPath) ? JSON.parse(await readFile(outputPath, 'utf8')) : undefined;

			assert.deepStrictEqual({
				status: result.status,
				error: result.error?.message,
				capturedArgs: capturedArgs?.slice(0, roundTripArgs.length),
				sideEffectCreated: existsSync(sideEffectPath)
			}, {
				status: 0,
				error: undefined,
				capturedArgs: roundTripArgs,
				sideEffectCreated: false
			});
		} finally {
			await rm(testDirectory, { recursive: true, force: true });
		}
	});
});
