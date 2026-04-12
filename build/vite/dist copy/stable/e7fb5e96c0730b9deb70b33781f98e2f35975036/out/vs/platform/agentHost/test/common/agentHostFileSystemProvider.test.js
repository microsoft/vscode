/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentHostRemotePath, agentHostUri } from '../../common/agentHostFileSystemProvider.js';
import { AGENT_HOST_LABEL_FORMATTER, AGENT_HOST_SCHEME, agentHostAuthority, fromAgentHostUri, toAgentHostUri } from '../../common/agentHostUri.js';
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
    test('agentHostUri for root path produces valid encoded URI', () => {
        const authority = agentHostAuthority('localhost:8089');
        const uri = agentHostUri(authority, '/');
        assert.strictEqual(uri.scheme, AGENT_HOST_SCHEME);
        assert.strictEqual(uri.authority, authority);
        // The decoded path should be root
        assert.strictEqual(fromAgentHostUri(uri).path, '/');
    });
    test('fromAgentHostUri handles malformed path gracefully', () => {
        const uri = URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'host', path: '/file' });
        const result = fromAgentHostUri(uri);
        // Should not throw - falls back to extracting scheme only
        assert.strictEqual(result.scheme, 'file');
    });
});
suite('AGENT_HOST_LABEL_FORMATTER', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    /**
     * Replicates the stripPathSegments logic from the label service to
     * verify that the formatter's configuration is consistent with the
     * URI encoding.
     */
    function stripPath(path, segments) {
        let pos = 0;
        for (let i = 0; i < segments; i++) {
            const next = path.indexOf('/', pos + 1);
            if (next === -1) {
                break;
            }
            pos = next;
        }
        return path.substring(pos);
    }
    test('stripPathSegments matches URI encoding for file URIs', () => {
        const authority = agentHostAuthority('localhost:8089');
        const originalPath = '/Users/roblou/code/vscode';
        const encodedUri = agentHostUri(authority, originalPath);
        const stripped = stripPath(encodedUri.path, AGENT_HOST_LABEL_FORMATTER.formatting.stripPathSegments);
        assert.strictEqual(stripped, originalPath);
    });
    test('stripPathSegments matches URI encoding with authority', () => {
        const originalUri = URI.from({ scheme: 'agenthost-content', authority: 'myhost', path: '/snap/before' });
        const encodedUri = toAgentHostUri(originalUri, 'remote-host');
        const stripped = stripPath(encodedUri.path, AGENT_HOST_LABEL_FORMATTER.formatting.stripPathSegments);
        assert.strictEqual(stripped, '/snap/before');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9hZ2VudEhvc3QvdGVzdC9jb21tb24vYWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDaEcsT0FBTyxFQUFFLDBCQUEwQixFQUFFLGlCQUFpQixFQUFFLGtCQUFrQixFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBRW5KLEtBQUssQ0FBQywyQ0FBMkMsRUFBRSxHQUFHLEVBQUU7SUFFdkQsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsaUNBQWlDLEVBQUUsR0FBRyxFQUFFO1FBQzVDLE1BQU0sR0FBRyxHQUFHLFlBQVksQ0FBQyxXQUFXLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztRQUM1RCxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUNsRCxNQUFNLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDL0MscURBQXFEO1FBQ3JELE1BQU0sQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO0lBQ3BELENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFB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