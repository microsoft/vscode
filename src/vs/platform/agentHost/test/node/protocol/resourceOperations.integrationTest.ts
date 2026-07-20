/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { isLinux, isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ContentEncoding, ResourceType, ResourceWriteMode, type ResourceListResult, type ResourceReadResult, type ResourceResolveResult } from '../../../common/state/protocol/common/commands.js';
import { PROTOCOL_VERSION } from '../../../common/state/protocol/version/registry.js';
import { ROOT_STATE_URI } from '../../../common/state/sessionState.js';
import { getActionEnvelope, getAgentHostE2ETestTimeout, isActionNotification, type IServerHandle, startServer, TestProtocolClient } from '../serverIntegrationTestHelpers.js';

suite('Protocol WebSocket - Resource Operations', function () {

	let server: IServerHandle;
	let client: TestProtocolClient;
	let testDirectory: string;
	let clientCounter = 0;

	suiteSetup(async function () {
		this.timeout(getAgentHostE2ETestTimeout(35_000, 60_000));
		server = await startServer({ startupTimeoutMs: getAgentHostE2ETestTimeout(30_000, 50_000) });
	});

	suiteTeardown(function () {
		server?.process.kill();
	});

	setup(async function () {
		this.timeout(10_000);
		testDirectory = mkdtempSync(join(tmpdir(), 'agent-host-resource-'));
		client = new TestProtocolClient(server.port);
		await client.connect();
		await client.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: `resource-client-${++clientCounter}` });
	});

	teardown(function () {
		client.close();
		rmSync(testDirectory, { recursive: true, force: true });
	});

	function resource(name: string): string {
		return URI.file(join(testDirectory, name)).toString();
	}

	async function write(uri: string, data: string, options?: { encoding?: ContentEncoding; mode?: ResourceWriteMode; position?: number; createOnly?: boolean; ifMatch?: string }): Promise<void> {
		await client.call('resourceWrite', {
			channel: ROOT_STATE_URI,
			uri,
			data,
			encoding: options?.encoding ?? ContentEncoding.Utf8,
			mode: options?.mode,
			position: options?.position,
			createOnly: options?.createOnly,
			ifMatch: options?.ifMatch,
		});
	}

	async function read(uri: string): Promise<string> {
		const result = await client.call<ResourceReadResult>('resourceRead', { channel: ROOT_STATE_URI, uri });
		return result.data;
	}

	function isResourceWatchChangeFor(uri: string, notification: Parameters<typeof isActionNotification>[0]): boolean {
		if (!isActionNotification(notification, 'resourceWatch/changed')) {
			return false;
		}
		const action = getActionEnvelope(notification).action as { changes: { items: { uri: string }[] } };
		return action.changes.items.some(change => change.uri === uri);
	}

	test('resourceMkdir creates nested directories and is idempotent', async function () {
		const directory = resource('one/two/three');
		await client.call('resourceMkdir', { channel: ROOT_STATE_URI, uri: directory });
		await client.call('resourceMkdir', { channel: ROOT_STATE_URI, uri: directory });

		const resolved = await client.call<ResourceResolveResult>('resourceResolve', { channel: ROOT_STATE_URI, uri: directory });
		assert.strictEqual(resolved.type, ResourceType.Directory);
	});

	test('resourceList returns file and directory entries', async function () {
		await client.call('resourceMkdir', { channel: ROOT_STATE_URI, uri: resource('folder') });
		await write(resource('file.txt'), 'content');

		const result = await client.call<ResourceListResult>('resourceList', { channel: ROOT_STATE_URI, uri: URI.file(testDirectory).toString() });
		assert.deepStrictEqual(result.entries.sort((a, b) => a.name.localeCompare(b.name)), [
			{ name: 'file.txt', type: 'file' },
			{ name: 'folder', type: 'directory' },
		]);
	});

	test('resourceWrite and resourceRead round-trip UTF-8 text', async function () {
		const file = resource('utf8.txt');
		await write(file, 'hello world');
		assert.strictEqual(await read(file), 'hello world');
	});

	test('resourceWrite decodes base64 input', async function () {
		const file = resource('base64.txt');
		await write(file, Buffer.from('base64 content').toString('base64'), { encoding: ContentEncoding.Base64 });
		assert.strictEqual(await read(file), 'base64 content');
	});

	test('resourceWrite append adds data at EOF', async function () {
		const file = resource('append.txt');
		await write(file, 'abc');
		await write(file, 'def', { mode: ResourceWriteMode.Append });
		assert.strictEqual(await read(file), 'abcdef');
	});

	test('resourceWrite append position inserts before trailing bytes', async function () {
		const file = resource('append-position.txt');
		await write(file, 'abcdef');
		await write(file, 'X', { mode: ResourceWriteMode.Append, position: 2 });
		assert.strictEqual(await read(file), 'abcdXef');
	});

	test('resourceWrite insert splices data at a byte offset', async function () {
		const file = resource('insert.txt');
		await write(file, 'abcdef');
		await write(file, 'X', { mode: ResourceWriteMode.Insert, position: 3 });
		assert.strictEqual(await read(file), 'abcXdef');
	});

	test('resourceWrite insert beyond EOF appends data', async function () {
		const file = resource('insert-beyond.txt');
		await write(file, 'abc');
		await write(file, 'X', { mode: ResourceWriteMode.Insert, position: 100 });
		assert.strictEqual(await read(file), 'abcX');
	});

	test('resourceWrite append creates a missing file', async function () {
		const file = resource('append-create.txt');
		await write(file, 'created', { mode: ResourceWriteMode.Append });
		assert.strictEqual(await read(file), 'created');
	});

	test('resourceWrite insert creates a missing file', async function () {
		const file = resource('insert-create.txt');
		await write(file, 'created', { mode: ResourceWriteMode.Insert, position: 3 });
		assert.strictEqual(await read(file), 'created');
	});

	test('resourceWrite truncate position preserves the prefix', async function () {
		const file = resource('truncate-position.txt');
		await write(file, 'abcdef');
		await write(file, 'X', { mode: ResourceWriteMode.Truncate, position: 2 });
		assert.strictEqual(await read(file), 'abX');
	});

	test('resourceWrite createOnly rejects an existing file', async function () {
		const file = resource('create-only.txt');
		await write(file, 'first');
		await assert.rejects(() => write(file, 'second', { createOnly: true }), /already exists/i);
		await assert.rejects(() => write(file, 'second', { createOnly: true, mode: ResourceWriteMode.Append }), /already exists/i);
		await assert.rejects(() => write(file, 'second', { createOnly: true, mode: ResourceWriteMode.Insert }), /already exists/i);
		assert.strictEqual(await read(file), 'first');

		const concurrentFile = resource('create-only-concurrent.txt');
		const results = await Promise.allSettled([
			write(concurrentFile, 'append', { createOnly: true, mode: ResourceWriteMode.Append }),
			write(concurrentFile, 'insert', { createOnly: true, mode: ResourceWriteMode.Insert }),
		]);
		assert.deepStrictEqual(results.map(result => result.status).sort(), ['fulfilled', 'rejected']);
		assert.ok(['append', 'insert'].includes(await read(concurrentFile)));
	});

	test('resourceResolve returns file metadata and an etag', async function () {
		const file = resource('resolve-file.txt');
		await write(file, 'hello');

		const result = await client.call<ResourceResolveResult>('resourceResolve', { channel: ROOT_STATE_URI, uri: file });
		assert.deepStrictEqual({
			uri: result.uri,
			type: result.type,
			size: result.size,
			hasMtime: typeof result.mtime === 'string',
			hasEtag: typeof result.etag === 'string',
		}, {
			uri: file,
			type: ResourceType.File,
			size: 5,
			hasMtime: true,
			hasEtag: true,
		});
	});

	test('resourceResolve returns directory metadata', async function () {
		const directory = resource('resolve-directory');
		await client.call('resourceMkdir', { channel: ROOT_STATE_URI, uri: directory });
		const result = await client.call<ResourceResolveResult>('resourceResolve', { channel: ROOT_STATE_URI, uri: directory });
		assert.strictEqual(result.type, ResourceType.Directory);
	});

	test('resourceWrite accepts the current ifMatch etag', async function () {
		const file = resource('if-match.txt');
		await write(file, 'first');
		const resolved = await client.call<ResourceResolveResult>('resourceResolve', { channel: ROOT_STATE_URI, uri: file });
		assert.ok(resolved.etag);

		await write(file, 'second', { ifMatch: resolved.etag });
		assert.strictEqual(await read(file), 'second');
	});

	test('resourceWrite rejects a stale ifMatch etag', async function () {
		const file = resource('if-match-stale.txt');
		await write(file, 'first');
		await assert.rejects(() => write(file, 'second', { ifMatch: 'stale-etag' }), /ifMatch precondition failed/i);
		assert.strictEqual(await read(file), 'first');
	});

	test('resourceWrite rejects ifMatch for a missing file', async function () {
		const file = resource('if-match-missing.txt');
		await assert.rejects(() => write(file, 'content', { ifMatch: 'missing-etag' }), /ifMatch precondition failed/i);
	});

	test('resourceCopy copies a file', async function () {
		const source = resource('copy-source.txt');
		const destination = resource('copy-destination.txt');
		await write(source, 'copied');
		await client.call('resourceCopy', { channel: ROOT_STATE_URI, source, destination });
		assert.strictEqual(await read(destination), 'copied');
	});

	test('resourceCopy copies a directory recursively', async function () {
		const source = resource('copy-source-directory');
		const destination = resource('copy-destination-directory');
		await client.call('resourceMkdir', { channel: ROOT_STATE_URI, uri: source });
		await write(URI.file(join(testDirectory, 'copy-source-directory', 'file.txt')).toString(), 'copied');

		await client.call('resourceCopy', { channel: ROOT_STATE_URI, source, destination });
		assert.strictEqual(await read(URI.file(join(testDirectory, 'copy-destination-directory', 'file.txt')).toString()), 'copied');
	});

	test('resourceCopy failIfExists preserves the destination', async function () {
		const source = resource('copy-existing-source.txt');
		const destination = resource('copy-existing-destination.txt');
		await write(source, 'source');
		await write(destination, 'destination');

		await assert.rejects(() => client.call('resourceCopy', { channel: ROOT_STATE_URI, source, destination, failIfExists: true }), /already exists/i);
		assert.strictEqual(await read(destination), 'destination');
	});

	test('resourceCopy reports a missing source', async function () {
		await assert.rejects(() => client.call('resourceCopy', {
			channel: ROOT_STATE_URI,
			source: resource('missing-copy-source.txt'),
			destination: resource('copy-target.txt'),
		}), /source not found/i);
	});

	test('resourceMove moves a file', async function () {
		const source = resource('move-source.txt');
		const destination = resource('move-destination.txt');
		await write(source, 'moved');
		await client.call('resourceMove', { channel: ROOT_STATE_URI, source, destination });

		assert.strictEqual(await read(destination), 'moved');
		await assert.rejects(() => read(source), /content not found/i);
	});

	test('resourceMove moves a directory recursively', async function () {
		const source = resource('move-source-directory');
		const destination = resource('move-destination-directory');
		await client.call('resourceMkdir', { channel: ROOT_STATE_URI, uri: source });
		await write(URI.file(join(testDirectory, 'move-source-directory', 'file.txt')).toString(), 'moved');

		await client.call('resourceMove', { channel: ROOT_STATE_URI, source, destination });
		assert.strictEqual(await read(URI.file(join(testDirectory, 'move-destination-directory', 'file.txt')).toString()), 'moved');
	});

	test('resourceMove failIfExists preserves both files', async function () {
		const source = resource('move-existing-source.txt');
		const destination = resource('move-existing-destination.txt');
		await write(source, 'source');
		await write(destination, 'destination');

		await assert.rejects(() => client.call('resourceMove', { channel: ROOT_STATE_URI, source, destination, failIfExists: true }), /already exists/i);
		assert.deepStrictEqual([await read(source), await read(destination)], ['source', 'destination']);
	});

	test('resourceMove reports a missing source', async function () {
		await assert.rejects(() => client.call('resourceMove', {
			channel: ROOT_STATE_URI,
			source: resource('missing-move-source.txt'),
			destination: resource('move-target.txt'),
		}), /source not found/i);
	});

	test('resourceDelete removes a file', async function () {
		const file = resource('delete.txt');
		await write(file, 'delete me');
		await client.call('resourceDelete', { channel: ROOT_STATE_URI, uri: file });
		await assert.rejects(() => read(file), /content not found/i);
	});

	test('resourceDelete removes an empty directory', async function () {
		const directory = resource('delete-empty-directory');
		await client.call('resourceMkdir', { channel: ROOT_STATE_URI, uri: directory });
		await client.call('resourceDelete', { channel: ROOT_STATE_URI, uri: directory });
		await assert.rejects(() => client.call('resourceResolve', { channel: ROOT_STATE_URI, uri: directory }), /resource not found/i);
	});

	test('resourceDelete requires recursive for a non-empty directory', async function () {
		const directory = resource('delete-directory');
		await client.call('resourceMkdir', { channel: ROOT_STATE_URI, uri: directory });
		await write(URI.file(join(testDirectory, 'delete-directory', 'file.txt')).toString(), 'content');

		await assert.rejects(() => client.call('resourceDelete', { channel: ROOT_STATE_URI, uri: directory }), /resource not found/i);
		await client.call('resourceDelete', { channel: ROOT_STATE_URI, uri: directory, recursive: true });
		await assert.rejects(() => client.call('resourceResolve', { channel: ROOT_STATE_URI, uri: directory }), /resource not found/i);
	});

	test('resourceDelete reports a missing resource', async function () {
		await assert.rejects(() => client.call('resourceDelete', { channel: ROOT_STATE_URI, uri: resource('missing-delete.txt') }), /resource not found/i);
	});

	test('resourceRead reports a missing file', async function () {
		await assert.rejects(() => read(resource('missing-read.txt')), /content not found/i);
	});

	test('resourceList reports a missing directory', async function () {
		await assert.rejects(() => client.call('resourceList', { channel: ROOT_STATE_URI, uri: resource('missing-list') }), /directory not found/i);
	});

	test('resourceList rejects a file', async function () {
		const file = resource('not-a-directory.txt');
		await write(file, 'content');
		await assert.rejects(() => client.call('resourceList', { channel: ROOT_STATE_URI, uri: file }), /not a directory/i);
	});

	test('resourceMkdir rejects an existing file', async function () {
		const file = resource('mkdir-file.txt');
		await write(file, 'content');
		await assert.rejects(() => client.call('resourceMkdir', { channel: ROOT_STATE_URI, uri: file }), /not a directory/i);
	});

	test('resourceWrite reports a missing parent directory', async function () {
		await assert.rejects(() => write(resource('missing-parent/file.txt'), 'content'), /parent directory not found/i);
	});

	test('resourceResolve reports a missing resource', async function () {
		await assert.rejects(() => client.call('resourceResolve', { channel: ROOT_STATE_URI, uri: resource('missing-resolve') }), /resource not found/i);
	});

	test('resourceRequest grants local access', async function () {
		const result = await client.call('resourceRequest', {
			channel: ROOT_STATE_URI,
			uri: URI.file(testDirectory).toString(),
			read: true,
			write: true,
		});
		assert.deepStrictEqual(result, {});
	});

	test('createResourceWatch reports a missing root', async function () {
		await assert.rejects(() => client.call('createResourceWatch', {
			channel: ROOT_STATE_URI,
			uri: resource('missing-watch-root'),
		}), /resource not found/i);
	});

	// File watcher delivery is unreliable in the Linux and Windows Electron CI environments.
	(isLinux || isWindows ? test.skip : test)('non-recursive resource watch emits a change action', async function () {
		const watch = await client.call<{ channel: string }>('createResourceWatch', {
			channel: ROOT_STATE_URI,
			uri: URI.file(testDirectory).toString(),
		});
		await client.call('subscribe', { channel: watch.channel });
		const file = resource('watched.txt');
		const changed = client.waitForNotification(n => isResourceWatchChangeFor(file, n), 10_000);
		await write(file, 'content');
		assert.ok(await changed);
	});

	test('recursive resource watch subscription returns its descriptor', async function () {
		const nested = resource('nested');
		await client.call('resourceMkdir', { channel: ROOT_STATE_URI, uri: nested });
		const watch = await client.call<{ channel: string }>('createResourceWatch', {
			channel: ROOT_STATE_URI,
			uri: URI.file(testDirectory).toString(),
			recursive: true,
			excludes: { items: ['**/.git/**'] },
			includes: { items: ['**/*.ts'] },
		});
		const result = await client.call<{ snapshot: { state: { root: string; recursive: boolean; excludes?: { items: string[] }; includes?: { items: string[] } } } }>('subscribe', { channel: watch.channel });
		assert.deepStrictEqual(result.snapshot.state, {
			root: URI.file(testDirectory).toString(),
			recursive: true,
			excludes: { items: ['**/.git/**'] },
			includes: { items: ['**/*.ts'] },
		});
	});

	test('resource watch supports multiple subscribers', async function () {
		const watch = await client.call<{ channel: string }>('createResourceWatch', {
			channel: ROOT_STATE_URI,
			uri: URI.file(testDirectory).toString(),
		});
		const first = await client.call<{ snapshot: { state: { root: string } } }>('subscribe', { channel: watch.channel });

		const secondClient = new TestProtocolClient(server.port);
		await secondClient.connect();
		await secondClient.call('initialize', { protocolVersions: [PROTOCOL_VERSION], clientId: `resource-client-${++clientCounter}` });
		const second = await secondClient.call<{ snapshot: { state: { root: string } } }>('subscribe', { channel: watch.channel });

		assert.deepStrictEqual([first.snapshot.state.root, second.snapshot.state.root], [
			URI.file(testDirectory).toString(),
			URI.file(testDirectory).toString(),
		]);
		client.notify('unsubscribe', { channel: watch.channel });
		secondClient.notify('unsubscribe', { channel: watch.channel });
		secondClient.close();
	});
});
