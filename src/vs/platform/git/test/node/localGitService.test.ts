/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as cp from 'child_process';
import * as sinon from 'sinon';
import { NullLogService } from '../../../log/common/log.js';
import { LocalGitService } from '../../node/localGitService.js';

interface IExecFileExpectation {
	args: string[];
	stdout?: string;
	stderr?: string;
	error?: cp.ExecFileException;
}

function stubExecFile(expectations: IExecFileExpectation[]): void {
	sinon.stub(cp, 'execFile').callsFake((command: unknown, args: unknown, _options: unknown, callback: unknown) => {
		assert.strictEqual(command, 'git');

		const expectation = expectations.shift();
		assert.ok(expectation, `Unexpected git call: ${(args as string[]).join(' ')}`);
		assert.deepStrictEqual(args, expectation.args);

		const cb = callback as (error: cp.ExecFileException | null, stdout: string, stderr: string) => void;
		cb(expectation.error ?? null, expectation.stdout ?? '', expectation.stderr ?? '');

		return {} as cp.ChildProcess;
	});
}

function createDivergedPullError(): cp.ExecFileException {
	const error = new Error('fatal: Not possible to fast-forward, aborting.') as cp.ExecFileException & { stderr: string };
	error.code = 128;
	error.stderr = 'fatal: Not possible to fast-forward, aborting.';
	return error;
}

suite('LocalGitService', () => {
	teardown(() => {
		sinon.restore();
	});

	test('pull runs ff-only for normal updates', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'] },
			{ args: ['rev-parse', 'HEAD'], stdout: 'bbbb\n' },
		];
		stubExecFile(expectations);

		const service = new LocalGitService(new NullLogService());
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
		stubExecFile(expectations);

		const service = new LocalGitService(new NullLogService());
		const changed = await service.pull('test-op', 'C:\\repo');

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
		stubExecFile(expectations);

		const service = new LocalGitService(new NullLogService());

		await assert.rejects(
			() => service.pull('test-op', 'C:\\repo'),
			/Not possible to fast-forward/
		);
		assert.strictEqual(expectations.length, 0);
	});

	test('pull rethrows errors after retries when repo is not diverged', async () => {
		const pullError = new Error('fatal: Failed to pull') as cp.ExecFileException;
		pullError.code = 128;

		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', 'HEAD'], stdout: 'aaaa\n' },
			{ args: ['pull', '--ff-only'], error: pullError, stderr: 'fatal: Authentication failed' },
			{ args: ['fetch', '--prune'] },
			{ args: ['pull', '--ff-only'], error: pullError, stderr: 'fatal: Authentication failed' },
			{ args: ['status', '--porcelain'], stdout: '' },
			{ args: ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], stdout: 'origin/main\n' },
			{ args: ['rev-list', '--count', 'HEAD..@{u}'], stdout: '1\n' },
			{ args: ['rev-list', '--count', '@{u}..HEAD'], stdout: '0\n' },
		];
		stubExecFile(expectations);

		const service = new LocalGitService(new NullLogService());

		await assert.rejects(
			() => service.pull('test-op', 'C:\\repo'),
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
		stubExecFile(expectations);

		const service = new LocalGitService(new NullLogService());
		const changed = await service.pull('test-op', 'C:\\repo');

		assert.strictEqual(changed, true);
		assert.strictEqual(expectations.length, 0);
	});
});
