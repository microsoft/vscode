/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawn } from 'child_process';
import { once } from 'events';
import { timeout } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { parseSSHGOutput } from '../../common/sshConfigParsing.js';
import { buildSSHProxyJumpArguments, createSSHProxyJump, getSSHExecutableCandidates, rememberSSHProxyJump, SSHProxyJump } from '../../node/sshProxyJump.js';

suite('SSH ProxyJump', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const target = { host: 'target.internal', originalHost: 'work', port: 2200, username: 'alice' };

	test('separates the final jump port from the positional SSH destination', () => {
		assert.deepStrictEqual(buildSSHProxyJumpArguments('bob@jump.example:2222', target), [
			'-o', 'BatchMode=yes', '-p', '2222', '-W', 'target.internal:2200', '--', 'bob@jump.example',
		]);
	});

	test('preserves bare IPv6 jump destinations and bracketed forwarding targets', () => {
		assert.deepStrictEqual(buildSSHProxyJumpArguments('ssh://bob@[::1]:2222', { ...target, host: '2001:db8::1' }), [
			'-o', 'BatchMode=yes', '-p', '2222', '-W', '[2001:db8::1]:2200', '--', 'bob@::1',
		]);
	});

	test('expands tokens per component once, including IPv6 and jump ports', () => {
		assert.deepStrictEqual({
			alias: buildSSHProxyJumpArguments('%r@%n-bastion:%p', target),
			ipv6: buildSSHProxyJumpArguments('%h:2222', { ...target, host: '::1' }),
			literal: buildSSHProxyJumpArguments('jump-%%n', target),
		}, {
			alias: ['-o', 'BatchMode=yes', '-p', '2200', '-W', 'target.internal:2200', '--', 'alice@work-bastion'],
			ipv6: ['-o', 'BatchMode=yes', '-p', '2222', '-W', '[::1]:2200', '--', '::1'],
			literal: ['-o', 'BatchMode=yes', '-W', 'target.internal:2200', '--', 'jump-%n'],
		});
	});

	test('delegates preceding jump hosts to OpenSSH with their user and port', () => {
		assert.deepStrictEqual(buildSSHProxyJumpArguments('first:2001,alice@[::1]:2002,bob@last:2003', target), [
			'-o', 'BatchMode=yes', '-J', 'first:2001,alice@[::1]:2002',
			'-p', '2003', '-W', 'target.internal:2200', '--', 'bob@last',
		]);
	});

	test('preserves Windows domain usernames in direct argv but not nested shell hops', () => {
		assert.deepStrictEqual(buildSSHProxyJumpArguments(String.raw`CORP\alice@jump:2222`, target), [
			'-o', 'BatchMode=yes', '-p', '2222', '-W', 'target.internal:2200', '--', String.raw`CORP\alice@jump`,
		]);
		assert.throws(() => buildSSHProxyJumpArguments(String.raw`CORP\alice@first,last`, target), /configure domain usernames in SSH Host entries/);
	});

	test('rejects malformed hosts, ports, tokens, and shell-sensitive jump components', () => {
		for (const value of [
			'', 'first,,last', 'jump:', 'jump:0', 'jump:65536', 'jump:1.5', '@jump', '-oProxyCommand=command',
			'alice@-V', '[::1', '[]', '::1:22', 'jump;%h', 'jump$(command)', 'jump\nother', 'jump-%x', 'jump-%',
		]) {
			assert.throws(() => buildSSHProxyJumpArguments(value, target), Error, value);
		}
	});

	test('never accepts proxy data from a serialized or forged resolved configuration', async () => {
		const resolved = rememberSSHProxyJump(parseSSHGOutput('hostname target\nport 22'), 'proxyjump jump');
		const log = store.add(new NullLogService());
		const options = { resolveExecutable: async () => assert.fail('Must not resolve or launch a helper') };
		const forged = { ...resolved, proxyJump: 'jump' };
		assert.deepStrictEqual({
			keys: Object.keys(resolved),
			cloned: await createSSHProxyJump({ ...resolved }, target, log, options),
			forged: await createSSHProxyJump(forged, target, log, options),
			noJump: await createSSHProxyJump(rememberSSHProxyJump({ ...resolved }, 'proxyjump none'), target, log, options),
			command: await createSSHProxyJump(rememberSSHProxyJump({ ...resolved, proxyCommand: 'proxy' }, 'proxyjump jump'), target, log, options),
		}, {
			keys: Object.keys(parseSSHGOutput('hostname target\nport 22')),
			cloned: undefined,
			forged: undefined,
			noJump: undefined,
			command: undefined,
		});
	});

	test('never searches relative or empty PATH entries for OpenSSH', () => {
		assert.deepStrictEqual({
			posix: getSSHExecutableCandidates('darwin', '.::relative:/usr/bin'),
			windows: getSSHExecutableCandidates('win32', String.raw`.;relative;;C:\Tools`, String.raw`C:\Windows`),
		}, {
			posix: ['/usr/bin/ssh'],
			windows: [String.raw`C:\Tools\ssh.exe`, String.raw`C:\Windows\System32\OpenSSH\ssh.exe`],
		});
	});

	test('relays bytes through an absolute executable and terminates the owned child exactly once', async () => {
		const resolved = rememberSSHProxyJump(parseSSHGOutput('hostname target'), 'proxyjump jump:2222');
		const log = store.add(new NullLogService());
		let terminations = 0;
		const child = spawn(process.execPath, ['-e', 'process.stdout.write("ready");process.stdin.pipe(process.stdout)'], {
			stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
		});
		const closed = once(child, 'close');
		const proxy = await createSSHProxyJump(resolved, target, log, {
			environment: { ...process.env, DISPLAY: ':99', WAYLAND_DISPLAY: 'wayland-test', SSH_ASKPASS_REQUIRE: 'force' },
			resolveExecutable: async () => '/absolute/ssh',
			spawn: (executable, args, options) => {
				assert.deepStrictEqual({
					executable, args, shell: options.shell, detached: options.detached, askpass: options.env?.SSH_ASKPASS_REQUIRE,
					display: options.env?.DISPLAY, waylandDisplay: options.env?.WAYLAND_DISPLAY,
				}, {
					executable: '/absolute/ssh',
					args: ['-o', 'BatchMode=yes', '-p', '2222', '-W', 'target.internal:2200', '--', 'jump'],
					shell: false,
					detached: process.platform !== 'win32',
					askpass: 'never',
					display: undefined, waylandDisplay: undefined,
				});
				return child;
			},
			terminate: async () => { terminations++; child.kill(); },
		});
		assert.ok(proxy);
		store.add(proxy);
		try {
			const [ready] = await once(proxy.stream, 'data');
			const echoed = once(proxy.stream, 'data');
			proxy.stream.write('SSH bytes');
			const [bytes] = await echoed;
			proxy.dispose();
			proxy.dispose();
			await closed;
			assert.deepStrictEqual({ ready: ready.toString(), bytes: bytes.toString(), terminations }, {
				ready: 'ready', bytes: 'SSH bytes', terminations: 1,
			});
		} finally {
			proxy.dispose();
			child.kill();
		}
	});

	test('waits for delayed stderr after stdout EOF and returns a sanitized diagnostic', async () => {
		const child = spawn(process.execPath, ['-e', 'process.stdout.end();setTimeout(()=>{process.stderr.write("secret-token Permission denied (publickey).");process.exit(255)},60)'], {
			stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
		});
		const proxy = store.add(new SSHProxyJump(child, store.add(new NullLogService())));
		const ended = once(proxy.stream, 'end');
		proxy.stream.resume();
		await ended;
		assert.strictEqual(await proxy.describeFailure(), 'Jump host authentication failed. Configure noninteractive OpenSSH authentication.');
	});

	test('distinguishes final-target forwarding failures from jump-host reachability', async () => {
		const results: Array<string | undefined> = [];
		for (const stderr of [
			'channel 0: open failed: connect failed: Connection refused\nstdio forwarding failed',
			'channel 0: open failed: connect failed: Name or service not known',
			'ssh: connect to host jump port 22: Operation timed out',
		]) {
			const child = spawn(process.execPath, ['-e', 'process.stderr.write(process.argv[1]);process.exit(255)', stderr], {
				stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
			});
			const proxy = store.add(new SSHProxyJump(child, store.add(new NullLogService())));
			results.push(await proxy.describeFailure());
		}
		assert.deepStrictEqual(results, [
			'A jump host could not connect to the next host or the target.',
			'A jump host could not connect to the next host or the target.',
			'The jump host could not be reached.',
		]);
	});

	test('bounds waiting for a stalled jump and allows disposal before ssh2 adopts the stream', async () => {
		const child = spawn(process.execPath, ['-e', 'process.stdout.write("ready");setInterval(()=>{},1000)'], {
			stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
		});
		const proxy = store.add(new SSHProxyJump(child, store.add(new NullLogService()), async () => { child.kill(); }));
		try {
			assert.strictEqual(await proxy.describeFailure(), undefined);
			proxy.dispose();
			await timeout(0);
		} finally {
			proxy.dispose();
			child.kill();
		}
	});
});
