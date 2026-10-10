/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { isWindows } from '../../../../base/common/platform.js';
import { killTree } from '../../../../base/node/processes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { expandSSHProxyCommand, SSHProxyCommand } from '../../node/sshProxyCommand.js';
import { shellEscape } from '../../node/sshRemoteAgentHostHelpers.js';

suite('SSH ProxyCommand', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const proxyScript = 'process.stdout.write(\'ready\'); process.stdin.pipe(process.stdout); setInterval(() => {}, 1000)';
	const proxyCommand = isWindows
		? `set "ELECTRON_RUN_AS_NODE=1" && "${process.execPath}" -e "${proxyScript}"`
		: `ELECTRON_RUN_AS_NODE=1 ${shellEscape(process.execPath)} -e ${shellEscape(proxyScript)}`;

	test('expands the original alias separately from the resolved hostname', () => {
		assert.deepStrictEqual([
			expandSSHProxyCommand('"/opt/docker tools/sbx" ssh proxy %n', 'resolved.example', 'sandbox.sbx', 2222, 'user', false),
			expandSSHProxyCommand('proxy %h %p %r %%', 'resolved.example', 'sandbox.sbx', 2222, 'user', false),
			expandSSHProxyCommand('proxy "%h" %p "%r"', 'resolved.example', 'sandbox.sbx', 2222, 'Test User', true),
		], [
			'"/opt/docker tools/sbx" ssh proxy \'sandbox.sbx\'',
			'proxy \'resolved.example\' \'2222\' \'user\' %',
			'proxy "resolved.example" "2222" "Test User"',
		]);
	});

	test('rejects unsupported tokens and unsafe Windows substitutions', () => {
		assert.throws(() => expandSSHProxyCommand('proxy %x', 'host', 'alias', 22, 'user'), /Unsupported SSH ProxyCommand token/);
		assert.throws(() => expandSSHProxyCommand('proxy %', 'host', 'alias', 22, 'user'), /Unsupported SSH ProxyCommand token/);
		assert.throws(() => expandSSHProxyCommand('proxy %h', 'host&command', 'alias', 22, 'user', true), /cannot safely expand/);
	});

	(isWindows ? test.skip : test)('preserves substitutions as data in unquoted, single-quoted, and double-quoted shell contexts', async () => {
		const user = 'user \' " $HOME $(printf injected) `printf injected` \\ tail';
		const values: string[] = [];
		for (const placeholder of ['%r', '\'%r\'', '"%r"']) {
			const command = expandSSHProxyCommand(`printf '%%s' ${placeholder}`, 'host', 'alias', 22, user, false);
			const result = await promisify(execFile)('/bin/sh', ['-c', command]);
			values.push(result.stdout);
		}
		assert.deepStrictEqual(values, [user, user, user]);
	});

	test('relays stdio and closes the proxy process on disposal', async () => {
		const proxy = store.add(new SSHProxyCommand(proxyCommand, store.add(new NullLogService())));
		const errors: Error[] = [];
		proxy.stream.on('error', error => errors.push(error));
		const read = () => new Promise<string>(resolve => proxy.stream.once('data', (data: Buffer) => resolve(data.toString())));
		const ready = await read();
		const echoed = read();
		proxy.stream.write('ssh bytes');
		const data = await echoed;
		const closed = new Promise<void>(resolve => proxy.stream.once('close', resolve));
		proxy.dispose();
		await closed;
		assert.deepStrictEqual({ ready, data, errors }, { ready: 'ready', data: 'ssh bytes', errors: [] });
	});

	test('uses forceful process-tree termination only on Windows', async () => {
		const forcefulModes: (boolean | undefined)[] = [];
		const errors: Error[] = [];
		for (const windows of [false, true]) {
			let termination: Promise<void> | undefined;
			const proxy = store.add(new SSHProxyCommand(proxyCommand, store.add(new NullLogService()), windows, (pid, forceful) => {
				forcefulModes.push(forceful);
				termination = killTree(pid, isWindows);
				return termination;
			}));
			proxy.stream.on('error', error => errors.push(error));
			await new Promise<void>(resolve => proxy.stream.once('data', () => resolve()));
			const closed = new Promise<void>(resolve => proxy.stream.once('close', resolve));
			proxy.dispose();
			assert.ok(termination, 'Expected disposal to terminate the proxy process tree');
			await Promise.all([closed, termination]);
		}
		assert.deepStrictEqual({ forcefulModes, errors }, { forcefulModes: [false, true], errors: [] });
	});

	(isWindows ? test.skip : test)('reports proxy failures with stderr', async () => {
		const proxy = store.add(new SSHProxyCommand('printf "proxy failed" >&2; exit 42', store.add(new NullLogService())));
		const error = await new Promise<Error>(resolve => proxy.stream.once('error', resolve));
		assert.match(error.message, /SSH ProxyCommand exited \(42\): proxy failed/);
	});
});
