/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import { installNodeGypHeaders } from '../nodeGypHeaders.ts';

// A stand-in for node-gyp's entry point. Each run appends its arguments to a log, then
// behaves as the next entry of the plan says: exit 0, exit 1 or hang.
const fakeNodeGyp = `
const fs = require('fs');
const [log, plan] = [process.env.FAKE_GYP_LOG, process.env.FAKE_GYP_PLAN.split(',')];
const runs = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\\n').filter(Boolean).length : 0;
fs.appendFileSync(log, process.argv.slice(2).join(' ') + '\\n');
const step = plan[Math.min(runs, plan.length - 1)];
if (step === 'hang') { setInterval(() => { }, 1000); } else { process.exit(step === 'ok' ? 0 : 1); }
`;

function withFakeNodeGyp(plan: string, fn: (script: string, runs: () => string[]) => void): void {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-gyp-headers-test-'));
	const script = path.join(dir, 'node-gyp.cjs');
	const log = path.join(dir, 'runs.log');
	fs.writeFileSync(script, fakeNodeGyp);
	process.env.FAKE_GYP_LOG = log;
	process.env.FAKE_GYP_PLAN = plan;
	try {
		fn(script, () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
	} finally {
		delete process.env.FAKE_GYP_LOG;
		delete process.env.FAKE_GYP_PLAN;
		fs.rmSync(dir, { recursive: true, force: true });
	}
}

suite('installNodeGypHeaders', () => {
	test('runs node-gyp install once when it succeeds', () => withFakeNodeGyp('ok', (script, runs) => {
		installNodeGypHeaders(script, 'https://nodejs.org/dist', '24.22.1', { retryDelaysMs: [0, 0], log: () => { } });
		assert.deepStrictEqual(runs(), ['install --dist-url https://nodejs.org/dist 24.22.1']);
	}));

	test('retries a failed install', () => withFakeNodeGyp('fail,fail,ok', (script, runs) => {
		const messages: string[] = [];
		installNodeGypHeaders(script, 'https://electronjs.org/headers', '43.8.3', { retryDelaysMs: [0, 0], log: m => messages.push(m) });
		assert.strictEqual(runs().length, 3);
		assert.strictEqual(messages.length, 2);
		assert.match(messages[0], /43\.8\.3 headers from https:\/\/electronjs\.org\/headers failed \(attempt 1 of 3\): exit code 1/);
	}));

	test('kills and retries a stalled install', () => withFakeNodeGyp('hang,ok', (script, runs) => {
		const messages: string[] = [];
		installNodeGypHeaders(script, 'https://nodejs.org/dist', '24.22.1', { timeoutMs: 500, retryDelaysMs: [0], log: m => messages.push(m) });
		assert.strictEqual(runs().length, 2);
		assert.match(messages[0], /attempt 1 of 2/);
	}));

	test('throws once every attempt fails', () => withFakeNodeGyp('fail', (script, runs) => {
		assert.throws(
			() => installNodeGypHeaders(script, 'https://nodejs.org/dist', '24.22.1', { retryDelaysMs: [0, 0], log: () => { } }),
			/failed \(attempt 3 of 3\): exit code 1/);
		assert.strictEqual(runs().length, 3);
	}));
});
