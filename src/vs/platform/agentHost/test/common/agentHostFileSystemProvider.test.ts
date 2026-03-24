/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentHostRemotePath, agentHostUri } from '../../common/agentHostFileSystemProvider.js';
import { AGENT_HOST_SCHEME, agentHostAuthority, fromAgentHostUri, toAgentHostUri } from '../../common/agentHostUri.js';

suite('AgentHostFileSystemProvider - URI helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('agentHostUri builds correct URI', () => {
		const uri = agentHostUri('localhost', '/home/user/project');
		assert.strictEqual(uri.scheme, AGENT_HOST_SCHEME);
		assert.strictEqual(uri.authority, 'localhost');
		// path encodes file scheme: /file//home/user/project
		assert.ok(uri.path.includes('/home/user/project'));
	});

	test('agentHostRemotePath extracts the original path', () => {
		const uri = agentHostUri('host', '/some/path');
		assert.strictEqual(agentHostRemotePath(uri), '/some/path');
	});

	test('agentHostRemotePath round-trips with agentHostUri', () => {
		const original = '/home/user/project';
		const uri = agentHostUri('host', original);
		assert.strictEqual(agentHostRemotePath(uri), original);
	});
});

suite('AgentHostAuthority - encoding', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('purely alphanumeric address is returned as-is', () => {
		assert.strictEqual(agentHostAuthority('localhost'), 'localhost');
	});

	test('normal host:port address uses human-readable encoding', () => {
		assert.strictEqual(agentHostAuthority('localhost:8081'), 'localhost__8081');
		assert.strictEqual(agentHostAuthority('192.168.1.1:8080'), '192.168.1.1__8080');
		assert.strictEqual(agentHostAuthority('my-host:9090'), 'my-host__9090');
		assert.strictEqual(agentHostAuthority('host.name:80'), 'host.name__80');
	});

	test('address with underscore falls through to base64', () => {
		const authority = agentHostAuthority('host_name:8080');
		assert.ok(authority.startsWith('b64-'), `expected base64 for underscore address, got: ${authority}`);
	});

	test('address with exotic characters is base64-encoded', () => {
		assert.ok(agentHostAuthority('user@host:8080').startsWith('b64-'));
		assert.ok(agentHostAuthority('host with spaces').startsWith('b64-'));
		assert.ok(agentHostAuthority('http://myhost:3000').startsWith('b64-'));
	});

	test('ws:// prefix is normalized so authority matches bare address', () => {
		assert.strictEqual(agentHostAuthority('ws://127.0.0.1:8080'), agentHostAuthority('127.0.0.1:8080'));
		assert.strictEqual(agentHostAuthority('ws://localhost:9090'), agentHostAuthority('localhost:9090'));
	});

	test('different addresses produce different authorities', () => {
		const cases = ['localhost:8080', 'localhost:8081', '192.168.1.1:8080', 'host-name:80', 'host.name:80', 'host_name:80', 'user@host:8080'];
		const results = cases.map(agentHostAuthority);
		const unique = new Set(results);
		assert.strictEqual(unique.size, cases.length, 'all authorities must be unique');
	});

	test('authority is valid in a URI authority position', () => {
		const addresses = ['localhost', 'localhost:8081', 'user@host:8080', 'host with spaces', '192.168.1.1:9090'];
		for (const address of addresses) {
			const authority = agentHostAuthority(address);
			const uri = URI.from({ scheme: AGENT_HOST_SCHEME, authority, path: '/test' });
			assert.strictEqual(uri.authority, authority, `authority for '${address}' must round-trip through URI`);
		}
	});

	test('authority is valid in a URI scheme position', () => {
		const addresses = ['localhost', 'localhost:8081', 'user@host:8080', 'host with spaces'];
		for (const address of addresses) {
			const authority = agentHostAuthority(address);
			const scheme = `remote-${authority}-copilot`;
			const uri = URI.from({ scheme, path: '/test' });
			assert.strictEqual(uri.scheme, scheme, `scheme for '${address}' must round-trip through URI`);
		}
	});
});

suite('toAgentHostUri / fromAgentHostUri', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips a file URI', () => {
		const original = URI.file('/home/user/project/file.ts');
		const wrapped = toAgentHostUri(original, 'my-server');
		assert.strictEqual(wrapped.scheme, AGENT_HOST_SCHEME);
		assert.strictEqual(wrapped.authority, 'my-server');

		const unwrapped = fromAgentHostUri(wrapped);
		assert.strictEqual(unwrapped.scheme, 'file');
		assert.strictEqual(unwrapped.path, original.path);
	});

	test('round-trips a URI with authority', () => {
		const original = URI.from({ scheme: 'agenthost-content', authority: 'session1', path: '/snap/before' });
		const wrapped = toAgentHostUri(original, 'remote-host');
		const unwrapped = fromAgentHostUri(wrapped);
		assert.strictEqual(unwrapped.scheme, 'agenthost-content');
		assert.strictEqual(unwrapped.authority, 'session1');
		assert.strictEqual(unwrapped.path, '/snap/before');
	});

	test('local authority returns original URI unchanged', () => {
		const original = URI.file('/workspace/test.ts');
		const result = toAgentHostUri(original, 'local');
		assert.strictEqual(result.toString(), original.toString());
	});

	test('fromAgentHostUri handles malformed path gracefully', () => {
		const uri = URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'host', path: '/file' });
		const result = fromAgentHostUri(uri);
		// Should not throw — falls back to extracting scheme only
		assert.strictEqual(result.scheme, 'file');
	});
});
