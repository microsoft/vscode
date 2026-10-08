/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
import { once } from 'events';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { DevContainerGitCredentialRelay, getDevContainerGitCredentialRelayArgs, validateGitCredentialInput } from '../../node/devContainerGitCredentialRelay.js';

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

	async function startRelay(readCredential: (input: string) => Promise<string>, logService = new NullLogService()) {
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
