/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as cp from 'child_process';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { LocalGitService } from '../../node/localGitService.js';

interface IExecFileExpectation {
	args: string[];
	stdout?: string;
	stderr?: string;
	error?: cp.ExecFileException;
}

function createExecFile(expectations: IExecFileExpectation[]): typeof cp.execFile {
	return ((command: string, args: readonly string[], _options: cp.ExecFileOptions, callback: (error: cp.ExecFileException | null, stdout: string, stderr: string) => void) => {
		assert.strictEqual(command, 'git');

		const expectation = expectations.shift();
		assert.ok(expectation, `Unexpected git call: ${(args as string[]).join(' ')}`);
		assert.deepStrictEqual(args, expectation.args);

		queueMicrotask(() => callback(expectation.error ?? null, expectation.stdout ?? '', expectation.stderr ?? ''));

		return {} as cp.ChildProcess;
	}) as typeof cp.execFile;
}

function createDivergedPullError(): cp.ExecFileException {
	const error = new Error('fatal: Not possible to fast-forward, aborting.') as cp.ExecFileException & { stderr: string };
	error.code = 128;
	error.stderr = 'fatal: Not possible to fast-forward, aborting.';
	return error;
}

function createPullError(message: string, stderr: string, code = 128): cp.ExecFileException {
	const error = new Error(message) as cp.ExecFileException & { stderr: string };
	error.code = code;
	error.stderr = stderr;
	return error;
}

suite('LocalGitService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	void store;

	test('pull runs ff-only for normal updates', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'] },
			{ args: ['rev-parse', 'HEAD'], stdout: 'bbbb\n' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		const changed = await service.pull('test-op', 'C:\\repo');

		assert.strictEqual(changed, true);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull recovers from diverged history by resetting to upstream', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['fetch', '--prune'] },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['status', '--porcelain'], stdout: '' },
			{ args: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], stdout: 'origin/main\n' },
			{ args: ['rev-list', '--count', 'HEAD..@{u}'], stdout: '2\n' },
			{ args: ['rev-list', '--count', '@{u}..HEAD'], stdout: '1\n' },
			{ args: ['reset', '--hard', 'origin/main'] },
			{ args: ['rev-parse', 'HEAD'], stdout: 'bbbb\n' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		const changed = await service.pull('test-op', 'C:\\repo', { allowHardResetOnDivergence: true });

		assert.strictEqual(changed, true);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull rejects hard reset recovery when working tree is dirty', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['fetch', '--prune'] },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['status', '--porcelain'], stdout: ' M package.json\n' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		await assert.rejects(
			() => service.pull('test-op', 'C:\\repo', { allowHardResetOnDivergence: true }),
			/Not possible to fast-forward/
		);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull rethrows non-fast-forward errors without retrying', async () => {
		const pullError = createPullError('fatal: Failed to pull', 'fatal: Authentication failed');
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: pullError, stderr: 'fatal: Authentication failed' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		await assert.rejects(
			() => service.pull('test-op', 'C:\\repo', { allowHardResetOnDivergence: true }),
			/Failed to pull/
		);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull rethrows retry failures that are not fast-forward related', async () => {
		const retryError = createPullError('fatal: Failed to pull', 'fatal: Authentication failed');
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['fetch', '--prune'] },
			{ args: ['pull', '--ff-only'], error: retryError, stderr: 'fatal: Authentication failed' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		await assert.rejects(
			() => service.pull('test-op', 'C:\\repo', { allowHardResetOnDivergence: true }),
			/Failed to pull/
		);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull succeeds on second ff-only attempt after fetch', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['fetch', '--prune'] },
			{ args: ['pull', '--ff-only'] },
			{ args: ['rev-parse', 'HEAD'], stdout: 'bbbb\n' },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		const changed = await service.pull('test-op', 'C:\\repo');

		assert.strictEqual(changed, true);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull without hard-reset option does not attempt destructive recovery', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['fetch', '--prune'] },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		await assert.rejects(
			() => service.pull('test-op', 'C:\\repo'),
			/Not possible to fast-forward/
		);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull rethrows when upstream cannot be resolved during recovery', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['fetch', '--prune'] },
			{ args: ['pull', '--ff-only'], error: createDivergedPullError() },
			{ args: ['status', '--porcelain'], stdout: '' },
			{ args: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], error: new Error('no upstream configured') as cp.ExecFileException },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		await assert.rejects(
			() => service.pull('test-op', 'C:\\repo', { allowHardResetOnDivergence: true }),
			/Not possible to fast-forward/
		);
		assert.strictEqual(expectations.length, 0);
	});
});
