/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn, spawnSync } from 'child_process';
import { once } from 'events';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { connect } from 'net';
import { DeferredPromise, raceCancellationError } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { basename, join } from '../../../../base/common/path.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { DevContainerGitCredentialRelay, getDevContainerGitCredentialRelayArgs, validateGitCredentialInput } from '../../node/devContainerGitCredentialRelay.js';
import { shellEscape } from '../../node/sshRemoteAgentHostHelpers.js';

suite('Dev Container Git credential relay', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let directory: string;
	let environment: NodeJS.ProcessEnv;

	setup(async () => {
		directory = await mkdtemp(join(tmpdir(), 'vscode-git-relay-test-'));
		environment = {
			...process.env,
			ELECTRON_RUN_AS_NODE: '1',
			GIT_CONFIG_GLOBAL: join(directory, 'gitconfig'),
			GIT_CONFIG_NOSYSTEM: '1',
			GIT_TERMINAL_PROMPT: '0',
			GIT_ASKPASS: '',
			HOME: directory,
			XDG_CONFIG_HOME: directory,
		};
		await writeFile(environment.GIT_CONFIG_GLOBAL!, '[credential]\n\thelper = "!f() { :; }; f"\n');
	});

	teardown(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	async function runGit(operation: string, input: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
		const child = spawn('git', ['credential', operation], { env: environment, cwd: directory, stdio: 'pipe' });
		store.add(toDisposable(() => child.kill()));
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', data => stdout += data.toString());
		child.stderr.on('data', data => stderr += data.toString());
		const closed = once(child, 'close');
		child.stdin.end(input);
		const [code] = await closed;
		return { code, stdout, stderr };
	}

	async function startRelay(readCredential: (input: string, token: CancellationToken) => Promise<string>, logService = new NullLogService()) {
		const child = spawn(process.execPath, [...getDevContainerGitCredentialRelayArgs()], { env: environment, cwd: directory, stdio: 'pipe' });
		store.add(toDisposable(() => child.kill()));
		const relay = store.add(new DevContainerGitCredentialRelay(child, readCredential, logService, () => { }));
		await relay.ready;
		return { child, relay };
	}

	async function stopRelay({ child, relay }: Awaited<ReturnType<typeof startRelay>>): Promise<void> {
		const closed = once(child, 'close');
		relay.dispose();
		await closed;
	}

	function gitConfig(args: readonly string[]): string {
		const result = spawnSync('git', ['config', '--global', ...args], { env: environment, cwd: directory, encoding: 'utf8' });
		assert.strictEqual(result.status, 0, result.stderr);
		return result.stdout;
	}

	function legacyHelper(script: string): string {
		const normalized = script.replace(/\\/g, '/');
		const socket = process.platform === 'win32' ? `\\\\.\\pipe\\vscode-git-${basename(join(script, '..'))}` : join(script, '..', 'socket');
		return `!f() { ${shellEscape(process.execPath.replace(/\\/g, '/'))} ${shellEscape(normalized)} "$1" ${shellEscape(socket)}; }; f`;
	}

	test('closing a credential client cancels its permission wait without canceling another client', async () => {
		const requested = new DeferredPromise<void>();
		const canceled = new DeferredPromise<void>();
		let requests = 0;
		const running = await startRelay(async (input, token) => {
			if (++requests > 1) {
				return 'username=forwarded-user\npassword=fixture-secret\n\n';
			}
			const pending = new DeferredPromise<string>();
			store.add(token.onCancellationRequested(() => { void canceled.complete(); }));
			void requested.complete();
			return raceCancellationError(pending.p, token);
		});
		const helper = gitConfig(['--get-all', 'credential.helper']).trim().split('\n').at(-1)!;
		const socketPath = [...helper.matchAll(/'(?<value>(?:[^']|'\\'')*)'/g)].at(-1)!.groups!.value.replace(/'\\''/g, '\'');
		const client = connect(socketPath);
		store.add(toDisposable(() => client.destroy()));
		await once(client, 'connect');
		client.write(`${JSON.stringify({ input: 'protocol=https\nhost=example.invalid\n\n' })}\n`);
		await requested.p;
		client.end();
		await canceled.p;
		const result = await runGit('fill', 'protocol=https\nhost=example.invalid\n\n');
		await stopRelay(running);
		assert.deepStrictEqual({ requests, code: result.code, stderr: result.stderr }, { requests: 2, code: 0, stderr: '' });
	});

	test('removes stale legacy helpers without touching unrelated helpers or a live relay', async () => {
		const unrelated = '!f() { : "/tmp/vscode-git-unmanaged/helper.cjs"; }; f';
		gitConfig(['--add', 'credential.helper', unrelated]);
		const requests: string[] = [];
		const first = await startRelay(async input => {
			requests.push(input);
			return 'username=forwarded-user\npassword=fixture-secret\n\n';
		});
		const original = gitConfig(['--null', '--get-all', 'credential.helper']).split('\0').filter(Boolean);
		const missing = join(directory, 'folder with \' quotes', 'vscode-git-ABC123', 'helper.cjs');
		const stale = legacyHelper(missing);
		gitConfig(['--add', 'credential.helper', stale]);
		gitConfig(['--add', 'credential.helper', stale]);
		const second = await startRelay(async () => 'username=another-user\npassword=fixture-secret\n\n');
		const helpers = gitConfig(['--null', '--get-all', 'credential.helper']).split('\0').filter(Boolean);
		const input = 'protocol=https\nhost=example.invalid\n\n';
		const result = await runGit('fill', input);
		await stopRelay(second);
		await stopRelay(first);
		assert.deepStrictEqual({
			originalPreserved: helpers.slice(0, original.length),
			helperCount: helpers.length,
			stalePresent: helpers.includes(stale),
			requests,
			result: { code: result.code, forwarded: result.stdout.includes('password=fixture-secret'), stderr: result.stderr },
			remaining: gitConfig(['--null', '--get-all', 'credential.helper']).split('\0').filter(Boolean),
		}, {
			originalPreserved: original,
			helperCount: original.length + 1,
			stalePresent: false,
			requests: [input],
			result: { code: 0, forwarded: true, stderr: '' },
			remaining: ['!f() { :; }; f', unrelated],
		});
	});

	test('a missing helper script does not print a Node loader error while another relay works', async () => {
		const first = await startRelay(async () => '');
		const abandoned = gitConfig(['--null', '--get-all', 'credential.helper']).split('\0').filter(Boolean).at(-1)!;
		await stopRelay(first);
		const second = await startRelay(async () => 'username=forwarded-user\npassword=fixture-secret\n\n');
		gitConfig(['--add', 'credential.helper', abandoned]);
		const result = await runGit('fill', 'protocol=https\nhost=example.invalid\n\n');
		await stopRelay(second);
		gitConfig(['--fixed-value', '--unset-all', 'credential.helper', abandoned]);
		assert.deepStrictEqual({ code: result.code, stderr: result.stderr }, { code: 0, stderr: '' });
	});

	test('helper cleanup retries while another process holds the Git config lock', async () => {
		const running = await startRelay(async () => '');
		const lock = `${environment.GIT_CONFIG_GLOBAL}.lock`;
		await writeFile(lock, '');
		const released = new Promise<void>((resolve, reject) => {
			setTimeout(() => { void rm(lock).then(resolve, reject); }, 150);
		});
		await stopRelay(running);
		await released;
		assert.strictEqual(await readFile(environment.GIT_CONFIG_GLOBAL!, 'utf8'), '[credential]\n\thelper = "!f() { :; }; f"\n');
	});

	test('reconnecting removes a helper left by an abruptly terminated relay', async () => {
		const first = await startRelay(async () => '');
		const abandoned = gitConfig(['--null', '--get-all', 'credential.helper']).split('\0').filter(Boolean).at(-1)!;
		const closed = once(first.child, 'close');
		first.child.kill('SIGKILL');
		await closed;
		const second = await startRelay(async () => 'username=forwarded-user\npassword=fixture-secret\n\n');
		const helpers = gitConfig(['--null', '--get-all', 'credential.helper']).split('\0').filter(Boolean);
		const result = await runGit('fill', 'protocol=https\nhost=example.invalid\n\n');
		await stopRelay(second);
		const script = [...abandoned.matchAll(/'(?<value>(?:[^']|'\\'')*)'/g)][0].groups!.value.replace(/'\\''/g, '\'');
		await rm(join(script, '..'), { recursive: true, force: true });
		assert.deepStrictEqual({ abandonedPresent: helpers.includes(abandoned), code: result.code, stderr: result.stderr }, {
			abandonedPresent: false, code: 0, stderr: '',
		});
	});

	test('forwards concurrent HTTPS lookups and removes only its own helper on disconnect', async () => {
		const requests: string[] = [];
		const { child, relay } = await startRelay(async input => {
			requests.push(input);
			return 'username=forwarded-user\npassword=fixture-secret\n\n';
		});
		const input = 'protocol=https\nhost=example.invalid\n\n';
		const results = await Promise.all([runGit('fill', input), runGit('fill', input)]);
		const closed = once(child, 'close');
		relay.dispose();
		await closed;
		assert.deepStrictEqual({
			requests,
			results: results.map(result => ({ code: result.code, forwarded: result.stdout.includes('password=fixture-secret'), stderr: result.stderr })),
			config: await readFile(environment.GIT_CONFIG_GLOBAL!, 'utf8'),
		}, {
			requests: [input, input],
			results: [{ code: 0, forwarded: true, stderr: '' }, { code: 0, forwarded: true, stderr: '' }],
			config: '[credential]\n\thelper = "!f() { :; }; f"\n',
		});
	});

	test('never forwards credential store or erase operations', async () => {
		const requests: string[] = [];
		const running = await startRelay(async input => { requests.push(input); return ''; });
		const input = 'protocol=https\nhost=example.invalid\nusername=user\npassword=fixture-secret\n\n';
		await runGit('approve', input);
		await runGit('reject', input);
		await stopRelay(running);
		assert.deepStrictEqual(requests, []);
	});

	test('reports lookup failures without logging credentials or host helper errors', async () => {
		const warnings: string[] = [];
		const running = await startRelay(async () => { throw new Error('fixture-secret'); }, new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		const result = await runGit('fill', 'protocol=https\nhost=example.invalid\n\n');
		await stopRelay(running);
		assert.deepStrictEqual({
			failed: result.code !== 0,
			leaked: `${result.stdout}${result.stderr}${warnings.join('\n')}`.includes('fixture-secret'),
			warnings,
		}, {
			failed: true,
			leaked: false,
			warnings: ['[DevContainerAgentHost] Git credential lookup failed'],
		});
	});

	test('validates protocol fields rather than accepting arbitrary Git credential directives', () => {
		validateGitCredentialInput('protocol=https\nhost=example.invalid\npath=repo with spaces \n\n');
		const invalid = [
			'protocol=http\nhost=example.invalid\n\n',
			'protocol=https\n\n',
			'protocol=https\nhost=example.invalid\nurl=https://other.invalid\n\n',
			'protocol=https\nhost=example.invalid\npassword=secret\n\n',
			'protocol=https\nprotocol=https\nhost=example.invalid\n\n',
			'protocol=https\nhost=example.invalid\0\n\n',
			'protocol=https\r\nhost=example.invalid\r\n\r\n',
			`protocol=https\nhost=${'x'.repeat(65536)}\n\n`,
		];
		assert.deepStrictEqual(invalid.map(input => {
			try {
				validateGitCredentialInput(input);
				return false;
			} catch {
				return true;
			}
		}), invalid.map(() => true));
	});
});
