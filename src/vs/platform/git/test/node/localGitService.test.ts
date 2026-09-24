/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as cp from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { isCancellationError } from '../../../../base/common/errors.js';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { LocalGitService } from '../../node/localGitService.js';

interface IExecFileExpectation {
	args: string[];
	environment?: Record<string, string>;
	absentEnvironment?: string[];
	stdout?: string;
	stderr?: string;
	error?: cp.ExecFileException;
}

function createExecFile(expectations: IExecFileExpectation[]): typeof cp.execFile {
	return ((command: string, args: readonly string[], options: cp.ExecFileOptions, callback: (error: cp.ExecFileException | null, stdout: string, stderr: string) => void) => {
		assert.strictEqual(command, 'git');

		const expectation = expectations.shift();
		assert.ok(expectation, `Unexpected git call: ${(args as string[]).join(' ')}`);
		assert.deepStrictEqual(args, expectation.args);
		for (const [key, value] of Object.entries(expectation.environment ?? {})) {
			assert.strictEqual(options.env?.[key], value);
		}
		for (const key of expectation.absentEnvironment ?? []) {
			assert.strictEqual(options.env?.[key], undefined);
		}

		queueMicrotask(() => callback(expectation.error ?? null, expectation.stdout ?? '', expectation.stderr ?? ''));

		return { kill: () => true } as cp.ChildProcess;
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
	const temporaryDirectories: string[] = [];
	const execFile = promisify(cp.execFile);
	void store;

	teardown(async () => {
		await Promise.all(temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
	});

	test('clone passes scoped HTTP authentication through Git config environment variables', async () => {
		const environmentNames = new Map(Object.keys(process.env).map(key => [key.toUpperCase(), key]));
		const configuredCountName = environmentNames.get('GIT_CONFIG_COUNT');
		const configuredCount = Number.parseInt(configuredCountName ? process.env[configuredCountName] ?? '' : '', 10);
		let index = 0;
		if (Number.isInteger(configuredCount) && configuredCount >= 0) {
			for (let inheritedIndex = 0; inheritedIndex < configuredCount; inheritedIndex++) {
				const keyName = environmentNames.get(`GIT_CONFIG_KEY_${inheritedIndex}`);
				const key = keyName ? process.env[keyName] : undefined;
				if (key !== undefined && !/^http\..+\.extraheader$/i.test(key)) {
					index++;
				}
			}
		}
		const expectations: IExecFileExpectation[] = [{ args: ['--version'], stdout: 'git version 2.31.0\n' }, {
			args: ['clone', '--', 'https://github.com/test/private.git', '/tmp/private'],
			environment: {
				GIT_TRACE2: '0',
				GIT_TRACE2_EVENT: '0',
				GIT_TRACE2_PERF: '0',
				GIT_TRACE_REDACT: '1',
				GIT_CONFIG_COUNT: String(index + 2),
				[`GIT_CONFIG_KEY_${index}`]: 'http.https://github.com/test/private.git.extraHeader',
				[`GIT_CONFIG_VALUE_${index}`]: '',
				[`GIT_CONFIG_KEY_${index + 1}`]: 'http.https://github.com/test/private.git.extraHeader',
				[`GIT_CONFIG_VALUE_${index + 1}`]: 'Authorization: Basic secret',
			},
		}];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		await service.clone('test-op', 'https://github.com/test/private.git', '/tmp/private', undefined, {
			authentication: {
				url: 'https://github.com/test/private.git',
				authorizationHeader: 'Authorization: Basic secret',
			},
		});

		assert.strictEqual(expectations.length, 0);
	});

	test('authenticated Git removes tracing variables case-insensitively', async () => {
		const inherited = {
			git_trace_curl: '1',
			Git_Curl_Verbose: '1',
			git_trace2_event: '/tmp/git-trace.json',
		};
		const previous = Object.fromEntries(Object.keys(inherited).map(key => [key, process.env[key]]));
		Object.assign(process.env, inherited);
		try {
			const expectations: IExecFileExpectation[] = [{ args: ['--version'], stdout: 'git version 2.31.0\n' }, {
				args: ['clone', '--', 'https://github.com/test/private.git', '/tmp/private'],
				absentEnvironment: Object.keys(inherited),
			}];
			const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

			await service.clone('test-op', 'https://github.com/test/private.git', '/tmp/private', undefined, {
				authentication: {
					url: 'https://github.com/test/private.git',
					authorizationHeader: 'Authorization: Basic secret',
				},
			});

			assert.strictEqual(expectations.length, 0);
		} finally {
			for (const [key, value] of Object.entries(previous)) {
				if (value === undefined) {
					delete process.env[key];
				} else {
					process.env[key] = value;
				}
			}
		}
	});

	test('authenticated Git removes inherited extra headers and preserves other indexed config', async () => {
		const configEnvironmentPattern = /^GIT_CONFIG_(?:COUNT|PARAMETERS|KEY_\d+|VALUE_\d+)$/i;
		const previous = Object.fromEntries(Object.entries(process.env).filter(([key]) => configEnvironmentPattern.test(key)));
		for (const key of Object.keys(previous)) {
			delete process.env[key];
		}
		Object.assign(process.env, {
			git_config_count: '3',
			git_config_key_0: 'http.https://github.com/test/.extraHeader',
			git_config_value_0: 'Authorization: Basic inherited',
			GIT_CONFIG_KEY_1: 'http.proxy',
			GIT_CONFIG_VALUE_1: 'http://proxy.test',
			GIT_CONFIG_KEY_2: 'http.https://example.com/.extraHeader',
			GIT_CONFIG_VALUE_2: 'Authorization: Basic unrelated',
			GIT_CONFIG_PARAMETERS: `'http.https://github.com/.extraHeader=Authorization: Basic parameter'`,
		});
		try {
			const expectations: IExecFileExpectation[] = [{ args: ['--version'], stdout: 'git version 2.31.0\n' }, {
				args: ['clone', '--', 'https://github.com/test/private.git', '/tmp/private'],
				environment: {
					GIT_CONFIG_COUNT: '3',
					GIT_CONFIG_KEY_0: 'http.proxy',
					GIT_CONFIG_VALUE_0: 'http://proxy.test',
					GIT_CONFIG_KEY_1: 'http.https://github.com/test/private.git.extraHeader',
					GIT_CONFIG_VALUE_1: '',
					GIT_CONFIG_KEY_2: 'http.https://github.com/test/private.git.extraHeader',
					GIT_CONFIG_VALUE_2: 'Authorization: Basic editor',
				},
				absentEnvironment: [
					'git_config_count',
					'git_config_key_0',
					'git_config_value_0',
					'GIT_CONFIG_PARAMETERS',
				],
			}];
			const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

			await service.clone('test-op', 'https://github.com/test/private.git', '/tmp/private', undefined, {
				authentication: {
					url: 'https://github.com/test/private.git',
					authorizationHeader: 'Authorization: Basic editor',
				},
			});

			assert.strictEqual(expectations.length, 0);
		} finally {
			for (const key of Object.keys(process.env)) {
				if (configEnvironmentPattern.test(key)) {
					delete process.env[key];
				}
			}
			Object.assign(process.env, previous);
		}
	});

	test('authenticated Git rejects old versions and rechecks after an upgrade', async () => {
		const expectations: IExecFileExpectation[] = [
			{ args: ['--version'], stdout: 'git version 2.30.9\n' },
			{ args: ['--version'], stdout: 'git version 2.31.0\n' },
			{ args: ['fetch'] },
			{ args: ['fetch'] },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
		const options = { authentication: { url: 'https://github.com/test/private.git', authorizationHeader: 'Authorization: Basic secret' } };

		await assert.rejects(service.fetch('old-git', '/tmp/private', options), /requires Git 2\.31 or later/);
		await service.fetch('upgraded-git', '/tmp/private', options);
		await service.fetch('cached-version', '/tmp/private', options);

		assert.strictEqual(expectations.length, 0);
	});

	test('cancelling the authentication version check does not launch a network operation', async () => {
		const expectations: IExecFileExpectation[] = [{ args: ['--version'], stdout: 'git version 2.31.0\n' }];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
		const operation = service.fetch('cancelled', '/tmp/private', {
			authentication: { url: 'https://github.com/test/private.git', authorizationHeader: 'Authorization: Basic secret' },
		});
		const rejected = assert.rejects(operation, isCancellationError);
		await service.cancel('cancelled');
		await rejected;

		assert.strictEqual(expectations.length, 0);
	});

	test('authenticated failures redact credentials before logging and rejecting', async () => {
		const logged: string[] = [];
		const logService = new class extends NullLogService {
			override error(message: string | Error, ...args: unknown[]): void {
				logged.push([message, ...args].join(' '));
			}
		}();
		const error = createPullError('Authorization: Basic dummy-credential', 'Trace2: Authorization: Basic dummy-credential');
		const service = new LocalGitService(logService, createExecFile([{ args: ['--version'], stdout: 'git version 2.31.0\n' }, {
			args: ['fetch'],
			error,
		}]));

		await assert.rejects(service.fetch('test-op', '/tmp/private', {
			authentication: { url: 'https://github.com/test/private.git', authorizationHeader: 'Authorization: Basic dummy-credential' },
		}), error);
		assert.deepStrictEqual({
			message: error.message,
			stderr: (error as cp.ExecFileException & { stderr: string }).stderr,
			stackContainsCredential: error.stack?.includes('dummy-credential'),
			logContainsCredential: logged.join('\n').includes('dummy-credential'),
		}, {
			message: '[redacted]',
			stderr: 'Trace2: [redacted]',
			stackContainsCredential: false,
			logContainsCredential: false,
		});
	});

	test('getRemoteUrl returns the origin URL', async () => {
		const expectations: IExecFileExpectation[] = [{
			args: ['remote', 'get-url', 'origin'],
			stdout: 'https://github.com/test/private.git\n',
		}];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		assert.strictEqual(await service.getRemoteUrl('test-op', '/tmp/private'), 'https://github.com/test/private.git');
		assert.strictEqual(expectations.length, 0);
	});

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

	test('checkoutCommit accepts uppercase SHA and verifies HEAD', async () => {
		const expectedCommit = 'AABBCCDDEEFF00112233445566778899AABBCCDD';
		const normalizedCommit = expectedCommit.toLowerCase();
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', `${normalizedCommit}^{commit}`], stdout: `${normalizedCommit}\n` },
			{ args: ['checkout', '--detach', normalizedCommit] },
			{ args: ['rev-parse', 'HEAD'], stdout: `${normalizedCommit}\n` },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		await service.checkoutCommit('test-op', 'C:\\repo', expectedCommit);

		assert.strictEqual(expectations.length, 0);
	});

	test('checkoutCommit rejects when HEAD differs after checkout', async () => {
		const expectedCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
		const checkedOutCommit = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
		const expectations: IExecFileExpectation[] = [
			{ args: ['rev-parse', `${expectedCommit}^{commit}`], stdout: `${expectedCommit}\n` },
			{ args: ['checkout', '--detach', expectedCommit] },
			{ args: ['rev-parse', 'HEAD'], stdout: `${checkedOutCommit}\n` },
		];
		const service = new LocalGitService(new NullLogService(), createExecFile(expectations));

		await assert.rejects(() => service.checkoutCommit('test-op', 'C:\\repo', expectedCommit), /was not checked out/);
		assert.strictEqual(expectations.length, 0);
	});

	test('checkoutCommit rejects a real SHA-shaped branch that points to another commit', async () => {
		const repoPath = await fs.mkdtemp(join(tmpdir(), 'vscode-plugin-git-'));
		temporaryDirectories.push(repoPath);
		const runGit = async (...args: string[]): Promise<string> => {
			const { stdout } = await execFile('git', ['-C', repoPath, ...args], { encoding: 'utf8' });
			return stdout.trim();
		};

		await runGit('init');
		await fs.writeFile(join(repoPath, 'payload.txt'), 'branch content');
		await runGit('add', 'payload.txt');
		await runGit('-c', 'user.name=VS Code Test', '-c', 'user.email=vscode-test@example.com', 'commit', '-m', 'branch commit');
		const initialCommit = await runGit('rev-parse', 'HEAD');
		const pinnedCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
		await runGit('branch', pinnedCommit);

		const service = new LocalGitService(new NullLogService());
		await assert.rejects(() => service.checkoutCommit('test-op', repoPath, pinnedCommit));

		assert.strictEqual(await runGit('rev-parse', 'HEAD'), initialCommit);
	}).timeout(20_000);
});
