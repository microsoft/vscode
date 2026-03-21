/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_FS_SCHEME, agentHostRemotePath, agentHostUri } from '../../browser/agentHostFileSystemProvider.js';
import { agentHostAuthority } from '../../browser/remoteAgentHost.contribution.js';

suite('AgentHostFileSystemProvider - URI helpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('agentHostUri builds correct URI', () => {
		const uri = agentHostUri('localhost:8081', '/home/user/project');
		assert.strictEqual(uri.scheme, AGENT_HOST_FS_SCHEME);
		assert.strictEqual(uri.authority, 'localhost:8081');
		assert.strictEqual(uri.path, '/home/user/project');
	});

	test('agentHostUri defaults to root path', () => {
		const uri = agentHostUri('localhost:8081', '');
		assert.strictEqual(uri.path, '/');
	});

	test('agentHostUri normalizes path without leading slash', () => {
		const uri = agentHostUri('localhost:8081', 'home/user/project');
		assert.strictEqual(uri.scheme, AGENT_HOST_FS_SCHEME);
		assert.strictEqual(uri.authority, 'localhost:8081');
		assert.strictEqual(uri.path, '/home/user/project');
	});

	test('agentHostRemotePath extracts the path component', () => {
		const uri = URI.from({ scheme: AGENT_HOST_FS_SCHEME, authority: 'host', path: '/some/path' });
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
			const uri = URI.from({ scheme: AGENT_HOST_FS_SCHEME, authority, path: '/test' });
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
