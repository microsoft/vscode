/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { expandSSHProxyCommand, SSHProxyCommand } from '../../node/sshProxyCommand.js';
import { shellEscape } from '../../node/sshRemoteAgentHostHelpers.js';

suite('SSH ProxyCommand', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

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

	(isWindows ? test.skip : test)('relays stdio and closes the proxy process on disposal', async () => {
		const command = `ELECTRON_RUN_AS_NODE=1 ${shellEscape(process.execPath)} -e ${shellEscape('process.stdout.write("ready"); process.stdin.pipe(process.stdout)')}`;
		const proxy = store.add(new SSHProxyCommand(command, store.add(new NullLogService())));
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

	(isWindows ? test.skip : test)('reports proxy failures with stderr', async () => {
		const proxy = store.add(new SSHProxyCommand('printf "proxy failed" >&2; exit 42', store.add(new NullLogService())));
		const error = await new Promise<Error>(resolve => proxy.stream.once('error', resolve));
		assert.match(error.message, /SSH ProxyCommand exited \(42\): proxy failed/);
	});
});
