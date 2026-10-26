/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { suite, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseArgs, TIMEOUT_EXIT_CODE } from '../../azure-pipelines/common/runWithTimeout.ts';

const scriptPath = fileURLToPath(new URL('../../azure-pipelines/common/runWithTimeout.ts', import.meta.url));

function run(args: string[]) {
	return spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8', timeout: 30_000 });
}

suite('runWithTimeout', () => {
	test('passes through the exit code of a command that finishes in time', () => {
		assert.equal(run(['10', '--', process.execPath, '-e', 'process.exit(0)']).status, 0);
		assert.equal(run(['10', '--', process.execPath, '-e', 'process.exit(3)']).status, 3);
	});

	test('fails a command that runs past the deadline and runs the timeout command', () => {
		const dir = mkdtempSync(join(tmpdir(), 'run-with-timeout-'));
		const marker = join(dir, 'on-timeout');
		try {
			const started = Date.now();
			const result = run(['1', '--on-timeout', `"${process.execPath}" -e "require('fs').writeFileSync(process.argv[1], '')" "${marker}"`, '--', process.execPath, '-e', 'setTimeout(() => {}, 60_000)']);
			assert.equal(result.status, TIMEOUT_EXIT_CODE);
			assert.ok(Date.now() - started < 20_000, 'the hung command was not stopped');
			assert.match(result.stdout, /##vso\[task\.logissue type=error\].*did not finish within 1 s/);
			assert.ok(existsSync(marker), 'the timeout command did not run');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('rejects malformed arguments', () => {
		assert.throws(() => parseArgs(['10', 'cargo']));
		assert.throws(() => parseArgs(['0', '--', 'cargo']));
		assert.throws(() => parseArgs(['10', '--bogus', '--', 'cargo']));
		assert.deepEqual(parseArgs(['600', '--on-timeout', 'sccache --stop-server', '--', 'cargo', 'clippy']), { seconds: 600, onTimeout: 'sccache --stop-server', command: 'cargo', args: ['clippy'] });
	});
});
