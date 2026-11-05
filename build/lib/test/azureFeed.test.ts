/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, suite, test } from 'node:test';
import { downloadFeedPackage } from '../azureFeed.ts';

// A fake `az` on PATH: `extension show` succeeds, and `artifacts universal
// download` fails (after writing a partial file) as many times as requested,
// then writes the package file.
const FAKE_AZ = `
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
if (args[0] === 'extension') { process.exit(0); }
const counter = process.env.FAKE_AZ_COUNTER;
const attempt = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0) + 1;
fs.writeFileSync(counter, String(attempt));
const dir = args[args.indexOf('--path') + 1];
fs.mkdirSync(dir, { recursive: true });
if (attempt <= Number(process.env.FAKE_AZ_FAILURES)) {
	fs.writeFileSync(path.join(dir, 'partial-' + attempt), '');
	process.exit(1);
}
fs.writeFileSync(path.join(dir, 'package.zip'), 'ok');
// simulates another build process publishing the same package meanwhile
if (process.env.FAKE_AZ_BEFORE_EXIT) {
	fs.mkdirSync(process.env.FAKE_AZ_BEFORE_EXIT, { recursive: true });
	fs.writeFileSync(path.join(process.env.FAKE_AZ_BEFORE_EXIT, 'package.zip'), 'other');
}
`;

const PKG = { feed: 'feed', name: 'electron', version: '1.0.0' };

suite('downloadFeedPackage', () => {
	let dir: string;
	let counter: string;
	const saved = { PATH: process.env.PATH, SYSTEM_COLLECTIONURI: process.env.SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECT: process.env.SYSTEM_TEAMPROJECT };

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'azure-feed-'));
		const bin = join(dir, 'bin');
		const script = join(dir, 'az.cjs');
		writeFileSync(script, FAKE_AZ);
		mkdirSync(bin);
		writeFileSync(join(bin, 'az.cmd'), `@"${process.execPath}" "${script}" %*\r\n`);
		writeFileSync(join(bin, 'az'), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
		chmodSync(join(bin, 'az'), 0o755);
		counter = join(dir, 'counter');
		process.env.PATH = `${bin}${process.platform === 'win32' ? ';' : ':'}${saved.PATH}`;
		process.env.FAKE_AZ_COUNTER = counter;
		process.env.SYSTEM_COLLECTIONURI = 'https://dev.azure.com/org/';
		process.env.SYSTEM_TEAMPROJECT = 'project';
	});

	afterEach(() => {
		process.env.PATH = saved.PATH;
		process.env.SYSTEM_COLLECTIONURI = saved.SYSTEM_COLLECTIONURI;
		process.env.SYSTEM_TEAMPROJECT = saved.SYSTEM_TEAMPROJECT;
		delete process.env.FAKE_AZ_COUNTER;
		delete process.env.FAKE_AZ_FAILURES;
		delete process.env.FAKE_AZ_BEFORE_EXIT;
		rmSync(dir, { recursive: true, force: true });
	});

	test('retries a failed download and caches only the complete package', async () => {
		process.env.FAKE_AZ_FAILURES = '2';
		const file = await downloadFeedPackage(dir, 'cache', PKG, [0, 0]);
		assert.equal(readFileSync(counter, 'utf8'), '3');
		assert.equal(readFileSync(file, 'utf8'), 'ok');
		assert.deepEqual(readdirSync(join(dir, '.build', 'cache')), ['electron-1.0.0']);
		assert.deepEqual(readdirSync(join(dir, '.build', 'cache', 'electron-1.0.0')), ['package.zip']);

		// served from the cache
		assert.equal(await downloadFeedPackage(dir, 'cache', PKG, [0, 0]), file);
		assert.equal(readFileSync(counter, 'utf8'), '3');
	});

	test('fails after the last retry and leaves nothing behind', async () => {
		process.env.FAKE_AZ_FAILURES = '3';
		await assert.rejects(downloadFeedPackage(dir, 'cache', PKG, [0, 0]), /exited with code 1/);
		assert.equal(readFileSync(counter, 'utf8'), '3');
		assert.equal(existsSync(join(dir, '.build', 'cache', 'electron-1.0.0')), false);
		assert.deepEqual(readdirSync(join(dir, '.build', 'cache')), []);
	});

	test('uses the package another process published while it downloaded', async () => {
		process.env.FAKE_AZ_FAILURES = '0';
		const cached = join(dir, '.build', 'cache', 'electron-1.0.0');
		process.env.FAKE_AZ_BEFORE_EXIT = cached;
		const file = await downloadFeedPackage(dir, 'cache', PKG, [0, 0]);
		assert.equal(readFileSync(file, 'utf8'), 'other');
		assert.deepEqual(readdirSync(join(dir, '.build', 'cache')), ['electron-1.0.0']);
	});

	test('downloads a package once for concurrent requests', async () => {
		process.env.FAKE_AZ_FAILURES = '0';
		const [a, b] = await Promise.all([downloadFeedPackage(dir, 'cache', PKG, [0, 0]), downloadFeedPackage(dir, 'cache', PKG, [0, 0])]);
		assert.equal(a, b);
		assert.equal(readFileSync(counter, 'utf8'), '1');
	});
});
