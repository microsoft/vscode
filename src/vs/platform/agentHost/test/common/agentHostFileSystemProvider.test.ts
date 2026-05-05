/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileSystemProviderErrorCode, FileType, toFileSystemProviderErrorCode } from '../../../files/common/files.js';
import { AgentHostFileSystemProvider, agentHostRemotePath, agentHostUri, type IRemoteFilesystemConnection } from '../../common/agentHostFileSystemProvider.js';
import { AGENT_HOST_LABEL_FORMATTER, AGENT_HOST_SCHEME, agentHostAuthority, fromAgentHostUri, toAgentHostUri } from '../../common/agentHostUri.js';
import { ContentEncoding, type ResourceListResult, type ResourceReadResult, type ResourceRequestParams, type ResourceRequestResult } from '../../common/state/protocol/commands.js';
import { AhpErrorCodes } from '../../common/state/protocol/errors.js';
import { ProtocolError } from '../../common/state/sessionProtocol.js';

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
	function stripPath(path: string, segments: number): string {
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

		const stripped = stripPath(encodedUri.path, AGENT_HOST_LABEL_FORMATTER.formatting.stripPathSegments!);
		assert.strictEqual(stripped, originalPath);
	});

	test('stripPathSegments matches URI encoding with authority', () => {
		const originalUri = URI.from({ scheme: 'agenthost-content', authority: 'myhost', path: '/snap/before' });
		const encodedUri = toAgentHostUri(originalUri, 'remote-host');

		const stripped = stripPath(encodedUri.path, AGENT_HOST_LABEL_FORMATTER.formatting.stripPathSegments!);
		assert.strictEqual(stripped, '/snap/before');
	});
});

suite('AgentHostFileSystemProvider - synthetic content schemes', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Stub connection that records the URIs it's asked about and returns
	 * canned data, so we can assert on the URIs the provider passes through.
	 */
	class StubConnection implements IRemoteFilesystemConnection {
		readonly readCalls: URI[] = [];
		readonly listCalls: URI[] = [];
		readResult: ResourceReadResult = { data: 'stub-content', encoding: ContentEncoding.Utf8, contentType: 'text/plain' };

		async resourceRead(uri: URI): Promise<ResourceReadResult> {
			this.readCalls.push(uri);
			return this.readResult;
		}
		async resourceList(uri: URI): Promise<ResourceListResult> {
			this.listCalls.push(uri);
			return { entries: [] };
		}
		async resourceWrite(): Promise<{}> { return {}; }
		async resourceDelete(): Promise<{}> { return {}; }
		async resourceMove(): Promise<{}> { return {}; }
	}

	function setup() {
		const provider = disposables.add(new AgentHostFileSystemProvider());
		const connection = new StubConnection();
		disposables.add(provider.registerAuthority('local', connection));
		return { provider, connection };
	}

	// Regression: AHPFileSystemProvider.stat() used to fall through to
	// _listDirectory(parent) for any URI whose decoded scheme wasn't
	// session-db, which fails with "Directory not found" for synthetic
	// content URIs that have no real parent directory. The diff editor
	// stats every URI before reading it, so this broke "open diff of a
	// modified file" entirely. The fix is the scheme allowlist in stat().

	test('stat returns File for git-blob: URIs without listing the parent', async () => {
		const { provider, connection } = setup();
		const inner = URI.from({ scheme: 'git-blob', authority: 'sess1', path: '/sha/encoded/file.ts' });
		const wrapped = toAgentHostUri(inner, 'local');

		const stat = await provider.stat(wrapped);

		assert.strictEqual(stat.type, FileType.File);
		assert.deepStrictEqual(connection.listCalls, [], 'stat must not list a synthetic parent directory');
	});

	test('stat returns File for session-db: URIs (parity with git-blob)', async () => {
		const { provider, connection } = setup();
		const inner = URI.from({ scheme: 'session-db', authority: 'sess1', path: '/snap/some-blob' });
		const wrapped = toAgentHostUri(inner, 'local');

		const stat = await provider.stat(wrapped);

		assert.strictEqual(stat.type, FileType.File);
		assert.deepStrictEqual(connection.listCalls, []);
	});

	test('stat still lists parent for ordinary file: URIs', async () => {
		// Use a non-local authority so the URI actually goes through the
		// agent-host wrapping (toAgentHostUri short-circuits 'local'
		// + file:// to return the URI unchanged).
		const provider = disposables.add(new AgentHostFileSystemProvider());
		const connection = new StubConnection();
		disposables.add(provider.registerAuthority('remote', connection));
		const wrapped = agentHostUri('remote', '/some/file.ts');

		try {
			await provider.stat(wrapped);
		} catch {
			// Either FileNotFound or EntryNotFound is fine — we only
			// care that the provider tried to list the parent (rather
			// than treating this as a synthetic content URI).
		}
		assert.strictEqual(connection.listCalls.length, 1);
	});

	test('readFile passes the decoded synthetic URI through to the connection', async () => {
		const { provider, connection } = setup();
		const inner = URI.from({ scheme: 'git-blob', authority: 'sess1', path: '/sha/encoded/file.ts' });
		const wrapped = toAgentHostUri(inner, 'local');

		const bytes = await provider.readFile(wrapped);

		assert.strictEqual(VSBuffer.wrap(bytes).toString(), 'stub-content');
		assert.deepStrictEqual(connection.readCalls.map(u => u.toString()), [inner.toString()]);
	});

	test('full stat-then-read round-trip mirrors the diff editor flow', async () => {
		// This is the exact sequence the workbench's TextFileEditorModel
		// goes through when DiffEditorInput.createModel resolves: stat
		// the URI, then read the file. Pre-fix this combo failed at the
		// stat step before readFile was even called.
		const { provider } = setup();
		const inner = URI.from({ scheme: 'git-blob', authority: 'sess1', path: '/sha/encoded/file.ts' });
		const wrapped = toAgentHostUri(inner, 'local');

		const stat = await provider.stat(wrapped);
		assert.strictEqual(stat.type, FileType.File);
		const bytes = await provider.readFile(wrapped);
		assert.strictEqual(VSBuffer.wrap(bytes).toString(), 'stub-content');
	});
});

suite('AgentHostFileSystemProvider - permission errors and requestResourceAccess', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Stub connection whose individual operations can be configured to throw.
	 * Records every `resourceRequest` call so tests can assert URI translation
	 * and the read/write flags forwarded to the receiver.
	 */
	class ConfigurableConnection implements IRemoteFilesystemConnection {
		readError: unknown | undefined;
		writeError: unknown | undefined;
		listError: unknown | undefined;
		deleteError: unknown | undefined;
		moveError: unknown | undefined;
		requestError: unknown | undefined;
		readonly requestCalls: ResourceRequestParams[] = [];
		hasResourceRequest = true;

		async resourceRead(): Promise<ResourceReadResult> {
			if (this.readError) { throw this.readError; }
			return { data: '', encoding: ContentEncoding.Utf8 };
		}
		async resourceList(): Promise<ResourceListResult> {
			if (this.listError) { throw this.listError; }
			return { entries: [] };
		}
		async resourceWrite(): Promise<{}> {
			if (this.writeError) { throw this.writeError; }
			return {};
		}
		async resourceDelete(): Promise<{}> {
			if (this.deleteError) { throw this.deleteError; }
			return {};
		}
		async resourceMove(): Promise<{}> {
			if (this.moveError) { throw this.moveError; }
			return {};
		}
		// Defined as a property so we can `delete` it to simulate a connection
		// without resourceRequest support (e.g. older protocol clients).
		resourceRequest? = async (params: ResourceRequestParams): Promise<ResourceRequestResult> => {
			this.requestCalls.push(params);
			if (this.requestError) { throw this.requestError; }
			return {};
		};
	}

	function setup(opts: { withResourceRequest?: boolean } = {}) {
		const provider = disposables.add(new AgentHostFileSystemProvider());
		const connection = new ConfigurableConnection();
		if (opts.withResourceRequest === false) {
			connection.hasResourceRequest = false;
			delete connection.resourceRequest;
		}
		// Use a non-`local` authority so file URIs actually go through the
		// AHP wrapping; toAgentHostUri short-circuits 'local'+file:// to
		// return the URI unchanged, which would bypass the provider entirely.
		disposables.add(provider.registerAuthority('remote', connection));
		return { provider, connection };
	}

	function permissionDenied(uri: string): ProtocolError {
		return new ProtocolError(AhpErrorCodes.PermissionDenied, 'denied', { request: { uri, read: true } });
	}

	test('readFile maps PermissionDenied to NoPermissions (not FileNotFound)', async () => {
		const { provider, connection } = setup();
		const wrapped = agentHostUri('remote', '/secret');
		connection.readError = permissionDenied(wrapped.toString());

		try {
			await provider.readFile(wrapped);
			assert.fail('expected readFile to reject');
		} catch (err) {
			assert.strictEqual(
				toFileSystemProviderErrorCode(err instanceof Error ? err : undefined),
				FileSystemProviderErrorCode.NoPermissions,
			);
		}
	});

	test('readFile still maps generic errors to FileNotFound', async () => {
		const { provider, connection } = setup();
		const wrapped = agentHostUri('remote', '/missing');
		connection.readError = new Error('boom');

		try {
			await provider.readFile(wrapped);
			assert.fail('expected readFile to reject');
		} catch (err) {
			assert.strictEqual(
				toFileSystemProviderErrorCode(err instanceof Error ? err : undefined),
				FileSystemProviderErrorCode.FileNotFound,
			);
		}
	});

	test('writeFile / delete / rename / readdir all surface NoPermissions on PermissionDenied', async () => {
		const { provider, connection } = setup();
		const wrapped = agentHostUri('remote', '/no-write');
		const denied = permissionDenied(wrapped.toString());
		connection.writeError = denied;
		connection.deleteError = denied;
		connection.moveError = denied;
		connection.listError = denied;

		const codes: (FileSystemProviderErrorCode | undefined)[] = [];
		const collect = async (op: () => Promise<unknown>) => {
			try {
				await op();
			} catch (err) {
				codes.push(toFileSystemProviderErrorCode(err instanceof Error ? err : undefined));
			}
		};
		await collect(() => provider.writeFile(wrapped, new Uint8Array(), { create: true, overwrite: true, unlock: false, atomic: false }));
		await collect(() => provider.delete(wrapped, { recursive: false, useTrash: false, atomic: false }));
		await collect(() => provider.rename(wrapped, agentHostUri('remote', '/dst'), { overwrite: true }));
		await collect(() => provider.readdir(wrapped));

		assert.deepStrictEqual(codes, [
			FileSystemProviderErrorCode.NoPermissions,
			FileSystemProviderErrorCode.NoPermissions,
			FileSystemProviderErrorCode.NoPermissions,
			FileSystemProviderErrorCode.NoPermissions,
		]);
	});

	test('requestResourceAccess forwards the decoded URI and access flags', async () => {
		const { provider, connection } = setup();
		const wrapped = agentHostUri('remote', '/etc/foo');

		await provider.requestResourceAccess(wrapped, { read: true, write: true });

		assert.deepStrictEqual(connection.requestCalls, [
			{ uri: URI.file('/etc/foo').toString(), read: true, write: true },
		]);
	});

	test('requestResourceAccess throws Unavailable when the connection has no resourceRequest', async () => {
		const { provider } = setup({ withResourceRequest: false });
		const wrapped = agentHostUri('remote', '/etc/foo');

		try {
			await provider.requestResourceAccess(wrapped, { read: true });
			assert.fail('expected requestResourceAccess to reject');
		} catch (err) {
			assert.strictEqual(
				toFileSystemProviderErrorCode(err instanceof Error ? err : undefined),
				FileSystemProviderErrorCode.Unavailable,
			);
		}
	});

	test('requestResourceAccess maps PermissionDenied to NoPermissions', async () => {
		const { provider, connection } = setup();
		const wrapped = agentHostUri('remote', '/etc/foo');
		connection.requestError = permissionDenied(wrapped.toString());

		try {
			await provider.requestResourceAccess(wrapped, { read: true });
			assert.fail('expected requestResourceAccess to reject');
		} catch (err) {
			assert.strictEqual(
				toFileSystemProviderErrorCode(err instanceof Error ? err : undefined),
				FileSystemProviderErrorCode.NoPermissions,
			);
		}
	});
});
