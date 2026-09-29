/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The reverse half of the symmetric AHP filesystem contract.
 *
 * These scenarios address local files through `vscode-agent-client:` URIs. The
 * host must decode and route each operation back over the WebSocket to the
 * client that owns the URI, then return that client's result to the caller.
 */

import assert from 'assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { toAgentClientUri } from '../../../../common/agentClientUri.js';
import type { ResourceListResult, ResourceReadResult, ResourceResolveResult } from '../../../../common/state/protocol/commands.js';
import { ContentEncoding, ResourceType, ResourceWriteMode } from '../../../../common/state/protocol/common/commands.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { AhpErrorCodes } from '../../../../common/state/sessionProtocol.js';
import { ROOT_STATE_URI } from '../../../../common/state/sessionState.js';
import type { IServedReverseRequest } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineClientHostedFilesystemTests(context: IAgentHostE2ETestContext): void {
	const { config, tempDirs } = context;

	function createWorkspace(prefix: string): string {
		const workspace = mkdtempSync(join(tmpdir(), prefix));
		tempDirs.push(workspace);
		return workspace;
	}

	async function initializeClient(prefix: string): Promise<string> {
		const clientId = `client-hosted-fs-${prefix}-${config.provider}`;
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId,
		});
		context.client.clearServedReverseRequests();
		return clientId;
	}

	function clientUri(clientId: string, path: string): string {
		return toAgentClientUri(URI.file(path), clientId).toString();
	}

	function assertReverseRequest(expected: IServedReverseRequest): void {
		assert.ok(context.client.servedReverseRequests.some(request =>
			request.method === expected.method && request.uri === expected.uri
		), `served reverse requests: ${JSON.stringify(context.client.servedReverseRequests)}`);
	}

	conformanceTest(context, 'client-hosted resourceRead returns UTF-8 text through reverse RPC', async function () {
		const clientId = await initializeClient('read-text');
		const workspace = createWorkspace('ahp-client-hosted-read-text-');
		const file = join(workspace, 'note.txt');
		writeFileSync(file, 'CLIENT_HOSTED_TEXT');

		const result = await context.client.call<ResourceReadResult>('resourceRead', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, file),
			encoding: ContentEncoding.Utf8,
		});

		assert.deepStrictEqual(result, { data: 'CLIENT_HOSTED_TEXT', encoding: ContentEncoding.Utf8, contentType: 'text/plain' });
		assertReverseRequest({ method: 'resourceRead', uri: URI.file(file).toString() });
	});

	conformanceTest(context, 'client-hosted resourceRead preserves arbitrary base64 bytes', async function () {
		const clientId = await initializeClient('read-binary');
		const workspace = createWorkspace('ahp-client-hosted-read-binary-');
		const file = join(workspace, 'bytes.bin');
		const bytes = Buffer.from([0, 1, 2, 127, 128, 254, 255]);
		writeFileSync(file, bytes);

		const result = await context.client.call<ResourceReadResult>('resourceRead', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, file),
			encoding: ContentEncoding.Base64,
		});

		assert.deepStrictEqual({
			encoding: result.encoding,
			bytes: Buffer.from(result.data, 'base64'),
		}, {
			encoding: ContentEncoding.Base64,
			bytes,
		});
		assertReverseRequest({ method: 'resourceRead', uri: URI.file(file).toString() });
	});

	conformanceTest(context, 'client-hosted resourceRead propagates a missing-file error', async function () {
		const clientId = await initializeClient('read-missing');
		const workspace = createWorkspace('ahp-client-hosted-read-missing-');
		const file = join(workspace, 'missing.txt');

		await assert.rejects(context.client.call('resourceRead', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, file),
			encoding: ContentEncoding.Utf8,
		}), { code: AhpErrorCodes.NotFound });
		assertReverseRequest({ method: 'resourceRead', uri: URI.file(file).toString() });
	});

	conformanceTest(context, 'client-hosted resourceList returns file and directory entries', async function () {
		const clientId = await initializeClient('list');
		const workspace = createWorkspace('ahp-client-hosted-list-');
		mkdirSync(join(workspace, 'child-dir'));
		writeFileSync(join(workspace, 'child.txt'), 'child');

		const result = await context.client.call<ResourceListResult>('resourceList', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, workspace),
		});

		assert.deepStrictEqual([...result.entries].sort((a, b) => a.name.localeCompare(b.name)), [
			{ name: 'child-dir', type: 'directory' },
			{ name: 'child.txt', type: 'file' },
		]);
		assertReverseRequest({ method: 'resourceList', uri: URI.file(workspace).toString() });
	});

	conformanceTest(context, 'client-hosted resourceList propagates a missing-directory error', async function () {
		const clientId = await initializeClient('list-missing');
		const workspace = createWorkspace('ahp-client-hosted-list-missing-');
		const directory = join(workspace, 'missing');

		await assert.rejects(context.client.call('resourceList', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, directory),
		}), { code: AhpErrorCodes.NotFound });
		assertReverseRequest({ method: 'resourceResolve', uri: URI.file(directory).toString() });
	});

	conformanceTest(context, 'client-hosted resourceResolve returns file metadata', async function () {
		const clientId = await initializeClient('resolve-file');
		const workspace = createWorkspace('ahp-client-hosted-resolve-file-');
		const file = join(workspace, 'metadata.txt');
		writeFileSync(file, 'metadata');

		const result = await context.client.call<ResourceResolveResult>('resourceResolve', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, file),
		});

		assert.deepStrictEqual({
			type: result.type,
			size: result.size,
			hasEtag: typeof result.etag === 'string',
			hasModifiedTime: typeof result.mtime === 'string',
		}, {
			type: ResourceType.File,
			size: 8,
			hasEtag: true,
			hasModifiedTime: true,
		});
		assertReverseRequest({ method: 'resourceResolve', uri: URI.file(file).toString() });
	});

	conformanceTest(context, 'client-hosted resourceResolve returns directory metadata', async function () {
		const clientId = await initializeClient('resolve-directory');
		const workspace = createWorkspace('ahp-client-hosted-resolve-directory-');
		const directory = join(workspace, 'nested');
		mkdirSync(directory);

		const result = await context.client.call<ResourceResolveResult>('resourceResolve', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, directory),
		});

		assert.deepStrictEqual({ type: result.type, size: result.size }, { type: ResourceType.Directory, size: 0 });
		assertReverseRequest({ method: 'resourceResolve', uri: URI.file(directory).toString() });
	});

	conformanceTest(context, 'client-hosted resourceResolve reflects a changed file etag', async function () {
		const clientId = await initializeClient('resolve-etag');
		const workspace = createWorkspace('ahp-client-hosted-resolve-etag-');
		const file = join(workspace, 'etag.txt');
		writeFileSync(file, 'short');
		const uri = clientUri(clientId, file);

		const before = await context.client.call<ResourceResolveResult>('resourceResolve', { channel: ROOT_STATE_URI, uri });
		writeFileSync(file, 'longer-content');
		const after = await context.client.call<ResourceResolveResult>('resourceResolve', { channel: ROOT_STATE_URI, uri });

		assert.notStrictEqual(after.etag, before.etag);
		assert.deepStrictEqual(context.client.servedReverseRequests.map(request => request.method), ['resourceResolve', 'resourceResolve']);
	});

	conformanceTest(context, 'client-hosted resourceWrite truncates an existing file', async function () {
		const clientId = await initializeClient('write-truncate');
		const workspace = createWorkspace('ahp-client-hosted-write-truncate-');
		const file = join(workspace, 'write.txt');
		writeFileSync(file, 'before');

		await context.client.call('resourceWrite', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, file),
			data: 'after',
			encoding: ContentEncoding.Utf8,
		});

		assert.strictEqual(readFileSync(file, 'utf8'), 'after');
		assertReverseRequest({ method: 'resourceWrite', uri: URI.file(file).toString() });
	});

	conformanceTest(context, 'client-hosted resourceWrite truncates from a byte position', async function () {
		const clientId = await initializeClient('write-truncate-position');
		const workspace = createWorkspace('ahp-client-hosted-write-truncate-position-');
		const file = join(workspace, 'write.txt');
		writeFileSync(file, 'abcdef');

		await context.client.call('resourceWrite', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, file),
			data: 'XY',
			encoding: ContentEncoding.Utf8,
			mode: ResourceWriteMode.Truncate,
			position: 3,
		});

		assert.strictEqual(readFileSync(file, 'utf8'), 'abcXY');
		assertReverseRequest({ method: 'resourceWrite', uri: URI.file(file).toString() });
	});

	conformanceTest(context, 'client-hosted resourceWrite appends at EOF', async function () {
		const clientId = await initializeClient('write-append');
		const workspace = createWorkspace('ahp-client-hosted-write-append-');
		const file = join(workspace, 'write.txt');
		writeFileSync(file, 'first');

		await context.client.call('resourceWrite', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, file),
			data: '-second',
			encoding: ContentEncoding.Utf8,
			mode: ResourceWriteMode.Append,
		});

		assert.strictEqual(readFileSync(file, 'utf8'), 'first-second');
		assertReverseRequest({ method: 'resourceWrite', uri: URI.file(file).toString() });
	});

	conformanceTest(context, 'client-hosted resourceWrite inserts at a byte position', async function () {
		const clientId = await initializeClient('write-insert');
		const workspace = createWorkspace('ahp-client-hosted-write-insert-');
		const file = join(workspace, 'write.txt');
		writeFileSync(file, 'ac');

		await context.client.call('resourceWrite', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, file),
			data: 'b',
			encoding: ContentEncoding.Utf8,
			mode: ResourceWriteMode.Insert,
			position: 1,
		});

		assert.strictEqual(readFileSync(file, 'utf8'), 'abc');
		assertReverseRequest({ method: 'resourceWrite', uri: URI.file(file).toString() });
	});

	// Reverse binary writes currently pass through UTF-8; see KNOWN_ISSUES.md.
	conformanceTest(context, 'client-hosted resourceWrite decodes base64 content', async function () {
		const clientId = await initializeClient('write-binary');
		const workspace = createWorkspace('ahp-client-hosted-write-binary-');
		const file = join(workspace, 'write.bin');
		const bytes = Buffer.from([0, 255, 1, 254]);

		await context.client.call('resourceWrite', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, file),
			data: bytes.toString('base64'),
			encoding: ContentEncoding.Base64,
		});

		assert.deepStrictEqual(readFileSync(file), bytes);
		assertReverseRequest({ method: 'resourceWrite', uri: URI.file(file).toString() });
	}, context.runHostOnlyKnownIssueTests);

	conformanceTest(context, 'client-hosted resourceWrite createOnly preserves an existing file', async function () {
		const clientId = await initializeClient('write-create-only');
		const workspace = createWorkspace('ahp-client-hosted-write-create-only-');
		const file = join(workspace, 'existing.txt');
		writeFileSync(file, 'existing');

		await assert.rejects(context.client.call('resourceWrite', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, file),
			data: 'replacement',
			encoding: ContentEncoding.Utf8,
			createOnly: true,
		}), { code: AhpErrorCodes.AlreadyExists });

		assert.strictEqual(readFileSync(file, 'utf8'), 'existing');
		assertReverseRequest({ method: 'resourceResolve', uri: URI.file(file).toString() });
	});

	conformanceTest(context, 'client-hosted concurrent resourceWrite createOnly calls have a single winner', async function () {
		const clientId = await initializeClient('write-create-only-concurrent');
		const workspace = createWorkspace('ahp-client-hosted-write-create-only-concurrent-');
		const file = join(workspace, 'winner.txt');
		const uri = clientUri(clientId, file);

		const results = await Promise.allSettled([
			context.client.call('resourceWrite', {
				channel: ROOT_STATE_URI,
				uri,
				data: 'first',
				encoding: ContentEncoding.Utf8,
				createOnly: true,
			}),
			context.client.call('resourceWrite', {
				channel: ROOT_STATE_URI,
				uri,
				data: 'second',
				encoding: ContentEncoding.Utf8,
				createOnly: true,
			}),
		]);

		assert.deepStrictEqual({
			statuses: results.map(result => result.status).sort(),
			contentIsWinner: ['first', 'second'].includes(readFileSync(file, 'utf8')),
			reverseWrites: context.client.servedReverseRequests.filter(request => request.method === 'resourceWrite').length,
		}, {
			statuses: ['fulfilled', 'rejected'],
			contentIsWinner: true,
			reverseWrites: 1,
		});
	});

	conformanceTest(context, 'client-hosted resourceMkdir creates missing parent directories', async function () {
		const clientId = await initializeClient('mkdir');
		const workspace = createWorkspace('ahp-client-hosted-mkdir-');
		const directory = join(workspace, 'one', 'two');

		await context.client.call('resourceMkdir', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, directory),
		});

		assert.strictEqual(existsSync(directory), true);
		assertReverseRequest({ method: 'resourceMkdir', uri: URI.file(directory).toString() });
	});

	conformanceTest(context, 'client-hosted resourceCopy copies a file', async function () {
		const clientId = await initializeClient('copy-file');
		const workspace = createWorkspace('ahp-client-hosted-copy-file-');
		const source = join(workspace, 'source.txt');
		const destination = join(workspace, 'nested', 'destination.txt');
		writeFileSync(source, 'copied');

		await context.client.call('resourceCopy', {
			channel: ROOT_STATE_URI,
			source: clientUri(clientId, source),
			destination: clientUri(clientId, destination),
		});

		assert.strictEqual(readFileSync(destination, 'utf8'), 'copied');
		assertReverseRequest({ method: 'resourceCopy', uri: URI.file(source).toString() });
	});

	conformanceTest(context, 'client-hosted resourceCopy recursively copies a directory', async function () {
		const clientId = await initializeClient('copy-directory');
		const workspace = createWorkspace('ahp-client-hosted-copy-directory-');
		const source = join(workspace, 'source');
		const destination = join(workspace, 'destination');
		mkdirSync(join(source, 'nested'), { recursive: true });
		writeFileSync(join(source, 'nested', 'file.txt'), 'copied-tree');

		await context.client.call('resourceCopy', {
			channel: ROOT_STATE_URI,
			source: clientUri(clientId, source),
			destination: clientUri(clientId, destination),
		});

		assert.strictEqual(readFileSync(join(destination, 'nested', 'file.txt'), 'utf8'), 'copied-tree');
		assertReverseRequest({ method: 'resourceCopy', uri: URI.file(source).toString() });
	});

	conformanceTest(context, 'client-hosted resourceCopy failIfExists preserves the destination', async function () {
		const clientId = await initializeClient('copy-existing');
		const workspace = createWorkspace('ahp-client-hosted-copy-existing-');
		const source = join(workspace, 'source.txt');
		const destination = join(workspace, 'destination.txt');
		writeFileSync(source, 'source');
		writeFileSync(destination, 'destination');

		await assert.rejects(context.client.call('resourceCopy', {
			channel: ROOT_STATE_URI,
			source: clientUri(clientId, source),
			destination: clientUri(clientId, destination),
			failIfExists: true,
		}), { code: AhpErrorCodes.AlreadyExists });

		assert.deepStrictEqual({
			source: readFileSync(source, 'utf8'),
			destination: readFileSync(destination, 'utf8'),
		}, {
			source: 'source',
			destination: 'destination',
		});
		assertReverseRequest({ method: 'resourceResolve', uri: URI.file(destination).toString() });
	});

	conformanceTest(context, 'client-hosted resourceMove relocates a file', async function () {
		const clientId = await initializeClient('move-file');
		const workspace = createWorkspace('ahp-client-hosted-move-file-');
		const source = join(workspace, 'source.txt');
		const destination = join(workspace, 'nested', 'destination.txt');
		writeFileSync(source, 'moved');

		await context.client.call('resourceMove', {
			channel: ROOT_STATE_URI,
			source: clientUri(clientId, source),
			destination: clientUri(clientId, destination),
		});

		assert.deepStrictEqual({ sourceExists: existsSync(source), destination: readFileSync(destination, 'utf8') }, {
			sourceExists: false,
			destination: 'moved',
		});
		assertReverseRequest({ method: 'resourceMove', uri: URI.file(source).toString() });
	});

	conformanceTest(context, 'client-hosted resourceMove relocates a directory tree', async function () {
		const clientId = await initializeClient('move-directory');
		const workspace = createWorkspace('ahp-client-hosted-move-directory-');
		const source = join(workspace, 'source');
		const destination = join(workspace, 'destination');
		mkdirSync(join(source, 'nested'), { recursive: true });
		writeFileSync(join(source, 'nested', 'file.txt'), 'moved-tree');

		await context.client.call('resourceMove', {
			channel: ROOT_STATE_URI,
			source: clientUri(clientId, source),
			destination: clientUri(clientId, destination),
		});

		assert.deepStrictEqual({
			sourceExists: existsSync(source),
			destination: readFileSync(join(destination, 'nested', 'file.txt'), 'utf8'),
		}, {
			sourceExists: false,
			destination: 'moved-tree',
		});
		assertReverseRequest({ method: 'resourceMove', uri: URI.file(source).toString() });
	});

	conformanceTest(context, 'client-hosted resourceMove failIfExists preserves both resources', async function () {
		const clientId = await initializeClient('move-existing');
		const workspace = createWorkspace('ahp-client-hosted-move-existing-');
		const source = join(workspace, 'source.txt');
		const destination = join(workspace, 'destination.txt');
		writeFileSync(source, 'source');
		writeFileSync(destination, 'destination');

		await assert.rejects(context.client.call('resourceMove', {
			channel: ROOT_STATE_URI,
			source: clientUri(clientId, source),
			destination: clientUri(clientId, destination),
			failIfExists: true,
		}), { code: AhpErrorCodes.AlreadyExists });

		assert.deepStrictEqual({
			source: readFileSync(source, 'utf8'),
			destination: readFileSync(destination, 'utf8'),
		}, {
			source: 'source',
			destination: 'destination',
		});
		assertReverseRequest({ method: 'resourceResolve', uri: URI.file(destination).toString() });
	});

	conformanceTest(context, 'client-hosted resourceDelete removes a file', async function () {
		const clientId = await initializeClient('delete-file');
		const workspace = createWorkspace('ahp-client-hosted-delete-file-');
		const file = join(workspace, 'delete.txt');
		writeFileSync(file, 'delete');

		await context.client.call('resourceDelete', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, file),
		});

		assert.strictEqual(existsSync(file), false);
		assertReverseRequest({ method: 'resourceDelete', uri: URI.file(file).toString() });
	});

	conformanceTest(context, 'client-hosted resourceDelete recursively removes a directory tree', async function () {
		const clientId = await initializeClient('delete-directory');
		const workspace = createWorkspace('ahp-client-hosted-delete-directory-');
		const directory = join(workspace, 'delete');
		mkdirSync(join(directory, 'nested'), { recursive: true });
		writeFileSync(join(directory, 'nested', 'file.txt'), 'delete-tree');

		await context.client.call('resourceDelete', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, directory),
			recursive: true,
		});

		assert.strictEqual(existsSync(directory), false);
		assertReverseRequest({ method: 'resourceDelete', uri: URI.file(directory).toString() });
	});

	conformanceTest(context, 'client-hosted resourceDelete rejects a non-empty directory without recursive mode', async function () {
		const clientId = await initializeClient('delete-non-recursive');
		const workspace = createWorkspace('ahp-client-hosted-delete-non-recursive-');
		const directory = join(workspace, 'preserve');
		mkdirSync(directory);
		writeFileSync(join(directory, 'file.txt'), 'preserve');

		await assert.rejects(context.client.call('resourceDelete', {
			channel: ROOT_STATE_URI,
			uri: clientUri(clientId, directory),
		}));

		assert.strictEqual(readFileSync(join(directory, 'file.txt'), 'utf8'), 'preserve');
		assertReverseRequest({ method: 'resourceList', uri: URI.file(directory).toString() });
	});
}
