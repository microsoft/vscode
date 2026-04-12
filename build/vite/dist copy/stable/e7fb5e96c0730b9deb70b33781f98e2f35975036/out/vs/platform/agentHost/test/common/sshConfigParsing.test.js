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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3NoQ29uZmlnUGFyc2luZy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vYWdlbnRIb3N0L3Rlc3QvY29tbW9uL3NzaENvbmZpZ1BhcnNpbmcudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLGVBQWUsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRTlGLEtBQUssQ0FBQyxvQkFBb0IsRUFBRSxHQUFHLEVBQUU7SUFFaEMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxLQUFLLENBQUMsMkJBQTJCLEVBQUUsR0FBRyxFQUFFO1FBRXZDLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7WUFDekMsTUFBTSxNQUFNLEdBQUc7Z0JBQ2QsZUFBZTtnQkFDZixvQkFBb0I7Z0JBQ3BCLGFBQWE7YUFDYixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUViLE1BQU0sQ0FBQyxlQUFlLENBQUMseUJBQXlCLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQ3pFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGlEQUFpRCxFQUFFLEdBQUcsRUFBRTtZQUM1RCxNQUFNLE1BQU0sR0FBRyw4QkFBOEIsQ0FBQztZQUM5QyxNQUFNLENBQUMsZUFBZSxDQUFDLHlCQUF5QixDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO1FBQzlGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEdBQUcsRUFBRTtZQUN6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