/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strict as assert } from 'assert';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { assertWorkloadPassed, isUnexpectedExit, NativeRecordCollector, parseSuiteReports } from './nativeExitParallelWorkload.ts';
import type { INativeExitRecord } from './nativeExitObserver.ts';

const labels = ['Conformance', 'Claude', 'Codex', 'Copilot', 'Copilot OTel', 'Copilot managed settings'];
const target = 'static-target-case';
function workload(targetState: 'passed' | 'failed' | 'pending', unrelatedFailure = false): string {
	return labels.map((suite, index) => {
		const title = suite === 'Copilot OTel' ? target : 'static-other-case';
		const state = suite === 'Copilot OTel' ? targetState : unrelatedFailure && index === 1 ? 'failed' : 'passed';
		const test = { fullTitle: title, err: { message: 'private-content-must-not-be-emitted' } };
		const report = {
			stats: { tests: 1, passes: state === 'passed' ? 1 : 0, failures: state === 'failed' ? 1 : 0, pending: state === 'pending' ? 1 : 0 },
			tests: [test], passes: state === 'passed' ? [test] : [], failures: state === 'failed' ? [test] : [], pending: state === 'pending' ? [test] : [],
		};
		return `Starting Agent Host E2E — ${suite}\n===== Agent Host E2E — ${suite} =====\n${JSON.stringify(report)}\n`;
	}).join('') + 'Agent Host E2E suites completed in 10.0s (6 parallel workers).\n';
}

test('all six reports and the actual target result are required', () => {
	const result = parseSuiteReports(workload('passed'), target);
	assert.equal(result.suites.length, 6);
	assert.equal(result.target, 'passed');
	assert.ok(result.suites.every(suite => suite.tests === 1));
	assertWorkloadPassed(result, 0);
});

test('other-provider assertion failure stays visible while the target outcome is preserved', () => {
	const result = parseSuiteReports(workload('passed', true), target);
	assert.equal(result.target, 'passed');
	assert.equal(result.suites.find(suite => suite.suite === 'Claude')?.failed, 1);
	assert.ok(!JSON.stringify(result).includes('private-content'));
	assert.throws(() => assertWorkloadPassed(result, 1));
});

test('target failure is not normalized to a pass', () => {
	assert.equal(parseSuiteReports(workload('failed'), target).target, 'failed');
	assert.throws(() => assertWorkloadPassed(parseSuiteReports(workload('failed'), target), 0));
});

test('pending target and missing/zero-case suites do not become execution proof', () => {
	assert.equal(parseSuiteReports(workload('pending'), target).target, 'pending');
	assert.throws(() => assertWorkloadPassed(parseSuiteReports(workload('pending'), target), 0));
	assert.throws(() => parseSuiteReports(workload('passed').replace('Starting Agent Host E2E — Claude\n', ''), target));
	assert.throws(() => parseSuiteReports(workload('passed').replace('"tests":1', '"tests":0'), target));
});

test('hook failures and zero-case reports remain visible and fatal without hiding the target result', () => {
	const output = workload('passed');
	const start = output.indexOf('{"stats"', output.indexOf('===== Agent Host E2E — Claude ====='));
	const end = output.indexOf('\n', start);
	for (const tests of [0, 1]) {
		const report = {
			stats: { tests, passes: tests, failures: 1, pending: 0 },
			tests: tests ? [{ fullTitle: 'static-other-case' }] : [],
			passes: tests ? [{ fullTitle: 'static-other-case' }] : [],
			failures: [{ fullTitle: 'static-cleanup-hook', err: { message: 'private-content' } }], pending: [],
		};
		const result = parseSuiteReports(output.slice(0, start) + JSON.stringify(report) + output.slice(end), target);
		assert.equal(result.suites.length, 6);
		assert.equal(result.target, 'passed');
		assert.deepStrictEqual(result.suites.find(suite => suite.suite === 'Claude'), { suite: 'Claude', tests, passed: tests, failed: 1, pending: 0 });
		assert.ok(!JSON.stringify(result).includes('private-content'));
		assert.throws(() => assertWorkloadPassed(result, 1));
	}
	const result = parseSuiteReports(output, target);
	assert.throws(() => assertWorkloadPassed({ ...result, suites: result.suites.map(suite => suite.suite === 'Claude' ? { ...suite, tests: 0, passed: 0 } : suite) }, 0));
});

test('six workers are proven, not inferred from the request', () => {
	assert.throws(() => parseSuiteReports(workload('passed').replace('6 parallel workers', '5 parallel workers'), target));
});

function exit(extra: Partial<INativeExitRecord>): INativeExitRecord {
	return {
		timestamp: new Date().toISOString(), event: 'exit', hostPid: 1, nativePid: 2,
		clientInstance: 1, processInstance: 1, exitCode: 0, signal: null, unexpected: false,
		stopRequested: false, killRequested: false, ...extra,
	};
}
test('spontaneous exit and a crash following reactive stop are fatal; normal/owned termination differs', () => {
	assert.equal(isUnexpectedExit(exit({ unexpected: true })), true);
	assert.equal(isUnexpectedExit(exit({ exitCode: 3221225477, stopRequested: true })), true);
	assert.equal(isUnexpectedExit(exit({ stopRequested: true })), false);
	assert.equal(isUnexpectedExit(exit({ signal: 'SIGKILL', killRequested: true })), false);
});

test('independent host writers and partial frames retain identity without duplicates', t => {
	const directory = mkdtempSync(path.join(os.tmpdir(), 'parallel-native-reader-'));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	const first = path.join(directory, 'host-1-00000000-0000-0000-0000-000000000001.jsonl');
	const second = path.join(directory, 'host-3-00000000-0000-0000-0000-000000000002.jsonl');
	const a = JSON.stringify(exit({ targetCase: true }));
	const b = JSON.stringify(exit({ hostPid: 3, targetCase: false }));
	writeFileSync(first, a.slice(0, 25));
	writeFileSync(second, b + '\n');
	const records: INativeExitRecord[] = [];
	const reader = new NativeRecordCollector(directory, record => records.push(record));
	reader.read();
	assert.deepStrictEqual(records.map(record => record.hostPid), [3]);
	appendFileSync(first, a.slice(25) + '\n');
	reader.read();
	reader.read();
	reader.assertComplete();
	assert.deepStrictEqual(records.map(record => record.hostPid), [3, 1]);
});

test('malformed privacy fields are fatal rather than silently discarded', t => {
	const directory = mkdtempSync(path.join(os.tmpdir(), 'parallel-native-privacy-'));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	writeFileSync(path.join(directory, 'host-1-00000000-0000-0000-0000-000000000001.jsonl'), JSON.stringify({ ...exit({}), stderr: 'private' }) + '\n');
	assert.throws(() => new NativeRecordCollector(directory, () => { }).read());
});
