/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const coverage: {
	normalizeNative(summary: object, source: string): { total: Record<string, { covered: number; total: number; percentage: number }>; files: readonly { path: string; lines: readonly number[] }[] };
	validateStatus(status: object): object;
	canWriteMeasurement(status: object, acceptFailed: boolean): boolean;
	parseArguments(args: readonly string[]): { mode: string };
	parseSuiteOutput(suite: string, output: string, exitCode: number, focused?: boolean): object;
	withEntrypointOverride(file: string, replacement: string, callback: () => void): void;
	sameIdentity(metadata: object, build: object, label: string): void;
	wrapperSummary(summary: object): object;
	assertHistoricalMetrics(metrics: object, build: object, native: object): void;
	validateRunEnvironment(build: object, options: object): string;
} = require('./copilot-runtime-e2e-coverage.ts');

const source = resolve('.build', 'coverage-unit-source');
const metric = { count: 10, covered: 4 };
const entry = (file: string) => ({ filename: join(source, file), summary: { lines: metric, functions: metric, regions: metric } });
const summary = (files: readonly object[]) => ({ type: 'llvm.coverage.json.export', data: [{ files }] });

test('native normalization excludes dependencies, build scripts and the profiling helper, not unloaded code', () => {
	const result = coverage.normalizeNative(summary([
		entry('src\\z.rs'),
		entry('src\\build.rs'),
		entry('src\\native\\coverage_profiles.rs'),
		entry('third_party\\lib.rs'),
		entry('..\\registry\\lib.rs'),
		{ filename: join(source, 'src', 'a.rs'), summary: { lines: { count: 8, covered: 0 }, functions: { count: 2, covered: 0 }, regions: { count: 5, covered: 0 } } },
	]), source);
	assert.deepStrictEqual(result, {
		total: { lines: { covered: 4, total: 18, percentage: 22.22 }, functions: { covered: 4, total: 12, percentage: 33.33 }, regions: { covered: 4, total: 15, percentage: 26.67 } },
		files: [
			{ path: 'src/a.rs', lines: [0, 8], functions: [0, 2], regions: [0, 5] },
			{ path: 'src/z.rs', lines: [4, 10], functions: [4, 10], regions: [4, 10] },
		],
	});
});

test('display rounding is derived from exact counts and cannot satisfy the goal below the covered-line target', () => {
	const goal = Math.ceil(168919 + 624470 * 0.05);
	const rows = [168919, 200142, 200143].map(covered => {
		const native = coverage.normalizeNative(summary([{
			filename: join(source, 'src', 'a.rs'),
			summary: { lines: { covered, count: 624470 }, functions: metric, regions: metric },
		}]), source);
		return { ...native.total.lines, meetsGoal: native.total.lines.covered >= goal };
	});
	assert.deepStrictEqual({ goal, rows }, {
		goal: 200143,
		rows: [
			{ covered: 168919, total: 624470, percentage: 27.05, meetsGoal: false },
			{ covered: 200142, total: 624470, percentage: 32.05, meetsGoal: false },
			{ covered: 200143, total: 624470, percentage: 32.05, meetsGoal: true },
		],
	});
});

test('malformed counts, duplicate normalized paths and empty denominators fail', () => {
	assert.throws(() => coverage.normalizeNative(summary([entry('src\\a.rs'), entry('src\\a.rs')]), source), /Duplicate/);
	assert.throws(() => coverage.normalizeNative(summary([entry('third_party\\a.rs')]), source), /No first-party/);
	assert.throws(() => coverage.normalizeNative(summary([{ filename: join(source, 'src', 'a.rs'), summary: { lines: { covered: 2, count: 1 } } }]), source), /exceeds/);
});

test('passing status needs every full deterministic suite and cannot conceal teardown failures', () => {
	const suites = ['conformance', 'claude', 'codex', 'copilot', 'prompts', 'otel'].map(suite => ({
		suite, exitCode: 0, passing: suite === 'prompts' ? 0 : 1, pending: suite === 'prompts' ? 20 : 0, failing: 0, auxiliaryPassing: 0,
	}));
	assert.deepStrictEqual(coverage.validateStatus({ status: 'passed', selection: 'full', suites }), { status: 'passed', selection: 'full', suites });
	assert.throws(() => coverage.validateStatus({ status: 'passed', selection: 'full', suites: suites.slice(1) }), /must be incomplete/);
	assert.throws(() => coverage.validateStatus({ status: 'passed', selection: 'full', suites: suites.map(item => item.suite === 'codex' ? { ...item, exitCode: 1 } : item) }), /must be failed/);
	assert.throws(() => coverage.validateStatus({ status: 'passed', selection: 'focused', suites }), /must be incomplete/);
	assert.throws(() => coverage.validateStatus({ status: 'passed', selection: 'full', suites: suites.map(item => ({ ...item, passing: 0, pending: 20 })) }), /must be incomplete/);
});

test('focused filters cannot silently become a successful full measurement', () => {
	assert.throws(() => coverage.parseArguments(['--build-info', 'manifest.json', '--grep', 'tools']), /only in collect/);
	assert.throws(() => coverage.parseArguments(['--build-info', 'manifest.json', '--mode', 'collect', '--suite', 'copilot', '--write']), /cannot write/);
	assert.deepStrictEqual(coverage.parseArguments(['--build-info', 'manifest.json', '--mode', 'collect', '--suite', 'copilot', '--grep', 'tools']).mode, 'collect');
});

test('explicit failed tracking preserves failures and cannot accept a focused or incomplete attempt', () => {
	const suites = ['conformance', 'claude', 'codex', 'copilot', 'prompts', 'otel'].map(suite => ({
		suite, exitCode: suite === 'conformance' ? 1 : 0, passing: suite === 'prompts' ? 0 : 1,
		pending: suite === 'prompts' ? 20 : 0, failing: suite === 'conformance' ? 1 : 0, auxiliaryPassing: 0,
	}));
	const status = coverage.validateStatus({ status: 'failed', selection: 'full', suites });
	assert.deepStrictEqual({
		implicit: coverage.canWriteMeasurement(status, false),
		explicit: coverage.canWriteMeasurement(status, true),
		focused: coverage.canWriteMeasurement({ status: 'failed', selection: 'focused', suites }, true),
		missing: coverage.canWriteMeasurement({ status: 'failed', selection: 'full', suites: suites.slice(1) }, true),
		incomplete: coverage.canWriteMeasurement({ status: 'incomplete', selection: 'full', suites }, true),
	}, { implicit: false, explicit: true, focused: false, missing: false, incomplete: false });
	assert.throws(() => coverage.parseArguments(['--build-info', 'manifest.json', '--mode', 'collect', '--suite', 'copilot', '--accept-failed']), /requires a full run/);
	assert.throws(() => coverage.parseArguments(['--build-info', 'manifest.json', '--mode', 'report', '--accept-failed']), /requires a full run/);
});

test('known-issue diagnostics are rejected before runtime validation or entrypoint override', () => {
	const previous = process.env['AGENT_HOST_RUN_KNOWN_ISSUES'];
	try {
		process.env['AGENT_HOST_RUN_KNOWN_ISSUES'] = '1';
		assert.throws(() => coverage.validateRunEnvironment({}, {}), /Unset AGENT_HOST_RUN_KNOWN_ISSUES/);
	} finally {
		if (previous === undefined) {
			delete process.env['AGENT_HOST_RUN_KNOWN_ISSUES'];
		} else {
			process.env['AGENT_HOST_RUN_KNOWN_ISSUES'] = previous;
		}
	}
});

test('Mocha summaries preserve failure codes, pending tests and supplemental-only counts', () => {
	assert.deepStrictEqual(coverage.parseSuiteOutput('prompts', '  3 passing (12ms)\n  20 pending\n', 0), {
		suite: 'prompts', exitCode: 0, passing: 0, pending: 20, failing: 0, auxiliaryPassing: 3,
	});
	assert.deepStrictEqual(coverage.parseSuiteOutput('copilot', '  176 passing\n  37 pending\n  1 failing\n', 1), {
		suite: 'copilot', exitCode: 1, passing: 176, pending: 37, failing: 1, auxiliaryPassing: 0,
	});
	assert.deepStrictEqual(coverage.parseSuiteOutput('copilot', '  1 failing\n', 1, true), {
		suite: 'copilot', exitCode: 1, passing: 0, pending: 0, failing: 1, auxiliaryPassing: 0,
	});
	assert.throws(() => coverage.parseSuiteOutput('copilot', 'runner crashed before reporting', 1), /Missing/);
});

test('package version and commit metadata both identify the actual runtime', () => {
	const build = { cliVersion: '1.0.84-5', commit: '0de509ce07ecad82aeb08963f5a650b0ba4d8378' };
	coverage.sameIdentity({ version: '1.0.84-5', buildMetadata: { gitCommit: '0de509ce' } }, build, 'test');
	assert.throws(() => coverage.sameIdentity({ version: '1.0.84-4', buildMetadata: { gitCommit: '0de509ce' } }, build, 'test'), /does not match/);
	assert.throws(() => coverage.sameIdentity({ version: '1.0.84-5', buildMetadata: { gitCommit: '0de509cf' } }, build, 'test'), /does not match/);
});

test('wrapper coverage includes ESM files but rejects duplicate CJS, dependencies and empty reports', () => {
	const total = { lines: { covered: 4, total: 8 }, functions: { covered: 1, total: 3 }, branches: { covered: 2, total: 4 } };
	const esm = resolve('node_modules', '@github', 'copilot-sdk', 'dist', 'client.js');
	const cjs = resolve('node_modules', '@github', 'copilot-sdk', 'dist', 'cjs', 'client.js');
	assert.deepStrictEqual(coverage.wrapperSummary({ total, [esm]: {} }), {
		files: 1, total: { lines: { covered: 4, total: 8, percentage: 50 }, functions: { covered: 1, total: 3, percentage: 33.33 }, branches: { covered: 2, total: 4, percentage: 50 } },
	});
	assert.throws(() => coverage.wrapperSummary({ total, [esm]: {}, [cjs]: {} }), /Unexpected/);
	assert.throws(() => coverage.wrapperSummary({ total }), /No SDK wrapper/);
});

test('historical import checks original source identity, retry exclusion and every native count', () => {
	const build = { commit: '0de509ce07ecad82aeb08963f5a650b0ba4d8378', cliVersion: '1.0.84-5', sdkVersion: '1.0.13' };
	const native = coverage.normalizeNative(summary([entry('src\\a.rs')]), source);
	const metrics = {
		revisions: { runtime: build.commit, cli: build.cliVersion, sdk: build.sdkVersion },
		run: { replayOnly: true, retriesIncludedInCoverage: false, platform: 'Windows x64' },
		native: { files: 1, total: { lines: metric, functions: metric, regions: metric }, filesByPath: [{ path: 'a.rs', metrics: { lines: metric, functions: metric, regions: metric } }] },
	};
	coverage.assertHistoricalMetrics(metrics, build, native);
	assert.throws(() => coverage.assertHistoricalMetrics({ ...metrics, revisions: { ...metrics.revisions, cli: '1.0.84-4' } }, build, native), /do not match/);
	assert.throws(() => coverage.assertHistoricalMetrics({ ...metrics, run: { ...metrics.run, retriesIncludedInCoverage: true } }, build, native), /without retries/);
	assert.throws(() => coverage.assertHistoricalMetrics({ ...metrics, native: { ...metrics.native, filesByPath: [{ path: 'a.rs', metrics: { lines: { count: 11, covered: 4 }, functions: metric, regions: metric } }] } }, build, native), /counts differ/);
});

test('entrypoint override restores exact original bytes on success and failure, with exclusive backup', () => {
	mkdirSync(resolve('.build'), { recursive: true });
	const directory = mkdtempSync(resolve('.build', 'coverage-script-test-'));
	const file = join(directory, 'index.js');
	const original = Buffer.from('original\r\n');
	try {
		writeFileSync(file, original);
		coverage.withEntrypointOverride(file, 'replacement', () => assert.strictEqual(readFileSync(file, 'utf8'), 'replacement'));
		assert.deepStrictEqual(readFileSync(file), original);
		assert.throws(() => coverage.withEntrypointOverride(file, 'replacement', () => { throw new Error('test failure'); }), /test failure/);
		assert.deepStrictEqual(readFileSync(file), original);
		assert.strictEqual(existsSync(`${file}.copilot-runtime-coverage-backup`), false);
		writeFileSync(`${file}.copilot-runtime-coverage-backup`, original);
		assert.throws(() => coverage.withEntrypointOverride(file, 'replacement', () => {}), /EEXIST/);
		assert.deepStrictEqual(readFileSync(file), original);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
