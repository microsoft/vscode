/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createSSHProxySpawnSpec, getSSHExecutableCandidates, parseSSHProxyTransport, validateSSHConfigHost } from '../../node/sshProxyTransport.js';

suite('SSH Proxy Transport', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses the effective proxy transport', () => {
		assert.deepStrictEqual({
			command: parseSSHProxyTransport('hostname internal\nproxycommand gh codespace ssh --stdio'),
			jump: parseSSHProxyTransport('hostname internal\nproxyjump user@jump.example:2222'),
			commandNone: parseSSHProxyTransport('proxycommand none'),
			jumpNone: parseSSHProxyTransport('proxyjump none'),
			absent: parseSSHProxyTransport('hostname example.com'),
		}, {
			command: { type: 'command', command: 'gh codespace ssh --stdio' },
			jump: { type: 'jump', proxyJump: 'user@jump.example:2222' },
			commandNone: undefined,
			jumpNone: undefined,
			absent: undefined,
		});
	});

	test('rejects ambiguous proxy configuration', () => {
		assert.throws(() => parseSSHProxyTransport([
			'proxycommand ssh -W %h:%p jump',
			'proxyjump jump',
		].join('\n')));
	});

	test('expands ProxyCommand tokens once', () => {
		const spec = createSSHProxySpawnSpec(
			{ type: 'command', command: 'proxy %%h %%%h %h %n %p %r' },
			{ host: 'internal.example', originalHost: 'work', port: 2222, username: 'alice' },
		);

		assert.deepStrictEqual(spec, {
			command: 'proxy %h %internal.example internal.example work 2222 alice',
			args: [],
			shell: true,
		});
	});

	test('rejects malformed, unsupported, or unsafe ProxyCommand expansions', () => {
		const parameters = { host: 'internal.example', originalHost: 'work', port: 22, username: 'alice' };
		const failures = [
			() => createSSHProxySpawnSpec({ type: 'command', command: 'proxy %' }, parameters),
			() => createSSHProxySpawnSpec({ type: 'command', command: 'proxy %C' }, parameters),
			() => createSSHProxySpawnSpec({ type: 'command', command: 'proxy %h' }, { ...parameters, host: 'host; whoami' }),
			() => createSSHProxySpawnSpec({ type: 'command', command: 'proxy %h' }, { ...parameters, host: '-oProxyCommand=whoami' }),
			() => createSSHProxySpawnSpec({ type: 'command', command: 'proxy %n' }, { ...parameters, originalHost: '%PATH%' }),
			() => createSSHProxySpawnSpec({ type: 'command', command: 'proxy %r' }, { ...parameters, username: 'alice\nwhoami' }),
			() => createSSHProxySpawnSpec({ type: 'command', command: 'proxy %p' }, { ...parameters, port: 0 }),
		];

		assert.deepStrictEqual(failures.map(run => {
			try {
				run();
				return false;
			} catch {
				return true;
			}
		}), [true, true, true, true, true, true, true]);
	});

	test('builds single and chained ProxyJump commands without a shell', () => {
		const parameters = { host: 'internal.example', originalHost: 'work', port: 2222, username: 'alice' };
		assert.deepStrictEqual({
			single: createSSHProxySpawnSpec({ type: 'jump', proxyJump: 'jump.example' }, parameters),
			chained: createSSHProxySpawnSpec({ type: 'jump', proxyJump: 'alice@first:2200,[2001:db8::1]:2201' }, parameters),
			ipv6Target: createSSHProxySpawnSpec(
				{ type: 'jump', proxyJump: 'jump.example' },
				{ ...parameters, host: '2001:db8::2' },
			),
		}, {
			single: {
				command: 'ssh',
				args: ['-W', 'internal.example:2222', '--', 'jump.example'],
				shell: false,
			},
			chained: {
				command: 'ssh',
				args: ['-J', 'alice@first:2200', '-W', 'internal.example:2222', '--', '[2001:db8::1]:2201'],
				shell: false,
			},
			ipv6Target: {
				command: 'ssh',
				args: ['-W', '[2001:db8::2]:2222', '--', 'jump.example'],
				shell: false,
			},
		});
	});

	test('rejects invalid ProxyJump hosts', () => {
		const parameters = { host: 'internal.example', originalHost: 'work', port: 22, username: 'alice' };
		const values = ['', '-oBatchMode=no', 'user@-oBatchMode=no', 'first,,last', 'jump:not-a-port', 'unbracketed:ipv6:host'];
		assert.deepStrictEqual(values.map(proxyJump => {
			try {
				createSSHProxySpawnSpec({ type: 'jump', proxyJump }, parameters);
				return false;
			} catch {
				return true;
			}
		}), [true, true, true, true, true, true]);
	});

	test('rejects unsafe SSH config hosts', () => {
		const hosts = ['work', 'user@host', '-oProxyCommand=whoami', 'host;whoami', 'host name', 'host\nname'];
		assert.deepStrictEqual(hosts.map(host => {
			try {
				validateSSHConfigHost(host);
				return true;
			} catch {
				return false;
			}
		}), [true, true, false, false, false, false]);
	});

	test('resolves OpenSSH only from trusted absolute candidates', () => {
		assert.deepStrictEqual({
			posix: getSSHExecutableCandidates('darwin', '/usr/local/bin:relative::/usr/bin'),
			windows: getSSHExecutableCandidates(
				'win32',
				String.raw`C:\Tools;relative;.;D:\OpenSSH`,
				String.raw`C:\Windows`,
			),
		}, {
			posix: ['/usr/local/bin/ssh', '/usr/bin/ssh'],
			windows: [
				String.raw`C:\Windows\System32\OpenSSH\ssh.exe`,
				String.raw`C:\Tools\ssh.exe`,
				String.raw`D:\OpenSSH\ssh.exe`,
			],
		});
	});
});
