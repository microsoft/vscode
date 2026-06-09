/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileChangeType, FileSystemProviderErrorCode, FileType, IFileChange, toFileSystemProviderErrorCode } from '../../../files/common/files.js';
import { AgentHostFileSystemProvider, agentHostRemotePath, agentHostUri, type IRemoteFilesystemConnection } from '../../common/agentHostFileSystemProvider.js';
import { AGENT_HOST_LABEL_FORMATTER, AGENT_HOST_SCHEME, agentHostAuthority, fromAgentHostUri, toAgentHostUri } from '../../common/agentHostUri.js';
import { ContentEncoding, ResourceType, type CreateResourceWatchParams, type ResourceCopyParams, type ResourceListResult, type ResourceMkdirParams, type ResourceReadResult, type ResourceRequestParams, type ResourceRequestResult, type ResourceResolveParams, type ResourceResolveResult } from '../../common/state/protocol/commands.js';
import { AhpErrorCodes } from '../../common/state/protocol/errors.js';
import { ProtocolError } from '../../common/state/sessionProtocol.js';
import { ROOT_STATE_URI } from '../../common/state/sessionState.js';

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

	test('round-trips query and fragment for synthetic content URIs', () => {
		const original = URI.from({
			scheme: 'git-blob',
			path: '/src/app.ts',
			query: JSON.stringify({ sessionUri: 'copilot:/abc', sha: 'cafe1234' }),
			fragment: 'L1',
		});

		const wrapped = toAgentHostUri(original, 'remote-host');
		const unwrapped = fromAgentHostUri(wrapped);

		assert.deepStrictEqual({
			wrappedPath: wrapped.path,
			wrappedFragment: wrapped.fragment,
			unwrapped: unwrapped.toString(),
		}, {
			wrappedPath: original.path,
			wrappedFragment: original.fragment,
			unwrapped: original.toString(),
		});
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

	test('fromAgentHostUri falls back to a file URI when metadata is missing', () => {
		const uri = URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'host', path: '/file' });
		const result = fromAgentHostUri(uri);
		// Should not throw - falls back to a file URI using the path verbatim
		assert.strictEqual(result.scheme, 'file');
		assert.strictEqual(result.path, '/file');
	});
});

suite('AGENT_HOST_LABEL_FORMATTER', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('label is the original path verbatim for file URIs', () => {
		const authority = agentHostAuthority('localhost:8089');
		const originalPath = '/Users/roblou/code/vscode';
		const encodedUri = agentHostUri(authority, originalPath);

		assert.strictEqual(AGENT_HOST_LABEL_FORMATTER.formatting.label, '${path}');
		assert.strictEqual(encodedUri.path, originalPath);
	});

	test('label is the original path verbatim for URIs with authority', () => {
		const originalUri = URI.from({ scheme: 'agenthost-content', authority: 'myhost', path: '/snap/before' });
		const encodedUri = toAgentHostUri(originalUri, 'remote-host');

		assert.strictEqual(encodedUri.path, '/snap/before');
	});

	test('label is the original path verbatim for git-blob URIs', () => {
		const originalUri = URI.from({
			scheme: 'git-blob',
			path: '/src/app.ts',
			query: JSON.stringify({ sessionUri: 'copilot:/abc', sha: 'cafe1234' }),
		});
		const encodedUri = toAgentHostUri(originalUri, 'remote-host');

		assert.strictEqual(encodedUri.path, '/src/app.ts');
	});
});

suite('AgentHostFileSystemProvider - authority registrations', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class NamedConnection implements IRemoteFilesystemConnection {
		readonly listCalls: URI[] = [];

		constructor(private readonly name: string) { }

		async resourceList(uri: URI): Promise<ResourceListResult> {
			this.listCalls.push(uri);
			return { entries: [{ name: `${this.name}.txt`, type: 'file' }] };
		}

		async resourceRead(): Promise<ResourceReadResult> { return { data: '', encoding: ContentEncoding.Utf8 }; }
		async resourceWrite(): Promise<{}> { return {}; }
		async resourceCopy(): Promise<{}> { return {}; }
		async resourceDelete(): Promise<{}> { return {}; }
		async resourceMove(): Promise<{}> { return {}; }
		async resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult> {
			const uri = typeof params.uri === 'string' ? URI.parse(params.uri) : URI.revive(params.uri)!;
			return { uri: uri.toString(), type: ResourceType.File };
		}
		async resourceMkdir(): Promise<{}> { return {}; }
	}

	test('disposing a stale registration does not remove a newer registration for the same authority', async () => {
		const provider = disposables.add(new AgentHostFileSystemProvider());
		const first = new NamedConnection('first');
		const second = new NamedConnection('second');
		const firstRegistration = disposables.add(provider.registerAuthority('client', first));
		disposables.add(provider.registerAuthority('client', second));

		firstRegistration.dispose();
		const entries = await provider.readdir(agentHostUri('client', '/workspace'));

		assert.deepStrictEqual({ entries, firstCalls: first.listCalls, secondCalls: second.listCalls.map(uri => uri.toString()) }, {
			entries: [['second.txt', FileType.File]],
			firstCalls: [],
			secondCalls: [URI.file('/workspace').toString()],
		});
	});

	test('disposing the newest registration falls back to the previous one without entering grace', async () => {
		const provider = disposables.add(new AgentHostFileSystemProvider());
		const first = new NamedConnection('first');
		const second = new NamedConnection('second');
		disposables.add(provider.registerAuthority('client', first));
		const secondRegistration = provider.registerAuthority('client', second);

		secondRegistration.dispose();
		const entries = await provider.readdir(agentHostUri('client', '/workspace'));

		assert.deepStrictEqual({ entries, firstCalls: first.listCalls.map(uri => uri.toString()), secondCalls: second.listCalls }, {
			entries: [['first.txt', FileType.File]],
			firstCalls: [URI.file('/workspace').toString()],
			secondCalls: [],
		});
	});

	test('operation issued during reconnect window waits for the replacement registration', async () => {
		const provider = disposables.add(new AgentHostFileSystemProvider(50));
		const first = new NamedConnection('first');
		const second = new NamedConnection('second');

		// Register, then dispose — we're now inside the grace window.
		const firstRegistration = provider.registerAuthority('client', first);
		firstRegistration.dispose();

		// Issue an operation while no connection is bound. It should
		// queue, waiting for a re-registration.
		const pending = provider.readdir(agentHostUri('client', '/workspace'));

		// Reconnect within the grace window.
		disposables.add(provider.registerAuthority('client', second));

		const entries = await pending;
		assert.deepStrictEqual({ entries, firstCalls: first.listCalls, secondCalls: second.listCalls.map(uri => uri.toString()) }, {
			entries: [['second.txt', FileType.File]],
			firstCalls: [],
			secondCalls: [URI.file('/workspace').toString()],
		});
	});

	test('operation issued in the grace window rejects with Unavailable when no reconnect arrives', async () => {
		const provider = disposables.add(new AgentHostFileSystemProvider(20));
		const first = new NamedConnection('first');

		const firstRegistration = provider.registerAuthority('client', first);
		firstRegistration.dispose();

		const pending = provider.readdir(agentHostUri('client', '/workspace'));

		let caught: unknown;
		try {
			await pending;
		} catch (err) {
			caught = err;
		}
		assert.ok(caught instanceof Error, 'expected an error');
		assert.strictEqual(toFileSystemProviderErrorCode(caught as Error), FileSystemProviderErrorCode.Unavailable);
	});

	test('operation rejects immediately when no authority was ever registered', async () => {
		const provider = disposables.add(new AgentHostFileSystemProvider(50));

		let caught: unknown;
		try {
			await provider.readdir(agentHostUri('never', '/workspace'));
		} catch (err) {
			caught = err;
		}
		assert.ok(caught instanceof Error, 'expected an error');
		assert.strictEqual(toFileSystemProviderErrorCode(caught as Error), FileSystemProviderErrorCode.Unavailable);
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
		readonly resolveCalls: ResourceResolveParams[] = [];
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
		async resourceCopy(): Promise<{}> { return {}; }
		async resourceDelete(): Promise<{}> { return {}; }
		async resourceMove(): Promise<{}> { return {}; }
		async resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult> {
			this.resolveCalls.push(params);
			const uri = typeof params.uri === 'string' ? URI.parse(params.uri) : URI.revive(params.uri)!;
			return { uri: uri.toString(), type: ResourceType.File };
		}
		async resourceMkdir(): Promise<{}> { return {}; }
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

	test('stat uses resourceResolve for ordinary file: URIs', async () => {
		// Use a non-local authority so the URI actually goes through the
		// agent-host wrapping (toAgentHostUri short-circuits 'local'
		// + file:// to return the URI unchanged).
		const provider = disposables.add(new AgentHostFileSystemProvider());
		const connection = new StubConnection();
		disposables.add(provider.registerAuthority('remote', connection));
		const wrapped = agentHostUri('remote', '/some/file.ts');

		await provider.stat(wrapped);
		assert.strictEqual(connection.resolveCalls.length, 1);
		assert.strictEqual(connection.listCalls.length, 0);
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
		copyError: unknown | undefined;
		resolveError: unknown | undefined;
		mkdirError: unknown | undefined;
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
		async resourceCopy(): Promise<{}> {
			if (this.copyError) { throw this.copyError; }
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
		async resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult> {
			if (this.resolveError) { throw this.resolveError; }
			const uri = typeof params.uri === 'string' ? URI.parse(params.uri) : URI.revive(params.uri)!;
			return { uri: uri.toString(), type: ResourceType.File };
		}
		async resourceMkdir(): Promise<{}> {
			if (this.mkdirError) { throw this.mkdirError; }
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
			{ channel: ROOT_STATE_URI, uri: URI.file('/etc/foo').toString(), read: true, write: true },
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

suite('AgentHostFileSystemProvider - resolve / mkdir / copy / watch', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class FullConnection implements IRemoteFilesystemConnection {
		readonly resolveCalls: ResourceResolveParams[] = [];
		readonly mkdirCalls: ResourceMkdirParams[] = [];
		readonly copyCalls: ResourceCopyParams[] = [];
		readonly watchCalls: CreateResourceWatchParams[] = [];
		nextWatchHandle: { onDidChange: Event<readonly IFileChange[]>; dispose(): void } | undefined;
		watchError: unknown | undefined;
		nextResolveResult: ResourceResolveResult = { uri: '', type: ResourceType.File, size: 42, mtime: '2026-01-15T12:34:56.789Z', etag: 'etag-1' };

		async resourceRead(): Promise<ResourceReadResult> { return { data: '', encoding: ContentEncoding.Utf8 }; }
		async resourceList(): Promise<ResourceListResult> { return { entries: [] }; }
		async resourceWrite(): Promise<{}> { return {}; }
		async resourceDelete(): Promise<{}> { return {}; }
		async resourceMove(): Promise<{}> { return {}; }
		async resourceCopy(params: ResourceCopyParams): Promise<{}> {
			this.copyCalls.push(params);
			return {};
		}
		async resourceResolve(params: ResourceResolveParams): Promise<ResourceResolveResult> {
			this.resolveCalls.push(params);
			return { ...this.nextResolveResult, uri: typeof params.uri === 'string' ? params.uri : URI.revive(params.uri).toString() };
		}
		async resourceMkdir(params: ResourceMkdirParams): Promise<{}> {
			this.mkdirCalls.push(params);
			return {};
		}
		async watchResource(params: CreateResourceWatchParams): Promise<{ onDidChange: Event<readonly IFileChange[]>; dispose(): void }> {
			this.watchCalls.push(params);
			if (this.watchError) {
				throw this.watchError;
			}
			if (!this.nextWatchHandle) {
				throw new Error('test forgot to set nextWatchHandle');
			}
			return this.nextWatchHandle;
		}
	}

	function setup() {
		const provider = disposables.add(new AgentHostFileSystemProvider());
		const connection = new FullConnection();
		disposables.add(provider.registerAuthority('remote', connection));
		return { provider, connection };
	}

	test('stat uses resourceResolve when available and maps size/mtime/type', async () => {
		const { provider, connection } = setup();
		connection.nextResolveResult = { uri: '', type: ResourceType.Directory, size: 0, mtime: '2026-01-15T00:00:00.000Z' };
		const wrapped = agentHostUri('remote', '/some/dir');

		const stat = await provider.stat(wrapped);

		assert.strictEqual(stat.type, FileType.Directory);
		assert.strictEqual(stat.mtime, Date.parse('2026-01-15T00:00:00.000Z'));
		assert.strictEqual(connection.resolveCalls.length, 1, 'resourceResolve was called');
	});

	test('mkdir delegates to resourceMkdir', async () => {
		const { provider, connection } = setup();
		const wrapped = agentHostUri('remote', '/new/dir');

		await provider.mkdir(wrapped);

		assert.strictEqual(connection.mkdirCalls.length, 1);
		assert.strictEqual(connection.mkdirCalls[0].uri, fromAgentHostUri(wrapped).toString());
	});

	test('copy delegates to resourceCopy with overwrite mapped to !failIfExists', async () => {
		const { provider, connection } = setup();
		const from = agentHostUri('remote', '/a');
		const to = agentHostUri('remote', '/b');

		await provider.copy(from, to, { overwrite: false });

		assert.strictEqual(connection.copyCalls.length, 1);
		assert.strictEqual(connection.copyCalls[0].source, fromAgentHostUri(from).toString());
		assert.strictEqual(connection.copyCalls[0].destination, fromAgentHostUri(to).toString());
		assert.strictEqual(connection.copyCalls[0].failIfExists, true);
	});

	test('watch starts watchResource, forwards changes to onDidChangeFile, dispose tears down handle', async () => {
		const { provider, connection } = setup();
		const onDidChange = new Emitter<readonly IFileChange[]>();
		let handleDisposed = false;
		connection.nextWatchHandle = {
			onDidChange: onDidChange.event,
			dispose: () => { handleDisposed = true; onDidChange.dispose(); },
		};
		const wrapped = agentHostUri('remote', '/watched');

		const received: IFileChange[][] = [];
		const sub = provider.onDidChangeFile(c => received.push([...c]));

		const watchDisposable = provider.watch(wrapped, { recursive: true, excludes: ['**/node_modules/**'] });

		// Wait one microtask tick so the async watchResource resolves.
		await new Promise<void>(resolve => queueMicrotask(resolve));

		assert.strictEqual(connection.watchCalls.length, 1);
		assert.strictEqual(connection.watchCalls[0].recursive, true);
		assert.deepStrictEqual(connection.watchCalls[0].excludes, { items: ['**/node_modules/**'] });

		// When watchResource reports changes from the underlying filesystem,
		// they come back with file:// URIs. The provider re-encodes them with
		// the agent host authority.
		const incomingChange: IFileChange = { resource: URI.parse('file:///watched/a.txt'), type: FileChangeType.UPDATED };
		const expectedChange: IFileChange = { resource: toAgentHostUri(URI.parse('file:///watched/a.txt'), 'remote'), type: FileChangeType.UPDATED };
		onDidChange.fire([incomingChange]);

		assert.deepStrictEqual(received, [[expectedChange]]);

		watchDisposable.dispose();
		assert.strictEqual(handleDisposed, true, 'underlying handle should be disposed when wrapper is disposed');
		sub.dispose();
	});

	test('watch forwards includes patterns to watchResource', async () => {
		const { provider, connection } = setup();
		const onDidChange = new Emitter<readonly IFileChange[]>();
		connection.nextWatchHandle = {
			onDidChange: onDidChange.event,
			dispose: () => onDidChange.dispose(),
		};
		const wrapped = agentHostUri('remote', '/watched');

		const watchDisposable = provider.watch(wrapped, {
			recursive: false,
			excludes: [],
			includes: ['**/*.ts', { base: '/watched', pattern: '**/*.md' }],
		});

		await new Promise<void>(resolve => queueMicrotask(resolve));
		assert.deepStrictEqual(connection.watchCalls[0].includes, { items: ['**/*.ts', '**/*.md'] });

		watchDisposable.dispose();
	});

	test('watch setup failures are surfaced on onDidWatchError', async () => {
		const { provider, connection } = setup();
		connection.watchError = new Error('watch setup failed');
		const wrapped = agentHostUri('remote', '/watched');

		const errors: string[] = [];
		const sub = provider.onDidWatchError(message => errors.push(message));

		const watchDisposable = provider.watch(wrapped, { recursive: false, excludes: [] });
		// Yield until the watch's async chain (acquire connection →
		// watchResource → error propagation) settles.
		await timeout(0);

		assert.deepStrictEqual(errors, ['watch setup failed']);

		watchDisposable.dispose();
		sub.dispose();
	});

	test('watch disposed before async setup completes still tears down the handle', async () => {
		const { provider, connection } = setup();
		const onDidChange = new Emitter<readonly IFileChange[]>();
		let handleDisposed = false;
		let handleCreated = false;
		connection.nextWatchHandle = {
			onDidChange: onDidChange.event,
			dispose: () => { handleDisposed = true; onDidChange.dispose(); },
		};
		// Defer the watchResource resolution so we can dispose between
		// `watch()` returning and the handle being assigned.
		const originalWatchResource = connection.watchResource.bind(connection);
		connection.watchResource = async params => {
			handleCreated = true;
			await timeout(0);
			return originalWatchResource(params);
		};
		const wrapped = agentHostUri('remote', '/watched');

		const watchDisposable = provider.watch(wrapped, { recursive: false, excludes: [] });
		// Yield until watchResource has begun (so a handle is in flight),
		// then dispose before it resolves.
		await timeout(0);
		assert.strictEqual(handleCreated, true);
		watchDisposable.dispose();

		await timeout(0);
		await timeout(0);
		assert.strictEqual(handleDisposed, true);
	});

	test('watch reattaches to the next connection registered for the authority after disconnect', async () => {
		const provider = disposables.add(new AgentHostFileSystemProvider(20));
		const first = new FullConnection();
		const firstChanges = new Emitter<readonly IFileChange[]>();
		let firstHandleDisposed = false;
		first.nextWatchHandle = {
			onDidChange: firstChanges.event,
			dispose: () => { firstHandleDisposed = true; firstChanges.dispose(); },
		};
		const firstReg = provider.registerAuthority('remote', first);

		const wrapped = agentHostUri('remote', '/watched');
		const received: IFileChange[][] = [];
		disposables.add(provider.onDidChangeFile(c => received.push([...c])));
		disposables.add(provider.watch(wrapped, { recursive: false, excludes: [] }));

		await timeout(0);
		await timeout(0);
		firstChanges.fire([{ resource: URI.file('/watched/a.txt'), type: FileChangeType.UPDATED }]);

		// Disconnect: a re-registration arrives within the grace window.
		// The watcher must dispose the old handle and attach to the new
		// connection without the caller doing anything.
		firstReg.dispose();
		const second = new FullConnection();
		const secondChanges = new Emitter<readonly IFileChange[]>();
		let secondHandleDisposed = false;
		second.nextWatchHandle = {
			onDidChange: secondChanges.event,
			dispose: () => { secondHandleDisposed = true; secondChanges.dispose(); },
		};
		disposables.add(provider.registerAuthority('remote', second));

		await timeout(0);
		await timeout(0);
		secondChanges.fire([{ resource: URI.file('/watched/b.txt'), type: FileChangeType.ADDED }]);

		assert.deepStrictEqual({
			firstWatchCalls: first.watchCalls.length,
			secondWatchCalls: second.watchCalls.length,
			firstHandleDisposed,
			secondHandleDisposed,
			received: received.map(batch => batch.map(c => [c.resource.toString(), c.type])),
		}, {
			firstWatchCalls: 1,
			secondWatchCalls: 1,
			firstHandleDisposed: true,
			secondHandleDisposed: false,
			received: [
				[[agentHostUri('remote', '/watched/a.txt').toString(), FileChangeType.UPDATED]],
				[[agentHostUri('remote', '/watched/b.txt').toString(), FileChangeType.ADDED]],
			],
		});
	});

	test('watch attaches to a freshly-registered authority that did not exist when watch() was called', async () => {
		const provider = disposables.add(new AgentHostFileSystemProvider(20));
		const wrapped = agentHostUri('never-registered', '/path');

		const received: IFileChange[][] = [];
		disposables.add(provider.onDidChangeFile(c => received.push([...c])));
		disposables.add(provider.watch(wrapped, { recursive: false, excludes: [] }));

		// No authority registered yet — nothing to attach to. Wait long
		// enough that the grace timer (if any were running) would expire.
		await new Promise(r => setTimeout(r, 40));

		const connection = new FullConnection();
		const changes = new Emitter<readonly IFileChange[]>();
		connection.nextWatchHandle = {
			onDidChange: changes.event,
			dispose: () => changes.dispose(),
		};
		disposables.add(provider.registerAuthority('never-registered', connection));

		await timeout(0);
		await timeout(0);
		changes.fire([{ resource: URI.file('/path/late.txt'), type: FileChangeType.ADDED }]);

		assert.strictEqual(connection.watchCalls.length, 1, 'watch attached after late registration');
		assert.strictEqual(received.length, 1);
		assert.strictEqual(received[0][0].resource.toString(), agentHostUri('never-registered', '/path/late.txt').toString());
	});
});
