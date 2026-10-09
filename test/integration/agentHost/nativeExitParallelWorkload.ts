/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AssertionError, strict as assert } from 'assert';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateNativeExitRecord, type INativeExitRecord } from './nativeExitObserver.ts';

const suites = ['Conformance', 'Claude', 'Codex', 'Copilot', 'Copilot OTel', 'Copilot managed settings'] as const;
type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
	assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value));
	return Object.fromEntries(Object.entries(value));
}

export function parseSuiteReports(output: string, targetTitle: string): { suites: { suite: string; tests: number; passed: number; failed: number; pending: number }[]; target: 'passed' | 'failed' | 'pending' } {
	const results: { suite: string; tests: number; passed: number; failed: number; pending: number }[] = [];
	let target: 'passed' | 'failed' | 'pending' | undefined;
	for (const suite of suites) {
		const startMarker = `===== Agent Host E2E — ${suite} =====`;
		assert.equal(output.split(`Starting Agent Host E2E — ${suite}\n`).length - 1, 1);
		assert.equal(output.split(startMarker).length - 1, 1);
		const start = output.indexOf(startMarker);
		assert.ok(start >= 0);
		const next = output.indexOf('\n===== Agent Host E2E — ', start + startMarker.length);
		const block = output.slice(start + startMarker.length, next < 0 ? undefined : next);
		const report = object(parseReport(block));
		const stats = object(report.stats);
		for (const key of ['tests', 'passes', 'failures', 'pending']) {
			assert.ok(typeof stats[key] === 'number' && Number.isInteger(stats[key]) && stats[key] >= 0);
		}
		assert.ok(Array.isArray(report.tests) && Array.isArray(report.passes) && Array.isArray(report.failures) && Array.isArray(report.pending));
		assert.equal(report.tests.length, stats.tests);
		assert.equal(report.passes.length, stats.passes);
		assert.equal(report.failures.length, stats.failures);
		assert.equal(report.pending.length, stats.pending);
		// Hook failures increase Mocha's failure count without increasing its test count.
		assert.ok(Number(stats.passes) + Number(stats.pending) <= Number(stats.tests));
		assert.ok(Number(stats.tests) <= Number(stats.passes) + Number(stats.failures) + Number(stats.pending));
		results.push({ suite, tests: Number(stats.tests), passed: Number(stats.passes), failed: Number(stats.failures), pending: Number(stats.pending) });
		if (suite === 'Copilot OTel') {
			const matched = report.tests.map(object).filter(test => test.fullTitle === targetTitle);
			assert.equal(matched.length, 1);
			const passed = report.passes.map(object).filter(test => test.fullTitle === targetTitle).length;
			const failed = report.failures.map(object).filter(test => test.fullTitle === targetTitle).length;
			const pending = report.pending.map(object).filter(test => test.fullTitle === targetTitle).length;
			assert.equal(passed + failed + pending, 1);
			target = passed === 1 ? 'passed' : failed === 1 ? 'failed' : 'pending';
		}
	}
	assert.ok(target !== undefined);
	assert.match(output, /Agent Host E2E suites completed in [\d.]+s \(6 parallel workers\)/);
	return { suites: results, target };
}

export function assertWorkloadPassed(report: ReturnType<typeof parseSuiteReports>, exitCode: number | null): void {
	assert.equal(exitCode, 0);
	assert.ok(report.suites.every(suite => suite.tests > 0 && suite.failed === 0));
	assert.equal(report.target, 'passed');
}

function parseReport(output: string): unknown {
	const start = /\{\s*"stats"\s*:/.exec(output)?.index;
	assert.ok(start !== undefined);
	let depth = 0;
	let quoted = false;
	let escaped = false;
	for (let index = start; index < output.length; index++) {
		const char = output[index];
		if (quoted) {
			if (escaped) { escaped = false; }
			else if (char === '\\') { escaped = true; }
			else if (char === '"') { quoted = false; }
		} else if (char === '"') { quoted = true; }
		else if (char === '{') { depth++; }
		else if (char === '}' && --depth === 0) { return JSON.parse(output.slice(start, index + 1)); }
	}
	throw new Error('A complete suite report was not observed');
}

export function isUnexpectedExit(record: INativeExitRecord): boolean {
	return record.event === 'exit' && record.killRequested !== true
		&& (record.unexpected === true || record.exitCode !== 0 || record.signal !== null);
}

export class NativeRecordCollector {
	private readonly offsets = new Map<string, number>();
	private readonly partial = new Map<string, string>();

	constructor(
		private readonly directory: string,
		private readonly consume: (record: INativeExitRecord) => void,
	) { }

	read(): void {
		const fresh: INativeExitRecord[] = [];
		for (const file of readdirSync(this.directory).filter(name => /^host-\d+-[a-f0-9-]{36}\.jsonl$/.test(name))) {
			const content = readFileSync(join(this.directory, file), 'utf8');
			const offset = this.offsets.get(file) ?? 0;
			assert.ok(content.length >= offset);
			const lines = ((this.partial.get(file) ?? '') + content.slice(offset)).split('\n');
			this.offsets.set(file, content.length);
			this.partial.set(file, lines.pop()!);
			for (const line of lines) {
				const record: unknown = JSON.parse(line);
				validateNativeExitRecord(record);
				assert.ok(file.startsWith(`host-${record.hostPid}-`));
				fresh.push(record);
			}
		}
		fresh.sort((a, b) => a.timestamp.localeCompare(b.timestamp)).forEach(record => this.consume(record));
	}

	assertComplete(): void {
		assert.ok([...this.partial.values()].every(value => value === ''));
	}
}

export async function runParallelWorkload(options: {
	root: string; scratch: string; runtime: string; bootstrap: string; packagedApp: string;
	ciElectronHash: string; nativeHash: string; targetTitle: string;
}): Promise<void> {
	const directory = mkdtempSync(join(options.scratch, 'parallel-records-'));
	const records: INativeExitRecord[] = [];
	const started = new Set<string>();
	const ended = new Set<string>();
	let output = '';
	let abortReason: 'unexpected-native-exit' | 'deadline' | 'observer-failure' | undefined;
	let stopping: Promise<void> | undefined;
	const child = spawn(process.execPath, [
		join(options.root, 'test', 'integration', 'agentHost', 'runner.ts'),
		'--jobs', '6', '--storage', 'disk', '--build', '--reporter', 'json',
	], {
		cwd: options.root,
		env: {
			...process.env, INTEGRATION_TEST_ELECTRON_PATH: options.packagedApp, VSCODE_SKIP_PRELAUNCH: '1',
			AGENT_HOST_NATIVE_EXIT_BOOTSTRAP: options.bootstrap,
			AGENT_HOST_NATIVE_EXIT_RECORDS_DIRECTORY: directory, AGENT_HOST_NATIVE_EXIT_RUNTIME: options.runtime,
			AGENT_HOST_REPLAY_RECORD: undefined, AGENT_HOST_UPDATE_SNAPSHOTS: undefined, AGENT_HOST_UPDATE_AHP_SNAPSHOTS: undefined,
		},
		stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
	});
	for (const stream of [child.stdout, child.stderr]) {
		stream.setEncoding('utf8').on('data', chunk => {
			output += chunk;
			for (const suite of suites) {
				if (!started.has(suite) && output.includes(`Starting Agent Host E2E — ${suite}\n`)) {
					started.add(suite);
					process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), event: 'suiteStart', suite }) + '\n');
				}
				if (!ended.has(suite) && output.includes(`===== Agent Host E2E — ${suite} =====`)) {
					ended.add(suite);
					process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), event: 'suiteEnd', suite }) + '\n');
				}
			}
		});
	}
	function abort(reason: NonNullable<typeof abortReason>): void {
		if (abortReason !== undefined) { return; }
		abortReason = reason;
		process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), event: 'workloadAbort', reason, runnerPid: child.pid }) + '\n');
		assert.ok(child.pid);
		const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
		stopping = new Promise<void>((done, reject) => {
			kill.once('error', reject);
			kill.once('close', code => code === 0 ? done() : reject(new Error('Owned workload cleanup failed')));
		});
	}
	const collector = new NativeRecordCollector(directory, record => {
		records.push(record);
		process.stdout.write(JSON.stringify(record) + '\n');
		if (isUnexpectedExit(record)) { abort('unexpected-native-exit'); }
	});
	const timer = setInterval(() => {
		try {
			collector.read();
		} catch (error) {
			const errorClass = error instanceof AssertionError ? 'AssertionError' : error instanceof SyntaxError ? 'SyntaxError' : error instanceof Error ? 'Error' : 'Unknown';
			process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), event: 'observerFailure', operation: 'read-records', errorClass }) + '\n');
			abort('observer-failure');
		}
	}, 100);
	const deadline = setTimeout(() => abort('deadline'), 30 * 60_000);
	let exitCode: number | null;
	try {
		exitCode = await new Promise<number | null>((done, reject) => {
			child.once('error', reject);
			child.once('close', done);
		});
		await stopping;
		collector.read();
	} finally {
		clearInterval(timer);
		clearTimeout(deadline);
	}
	if (abortReason === undefined) {
		collector.assertComplete();
	}
	assert.equal(abortReason, undefined);
	assert.equal(started.size, 6);
	assert.equal(ended.size, 6);
	const report = parseSuiteReports(output.replaceAll('\r\n', '\n'), options.targetTitle);
	for (const suite of report.suites) {
		process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), event: 'suiteResult', ...suite }) + '\n');
	}
	process.stdout.write(JSON.stringify({ timestamp: new Date().toISOString(), event: 'targetCaseResult', result: report.target, executed: report.target !== 'pending' }) + '\n');
	const ready = records.filter(record => record.event === 'observerReady');
	assert.ok(ready.length > 0 && ready.every(record => record.sdkVersion === '1.0.18-preview.1' && record.nativeSha256 === options.nativeHash && record.hostSha256 === options.ciElectronHash));
	assert.ok(ready.every(record => record.testPid !== undefined && record.testSha256 === options.ciElectronHash && typeof record.electronVersion === 'string'
		&& record.testNodeVersion === record.nodeVersion && record.testElectronVersion === record.electronVersion));
	const target = records.filter(record => record.targetCase === true);
	assert.ok(target.filter(record => record.event === 'spawn').length >= 1);
	assert.equal(target.filter(record => record.event === 'exit').length, target.filter(record => record.event === 'spawn').length);
	assertWorkloadPassed(report, exitCode);
}
