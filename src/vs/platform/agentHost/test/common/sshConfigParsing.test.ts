/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseSSHConfigHostEntries, parseSSHGOutput } from '../../common/sshConfigParsing.js';

suite('SSH Config Parsing', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('parseSSHConfigHostEntries', () => {

		test('extracts simple host entries', () => {
			const config = [
				'Host myserver',
				'	HostName 10.0.0.1',
				'	User admin',
			].join('\n');

			assert.deepStrictEqual(parseSSHConfigHostEntries(config), ['myserver']);
		});

		test('extracts multiple hosts from a single Host line', () => {
			const config = 'Host server1 server2 server3';
			assert.deepStrictEqual(parseSSHConfigHostEntries(config), ['server1', 'server2', 'server3']);
		});

		test('extracts hosts from multiple Host directives', () => {
			const config = [
				'Host work',
				'	HostName work.example.com',
				'',
				'Host personal',
				'	HostName home.example.com',
			].join('\n');

			assert.deepStrictEqual(parseSSHConfigHostEntries(config), ['work', 'personal']);
		});

		test('skips wildcard hosts', () => {
			const config = [
				'Host *',
				'	ForwardAgent yes',
				'',
				'Host myserver',
				'	HostName 10.0.0.1',
				'',
				'Host *.example.com',
				'	User admin',
			].join('\n');

			assert.deepStrictEqual(parseSSHConfigHostEntries(config), ['myserver']);
		});

		test('skips negation patterns', () => {
			const config = 'Host !internal myserver';
			assert.deepStrictEqual(parseSSHConfigHostEntries(config), ['myserver']);
		});

		test('skips question mark wildcards', () => {
			const config = 'Host server? myserver';
			assert.deepStrictEqual(parseSSHConfigHostEntries(config), ['myserver']);
		});

		test('skips comment lines', () => {
			const config = [
				'# This is a comment',
				'Host myserver',
				'	# Another comment',
				'	HostName 10.0.0.1',
			].join('\n');

			assert.deepStrictEqual(parseSSHConfigHostEntries(config), ['myserver']);
		});

		test('strips inline comments from Host values', () => {
			const config = 'Host myserver # my favorite server';
			assert.deepStrictEqual(parseSSHConfigHostEntries(config), ['myserver']);
		});

		test('handles empty content', () => {
			assert.deepStrictEqual(parseSSHConfigHostEntries(''), []);
		});

		test('handles content with only comments and blanks', () => {
			const config = [
				'# comment',
				'',
				'  # indented comment',
				'',
			].join('\n');

			assert.deepStrictEqual(parseSSHConfigHostEntries(config), []);
		});

		test('is case-insensitive for Host keyword', () => {
			const config = [
				'host lower',
				'HOST upper',
				'Host mixed',
			].join('\n');

			assert.deepStrictEqual(parseSSHConfigHostEntries(config), ['lower', 'upper', 'mixed']);
		});

		test('ignores non-Host directives', () => {
			const config = [
				'Host myserver',
				'	HostName 10.0.0.1',
				'	User admin',
				'	Port 2222',
				'	IdentityFile ~/.ssh/mykey',
				'	ForwardAgent yes',
			].join('\n');

			assert.deepStrictEqual(parseSSHConfigHostEntries(config), ['myserver']);
		});
	});

	suite('parseSSHGOutput', () => {

		test('parses standard ssh -G output', () => {
			const output = [
				'hostname 10.0.0.1',
				'user admin',
				'port 22',
				'identityfile ~/.ssh/id_rsa',
				'identityfile ~/.ssh/id_ed25519',
				'forwardagent no',
			].join('\n');

			assert.deepStrictEqual(parseSSHGOutput(output), {
				hostname: '10.0.0.1',
				user: 'admin',
				port: 22,
				identityFile: ['~/.ssh/id_rsa', '~/.ssh/id_ed25519'],
				forwardAgent: false,
			});
		});

		test('parses forwardagent yes', () => {
			const output = [
				'hostname example.com',
				'user root',
				'port 22',
				'forwardagent yes',
			].join('\n');

			const result = parseSSHGOutput(output);
			assert.strictEqual(result.forwardAgent, true);
		});

		test('parses non-standard port', () => {
			const output = [
				'hostname example.com',
				'user deploy',
				'port 2222',
			].join('\n');

			const result = parseSSHGOutput(output);
			assert.strictEqual(result.port, 2222);
		});

		test('handles missing user', () => {
			const output = [
				'hostname example.com',
				'port 22',
			].join('\n');

			const result = parseSSHGOutput(output);
			assert.strictEqual(result.user, undefined);
		});

		test('handles empty user', () => {
			const output = [
				'hostname example.com',
				'user ',
				'port 22',
			].join('\n');

			const result = parseSSHGOutput(output);
			assert.strictEqual(result.user, undefined);
		});

		test('defaults port to 22 when missing', () => {
			const output = 'hostname example.com\nuser root';
			const result = parseSSHGOutput(output);
			assert.strictEqual(result.port, 22);
		});

		test('collects multiple identity files', () => {
			const output = [
				'hostname example.com',
				'port 22',
				'identityfile ~/.ssh/id_rsa',
				'identityfile ~/.ssh/work_key',
				'identityfile ~/.ssh/id_ed25519',
			].join('\n');

			assert.deepStrictEqual(parseSSHGOutput(output).identityFile, [
				'~/.ssh/id_rsa',
				'~/.ssh/work_key',
				'~/.ssh/id_ed25519',
			]);
		});

		test('handles empty output', () => {
			assert.deepStrictEqual(parseSSHGOutput(''), {
				hostname: '',
				user: undefined,
				port: 22,
				identityFile: [],
				forwardAgent: false,
			});
		});

		test('handles values with spaces', () => {
			const output = 'hostname my host with spaces\nport 22';
			const result = parseSSHGOutput(output);
			assert.strictEqual(result.hostname, 'my host with spaces');
		});
	});
});
