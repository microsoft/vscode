/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { exec, spawn } from 'child_process';
import { existsSync } from 'fs';
import { promisify } from 'util';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { FileAccess } from '../../common/network.js';
import { JS_FILENAME_PATTERN } from '../../node/ps.js';

suite('Process Utils', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('JS file regex', () => {

		function findJsFiles(cmd: string): string[] {
			const matches: string[] = [];
			let match;
			while ((match = JS_FILENAME_PATTERN.exec(cmd)) !== null) {
				matches.push(match[0]);
			}
			return matches;
		}

		test('should match simple .js files', () => {
			deepStrictEqual(findJsFiles('node bootstrap.js'), ['bootstrap.js']);
		});

		test('should match multiple .js files', () => {
			deepStrictEqual(findJsFiles('node server.js --require helper.js'), ['server.js', 'helper.js']);
		});

		test('should match .js files with hyphens', () => {
			deepStrictEqual(findJsFiles('node my-script.js'), ['my-script.js']);
		});

		test('should not match .json files', () => {
			deepStrictEqual(findJsFiles('cat package.json'), []);
		});

		test('should not match .js prefix in .json extension (regression test for \\b fix)', () => {
			// Without the \b word boundary, the regex would incorrectly match "package.js" from "package.json"
			deepStrictEqual(findJsFiles('node --config tsconfig.json'), []);
			deepStrictEqual(findJsFiles('eslint.json'), []);
		});

		test('should not match .jsx files', () => {
			deepStrictEqual(findJsFiles('node component.jsx'), []);
		});

		test('should match .js but not .json in same command', () => {
			deepStrictEqual(findJsFiles('node app.js --config settings.json'), ['app.js']);
		});

		test('should not match partial matches inside other extensions', () => {
			deepStrictEqual(findJsFiles('file.jsmith'), []);
		});

		test('should match .js at end of command', () => {
			deepStrictEqual(findJsFiles('/path/to/script.js'), ['script.js']);
		});
	});
});

suite('ps.sh Process Listing', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const runPsSh = promisify(exec);

	suiteSetup(function () {
		if (!existsSync('/proc')) {
			this.skip();
		}
	});

	async function listProcessesOnce(psShPath: string): Promise<{ stdout: string; stderr: string }> {
		const result = await runPsSh(`"${psShPath}"`, { encoding: 'utf8', timeout: 30000 });
		return { stdout: result.stdout, stderr: result.stderr };
	}

	test('lists processes without spurious errors under process churn (#186500)', async function () {
		this.timeout(60 * 1000);

		const psShPath = FileAccess.asFileUri('vs/base/node/ps.sh').fsPath;
		ok(existsSync(psShPath), 'ps.sh not found next to ps.ts');

		// Baseline control: on a quiet system the script must succeed with empty
		// stderr. This proves the instrument below detects churn-induced races,
		// not ambient failures of the environment.
		const baseline = await listProcessesOnce(psShPath);
		strictEqual(baseline.stderr, '', `expected no stderr from ps.sh on an idle system, got: ${baseline.stderr}`);
		ok(baseline.stdout.length > 0, 'ps.sh produced no output');
		const firstLine = baseline.stdout.split('\n')[0];
		ok(/^\d+\t/.test(firstLine), `unexpected ps.sh output shape: ${firstLine}`);

		// Churn: short-lived background processes that vanish while ps.sh walks
		// /proc. Original bug: when a process dies between enumeration
		// (/proc listing) and the per-pid reads (/proc/<pid>/stat,
		// /proc/<pid>/cmdline), the script writes errors like
		// "cat: /proc/<pid>/stat: No such file or directory" to stderr.
		// listProcesses() treats any stderr as total failure and rejects, so
		// the process explorer shows "Listing processes failed".
		const churn = spawn('sh', ['-c', 'i=0; while [ $i -lt 400 ]; do sleep 0.02 & i=$((i+1)); done; wait'], { stdio: 'ignore' });

		try {
			let rounds = 0;
			while (rounds < 5 && churn.exitCode === null && !churn.signalCode) {
				rounds++;
				const { stderr } = await listProcessesOnce(psShPath);
				strictEqual(stderr, '', `race between /proc enumeration and reads produced stderr in round ${rounds}: ${stderr}`);
			}
			ok(rounds >= 2, `expected at least 2 measurement rounds while churning, ran ${rounds}`);
		} finally {
			if (churn.exitCode === null && !churn.signalCode) {
				churn.kill('SIGKILL');
				await new Promise<void>(resolve => {
					churn.once('exit', () => resolve());
					setTimeout(resolve, 2000);
				});
			}
		}
	});
});
