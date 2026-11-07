/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { dirname, join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { hasKey } from '../../../../base/common/types.js';
import { SnapshotContext } from '../../../../base/test/common/snapshot.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { preserveAgentHostE2ELogs, withAgentHostE2ESnapshotDiagnostics } from './e2e/harness/agentHostE2EDiagnostics.js';

suite('Agent Host E2E diagnostics', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('retains logs from before and after a restart even after the isolated home is removed', () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-host-diagnostics-'));
		disposables.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const home = join(root, 'home');
		const destination = join(root, 'retained');
		const files = [
			['logs/first/agenthost-server.log', 'host/first/agenthost-server.log', 'shutdown timed out'],
			['logs/second/agenthost-server.log', 'host/second/agenthost-server.log', 'restarted'],
			['.copilot/logs/process-1.log', 'copilot/process-1.log', 'provider shutdown'],
		];
		for (const [source, , content] of files) {
			const path = join(home, source);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, content);
		}

		preserveAgentHostE2ELogs(home, home, destination, 'restart failure');
		rmSync(home, { recursive: true });

		assert.deepStrictEqual({
			label: readFileSync(join(destination, 'failures.log'), 'utf8'),
			logs: files.map(([, retained]) => readFileSync(join(destination, retained), 'utf8')),
		}, {
			label: 'restart failure\n',
			logs: files.map(([, , content]) => content),
		});
	});

	test('records missing host and provider logs without inventing log files', () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-host-diagnostics-'));
		disposables.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const destination = join(root, 'retained');

		preserveAgentHostE2ELogs(join(root, 'missing'), join(root, 'missing'), destination, 'startup failure');

		assert.deepStrictEqual({
			label: readFileSync(join(destination, 'failures.log'), 'utf8'),
			host: existsSync(join(destination, 'host')),
			provider: existsSync(join(destination, 'copilot')),
		}, {
			label: 'startup failure\n',
			host: false,
			provider: false,
		});
	});

	test('surfaces errors other than absent log directories', () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-host-diagnostics-'));
		disposables.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const invalidDestination = join(root, 'not-a-directory');
		writeFileSync(invalidDestination, '');

		assert.throws(() => preserveAgentHostE2ELogs(root, root, invalidDestination, 'failure'));
	});

	test('retains complete normalized snapshot comparisons beyond the CI reporter limit', async () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-host-diagnostics-'));
		disposables.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const destination = join(root, 'retained');
		const expected = `${'expected normalized content\n'.repeat(1000)}EXPECTED_END`;
		const actual = `${'actual normalized content\n'.repeat(1000)}ACTUAL_END`;
		const error = Object.assign(new Error('Snapshot #prompt does not match expected output'), {
			snapshotPath: join(root, 'source', 'test.prompt.md'), expected, actual,
		});

		await assert.rejects(withAgentHostE2ESnapshotDiagnostics(async () => { throw error; }, destination), cause => cause === error);

		assert.deepStrictEqual({
			files: readdirSync(destination).sort(),
			expected: readFileSync(join(destination, 'test.prompt.md.expected'), 'utf8'),
			actual: readFileSync(join(destination, 'test.prompt.md.actual'), 'utf8'),
			sourceCreated: existsSync(join(root, 'source')),
		}, {
			files: ['test.prompt.md.actual', 'test.prompt.md.expected'],
			expected,
			actual,
			sourceCreated: false,
		});
	});

	test('passing assertions and unrelated failures create no snapshot artifacts', async () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-host-diagnostics-'));
		disposables.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const destination = join(root, 'retained');
		const error = new Error('provider failure');

		await withAgentHostE2ESnapshotDiagnostics(async () => { }, destination);
		await assert.rejects(withAgentHostE2ESnapshotDiagnostics(async () => { throw error; }, destination), cause => cause === error);

		assert.strictEqual(existsSync(destination), false);
	});

	test('retains a real snapshot assertion mismatch without rewriting its baseline', async function () {
		const currentTest = this.test;
		assert.ok(currentTest && hasKey<Mocha.Runnable | Mocha.Test, { clone: true }>(currentTest, { clone: true }));
		const root = mkdtempSync(join(tmpdir(), 'agent-host-diagnostics-'));
		disposables.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const snapshots = join(root, 'snapshots');
		const destination = join(root, 'retained');
		mkdirSync(snapshots);
		const context = new class extends SnapshotContext {
			constructor(test: Mocha.Test) {
				super(test);
				this.snapshotsDir = URI.file(snapshots);
			}
		}(currentTest);
		const name = `${currentTest.fullTitle().replace(/[^a-z0-9_-]/gi, '_')}.prompt.md`;
		writeFileSync(join(snapshots, name), 'expected baseline');

		await assert.rejects(withAgentHostE2ESnapshotDiagnostics(() => context.assert('actual comparison', { name: 'prompt', extension: 'md' }), destination),
			{ message: 'Snapshot #prompt does not match expected output' });

		assert.deepStrictEqual({
			baseline: readFileSync(join(snapshots, name), 'utf8'),
			expected: readFileSync(join(destination, `${name}.expected`), 'utf8'),
			actual: readFileSync(join(destination, `${name}.actual`), 'utf8'),
		}, {
			baseline: 'expected baseline',
			expected: 'expected baseline',
			actual: 'actual comparison',
		});
	});

	test('a later passing comparison does not remove retained mismatch evidence', async () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-host-diagnostics-'));
		disposables.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const destination = join(root, 'retained');
		const error = Object.assign(new Error('Snapshot mismatch'), {
			snapshotPath: join(root, 'test.traffic.ahp.yaml'), expected: 'expected', actual: 'actual',
		});

		await assert.rejects(withAgentHostE2ESnapshotDiagnostics(async () => { throw error; }, destination), cause => cause === error);
		await withAgentHostE2ESnapshotDiagnostics(async () => { }, destination);

		assert.deepStrictEqual(readdirSync(destination).sort(), ['test.traffic.ahp.yaml.actual', 'test.traffic.ahp.yaml.expected']);
	});

	test('preservation failures report both errors rather than masking the snapshot mismatch', async () => {
		const root = mkdtempSync(join(tmpdir(), 'agent-host-diagnostics-'));
		disposables.add(toDisposable(() => rmSync(root, { recursive: true, force: true })));
		const destination = join(root, 'not-a-directory');
		writeFileSync(destination, '');
		const error = Object.assign(new Error('Snapshot mismatch'), {
			snapshotPath: join(root, 'test.traffic.ahp.yaml'), expected: 'expected', actual: 'actual',
		});

		await assert.rejects(withAgentHostE2ESnapshotDiagnostics(async () => { throw error; }, destination), cause =>
			cause instanceof AggregateError && cause.errors.length === 2 && cause.errors[0] === error && cause.errors[1] instanceof Error);
	});
});
