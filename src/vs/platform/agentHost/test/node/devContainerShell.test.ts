/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
import { once } from 'events';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DevContainerShell } from '../../node/devContainerShell.js';

(isWindows ? suite.skip : suite)('Dev Container shell', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const start = (script = 'exec /bin/sh', token = CancellationToken.None) => {
		const child = spawn('/bin/sh', ['-c', script]);
		return { closed: once(child, 'close'), shell: new DevContainerShell(child, token, () => { }) };
	};

	test('keeps the shell usable after failing commands and handles large output', async () => {
		const { closed, shell } = start();
		try {
			const [syntaxError, exit, setE, large, after] = await Promise.all([
				shell.run('if'),
				shell.run('exit 3'),
				shell.run('set -e; false; echo unreachable'),
				shell.run('head -c 200000 /dev/zero | tr "\\0" a'),
				shell.run('printf "a\\nb \\342\\234\\223"'),
			]);
			assert.deepStrictEqual({
				syntaxError: syntaxError.code !== 0 && syntaxError.stderr.length > 0,
				exit: exit.code,
				setE: setE,
				large: large.stdout === 'a'.repeat(200000),
				after,
			}, {
				syntaxError: true,
				exit: 3,
				setE: { stdout: '', stderr: '', code: 1 },
				large: true,
				after: { stdout: 'a\nb \u2713', stderr: '', code: 0 },
			});
		} finally {
			shell.dispose();
		}
		assert.deepStrictEqual(await closed, [0, null]);
	});

	test('rejects running and later commands with the CLI error when the shell exits', async () => {
		const { shell } = start('echo "Dev container not found" >&2; exit 1');
		try {
			await assert.rejects(shell.run('true'), /Dev Container shell exited \(exit 1\): Dev container not found/);
			await assert.rejects(shell.run('true'), /Dev Container shell exited \(exit 1\): Dev container not found/);
		} finally {
			shell.dispose();
		}
	});

	test('stops a running command on cancellation', async () => {
		const tokenSource = new CancellationTokenSource();
		const { closed, shell } = start(undefined, tokenSource.token);
		try {
			await shell.run('true');
			const running = shell.run('sleep 30');
			tokenSource.cancel();
			const errors = await Promise.all([running, shell.run('true')].map(result => result.then(() => undefined, error => error)));
			await closed;
			assert.deepStrictEqual(errors.map(isCancellationError), [true, true]);
		} finally {
			shell.dispose();
			tokenSource.dispose();
		}
	});
});
