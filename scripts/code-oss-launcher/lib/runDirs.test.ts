/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { isRunDirInUse } from './runDirs.ts';

for (const persistent of [false, true]) {
	test(`Windows lock probe restores its directory or reports the recovery path (${persistent})`, { skip: process.platform !== 'win32' }, async t => {
		const root = await fs.mkdtemp(path.join(import.meta.dirname, '.run-dirs-test-'));
		const runDir = path.join(root, 'run');
		await fs.mkdir(runDir);
		await fs.writeFile(path.join(runDir, 'profile'), 'preserve');
		const rename = fs.rename;
		let restoreAttempts = 0;
		let probe: string | undefined;
		const mock = t.mock.method(fs, 'rename', async (...[from, to]: Parameters<typeof fs.rename>) => {
			if (to === runDir) {
				probe = String(from);
				if (++restoreAttempts === 1 || persistent) {
					throw new Error('Transient sharing violation');
				}
			}
			return rename(from, to);
		});
		try {
			if (persistent) {
				await assert.rejects(isRunDirInUse(runDir), error => {
					assert.ok(error instanceof AggregateError);
					assert.equal(error.errors.length, 3);
					assert.ok(error.message.includes(probe!));
					return true;
				});
				assert.equal(await fs.readFile(path.join(probe!, 'profile'), 'utf8'), 'preserve');
			} else {
				assert.equal(await isRunDirInUse(runDir), false);
				assert.equal(restoreAttempts, 2);
				assert.equal(await fs.readFile(path.join(runDir, 'profile'), 'utf8'), 'preserve');
			}
		} finally {
			mock.mock.restore();
			await fs.rm(root, { recursive: true, force: true });
		}
	});
}
