/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The filesystem half of the Agent Host Protocol, in both directions.
 *
 * **Client to server** — the `resource*` command surface, executed by the host
 * against the filesystem it runs on.
 *
 * **Server to client** — the same surface travelling the other way. The host
 * addresses client-side files through the `vscode-agent-client` scheme and
 * serves them by sending reverse requests back down the connection, so a file
 * that exists only on the client is still reachable. Nothing else in the E2E
 * suite puts the host in that configuration.
 *
 * Both are host-owned and provider-invariant, so they live in the conformance
 * tier and never cross the model boundary.
 */

import assert from 'assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { raceTimeout } from '../../../../../../base/common/async.js';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import type {
	CreateResourceWatchResult,
	ResourceListResult,
	ResourceReadResult,
	ResourceResolveResult,
	SubscribeResult,
} from '../../../../common/state/protocol/commands.js';
import { ContentEncoding, ResourceType, ResourceWriteMode } from '../../../../common/state/protocol/common/commands.js';
import { ResourceChangeType, type ResourceChange, type ResourceWatchState } from '../../../../common/state/protocol/channels-resource-watch/state.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { AhpErrorCodes, type AhpNotification } from '../../../../common/state/sessionProtocol.js';
import { CustomizationLoadStatus, CustomizationType, ROOT_STATE_URI } from '../../../../common/state/sessionState.js';
import { createRealSession } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineClientFilesystemTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs, isWindows } = context;

	function createWorkspace(prefix: string): string {
		const workspace = mkdtempSync(join(tmpdir(), prefix));
		tempDirs.push(workspace);
		return workspace;
	}

	/** A `file:` URI string under `root`, as the protocol carries them. */
	function fileUri(root: string, ...segments: string[]): string {
		return URI.file(join(root, ...segments)).toString();
	}

	/**
	 * Completes the handshake. Resource commands are only routed once the
	 * connection has a registered client; before that the server answers
	 * `Method not found`.
	 */
	async function initializeClient(purpose: string): Promise<void> {
		await context.client.call('initialize', {
			channel: ROOT_STATE_URI,
			protocolVersions: [PROTOCOL_VERSION],
			clientId: `${purpose}-${config.provider}`,
		});
	}

	async function writeText(uri: string, data: string, options: {
		readonly createOnly?: boolean;
		readonly ifMatch?: string;
		readonly mode?: ResourceWriteMode;
		readonly position?: number;
	} = {}): Promise<void> {
		await context.client.call('resourceWrite', {
			channel: ROOT_STATE_URI,
			uri,
			data,
			encoding: ContentEncoding.Utf8,
			...options,
		});
	}

	conformanceTest(context, 'resource commands round-trip a file through the host filesystem', async function () {
		await initializeClient('resource-roundtrip');
		const root = createWorkspace('ahp-resource-rw-');
		const directory = fileUri(root, 'nested', 'inner');
		const file = fileUri(root, 'nested', 'inner', 'note.txt');

		// Negotiating access is the documented preamble to using the resource
		// commands, so the round-trip starts where a real caller would.
		await context.client.call('resourceRequest', {
			channel: ROOT_STATE_URI, uri: URI.file(root).toString(), read: true, write: true,
		});

		// `mkdir -p` semantics, and idempotent for a directory that exists.
		await context.client.call('resourceMkdir', { channel: ROOT_STATE_URI, uri: directory });
		await context.client.call('resourceMkdir', { channel: ROOT_STATE_URI, uri: directory });
		await context.client.call('resourceWrite', {
			channel: ROOT_STATE_URI, uri: file, data: 'RESOURCE_ROUNDTRIP', encoding: ContentEncoding.Utf8,
		});

		const read = await context.client.call<ResourceReadResult>('resourceRead', {
			channel: ROOT_STATE_URI, uri: file, encoding: ContentEncoding.Utf8,
		});
		const resolvedDirectory = await context.client.call<ResourceResolveResult>('resourceResolve', {
			channel: ROOT_STATE_URI, uri: directory,
		});
		const resolvedFile = await context.client.call<ResourceResolveResult>('resourceResolve', {
			channel: ROOT_STATE_URI, uri: file,
		});

		assert.deepStrictEqual({
			data: read.data,
			encoding: read.encoding,
			directoryType: resolvedDirectory.type,
			fileType: resolvedFile.type,
			size: resolvedFile.size,
		}, {
			data: 'RESOURCE_ROUNDTRIP',
			encoding: ContentEncoding.Utf8,
			directoryType: ResourceType.Directory,
			fileType: ResourceType.File,
			size: 'RESOURCE_ROUNDTRIP'.length,
		});
	});

	conformanceTest(context, 'resourceRequest accepts independent read and write access requests', async function () {
		await initializeClient('resource-request-modes');
		const root = createWorkspace('ahp-resource-request-modes-');
		const uri = URI.file(root).toString();

		const [read, write] = await Promise.all([
			context.client.call('resourceRequest', { channel: ROOT_STATE_URI, uri, read: true }),
			context.client.call('resourceRequest', { channel: ROOT_STATE_URI, uri, write: true }),
		]);

		assert.deepStrictEqual({ read, write }, { read: {}, write: {} });
	});

	conformanceTest(context, 'resourceList reports directory entries and their types', async function () {
		await initializeClient('resource-list');
		const root = createWorkspace('ahp-resource-list-');
		mkdirSync(join(root, 'child-dir'));
		writeFileSync(join(root, 'child-file.txt'), 'CHILD');

		const listed = await context.client.call<ResourceListResult>('resourceList', {
			channel: ROOT_STATE_URI, uri: URI.file(root).toString(),
		});

		assert.deepStrictEqual([...listed.entries].sort((a, b) => a.name.localeCompare(b.name)), [
			{ name: 'child-dir', type: 'directory' },
			{ name: 'child-file.txt', type: 'file' },
		]);
	});

	conformanceTest(context, 'resourceList returns an empty collection for an empty directory', async function () {
		await initializeClient('resource-list-empty');
		const root = createWorkspace('ahp-resource-list-empty-');

		const result = await context.client.call<ResourceListResult>('resourceList', {
			channel: ROOT_STATE_URI,
			uri: URI.file(root).toString(),
		});

		assert.deepStrictEqual(result.entries, []);
	});

	conformanceTest(context, 'resourceRead preserves UTF-8 text and reports its content type', async function () {
		await initializeClient('resource-read-unicode');
		const root = createWorkspace('ahp-resource-read-unicode-');
		const text = 'snowman \u2603 and smile \u{1F600}';
		writeFileSync(join(root, 'unicode.txt'), text);

		const result = await context.client.call<ResourceReadResult>('resourceRead', {
			channel: ROOT_STATE_URI,
			uri: fileUri(root, 'unicode.txt'),
			encoding: ContentEncoding.Utf8,
		});

		assert.deepStrictEqual(result, {
			data: text,
			encoding: ContentEncoding.Utf8,
			contentType: 'text/plain',
		});
	});

	conformanceTest(context, 'resourceWrite truncates an existing file by default', async function () {
		await initializeClient('resource-write-default-truncate');
		const root = createWorkspace('ahp-resource-write-default-truncate-');
		const file = fileUri(root, 'replace.txt');
		writeFileSync(join(root, 'replace.txt'), 'LONGER_ORIGINAL');

		await writeText(file, 'short');

		assert.strictEqual(readFileSync(join(root, 'replace.txt'), 'utf8'), 'short');
	});

	conformanceTest(context, 'resourceWrite creates an empty file from empty content', async function () {
		await initializeClient('resource-write-empty');
		const root = createWorkspace('ahp-resource-write-empty-');
		const file = fileUri(root, 'empty.txt');

		await writeText(file, '');

		assert.deepStrictEqual({
			exists: existsSync(join(root, 'empty.txt')),
			content: readFileSync(join(root, 'empty.txt'), 'utf8'),
		}, {
			exists: true,
			content: '',
		});
	});

	conformanceTest(context, 'resourceWrite preserves arbitrary base64 bytes', async function () {
		await initializeClient('resource-write-binary');
		const root = createWorkspace('ahp-resource-write-binary-');
		const bytes = Buffer.from([0, 1, 2, 127, 128, 254, 255]);

		await context.client.call('resourceWrite', {
			channel: ROOT_STATE_URI,
			uri: fileUri(root, 'bytes.bin'),
			data: bytes.toString('base64'),
			encoding: ContentEncoding.Base64,
		});

		assert.deepStrictEqual([...readFileSync(join(root, 'bytes.bin'))], [...bytes]);
	});

	conformanceTest(context, 'resourceDelete removes an empty directory without recursive mode', async function () {
		await initializeClient('resource-delete-empty-directory');
		const root = createWorkspace('ahp-resource-delete-empty-directory-');
		const directory = join(root, 'empty');
		mkdirSync(directory);

		await context.client.call('resourceDelete', {
			channel: ROOT_STATE_URI,
			uri: URI.file(directory).toString(),
		});

		assert.strictEqual(existsSync(directory), false);
	});

	conformanceTest(context, 'resourceCopy, resourceMove, and resourceDelete mutate the tree', async function () {
		await initializeClient('resource-mutate');
		const root = createWorkspace('ahp-resource-mutate-');
		writeFileSync(join(root, 'origin.txt'), 'MUTATE');

		await context.client.call('resourceCopy', {
			channel: ROOT_STATE_URI, source: fileUri(root, 'origin.txt'), destination: fileUri(root, 'copy.txt'),
		});
		await context.client.call('resourceMove', {
			channel: ROOT_STATE_URI, source: fileUri(root, 'copy.txt'), destination: fileUri(root, 'moved.txt'),
		});
		await context.client.call('resourceDelete', { channel: ROOT_STATE_URI, uri: fileUri(root, 'origin.txt') });

		const listed = await context.client.call<ResourceListResult>('resourceList', {
			channel: ROOT_STATE_URI, uri: URI.file(root).toString(),
		});
		const moved = await context.client.call<ResourceReadResult>('resourceRead', {
			channel: ROOT_STATE_URI, uri: fileUri(root, 'moved.txt'), encoding: ContentEncoding.Utf8,
		});

		assert.deepStrictEqual({
			remaining: listed.entries.map(entry => entry.name).sort(),
			movedContents: moved.data,
		}, {
			remaining: ['moved.txt'],
			movedContents: 'MUTATE',
		});
	});

	conformanceTest(context, 'resource watch reports changes on its subscribed channel', async function () {
		await initializeClient('resource-watch');
		const root = createWorkspace('ahp-resource-watch-');
		const rootUri = URI.file(root).toString();
		const watchedFile = fileUri(root, 'watched.txt');

		const watch = await context.client.call<CreateResourceWatchResult>('createResourceWatch', {
			channel: ROOT_STATE_URI, uri: rootUri, recursive: false,
		});
		let subscribed = false;

		try {
			const subscribedWatch = await context.client.call<SubscribeResult>('subscribe', { channel: watch.channel });
			subscribed = true;
			const descriptor = subscribedWatch.snapshot!.state as ResourceWatchState;
			context.client.clearReceived();

			const changed = context.client.waitForNotification(n => {
				if (!isActionNotification(n, 'resourceWatch/changed') || getActionEnvelope(n).channel !== watch.channel) {
					return false;
				}
				const action = getActionEnvelope(n).action as { readonly changes: { readonly items: readonly ResourceChange[] } };
				return action.changes.items.some(change =>
					change.uri === watchedFile
					&& (change.type === ResourceChangeType.Added || change.type === ResourceChangeType.Updated)
				);
			}, 30_000);

			let changedNotification: AhpNotification | undefined;
			// The OS watcher attaches asynchronously, so keep producing change edges until it is ready.
			for (let attempt = 1; attempt <= 30 && !changedNotification; attempt++) {
				await context.client.call('resourceWrite', {
					channel: ROOT_STATE_URI, uri: watchedFile, data: `WATCHED-${attempt}`, encoding: ContentEncoding.Utf8,
				});
				changedNotification = await raceTimeout(changed, 1_000);
			}

			const action = getActionEnvelope(changedNotification ?? await changed).action as { readonly changes: { readonly items: readonly ResourceChange[] } };
			const observed = action.changes.items.find(change => change.uri === watchedFile);
			assert.deepStrictEqual({
				scheme: URI.parse(watch.channel).scheme,
				descriptor,
				observedUri: observed?.uri,
				observedMutation: observed?.type === ResourceChangeType.Added || observed?.type === ResourceChangeType.Updated,
			}, {
				scheme: 'ahp-resource-watch',
				descriptor: {
					root: rootUri,
					recursive: false,
				},
				observedUri: watchedFile,
				observedMutation: true,
			});
		} finally {
			if (subscribed) {
				context.client.notify('unsubscribe', { channel: watch.channel });
			}
		}
	}, !isWindows);

	conformanceTest(context, 'resource watch subscription preserves its descriptor', async function () {
		await initializeClient('resource-watch-descriptor');
		const root = createWorkspace('ahp-resource-watch-descriptor-');
		const rootUri = URI.file(root).toString();
		const watch = await context.client.call<{ channel: string }>('createResourceWatch', {
			channel: ROOT_STATE_URI,
			uri: rootUri,
			recursive: true,
			excludes: { items: ['**/*.tmp'] },
			includes: { items: ['**/*.txt'] },
		});

		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: watch.channel });

		assert.deepStrictEqual(subscribed.snapshot!.state as ResourceWatchState, {
			root: rootUri,
			recursive: true,
			excludes: { items: ['**/*.tmp'] },
			includes: { items: ['**/*.txt'] },
		});
	});

	conformanceTest(context, 'equivalent resource watch descriptors produce equivalent snapshots', async function () {
		await initializeClient('resource-watch-stable-channel');
		const root = createWorkspace('ahp-resource-watch-stable-channel-');
		const params = {
			channel: ROOT_STATE_URI,
			uri: URI.file(root).toString(),
			recursive: true,
			excludes: { items: ['**/*.tmp'] },
		} as const;

		const first = await context.client.call<CreateResourceWatchResult>('createResourceWatch', params);
		const second = await context.client.call<CreateResourceWatchResult>('createResourceWatch', params);
		const firstSubscription = await context.client.call<SubscribeResult>('subscribe', { channel: first.channel });
		const secondSubscription = second.channel === first.channel
			? firstSubscription
			: await context.client.call<SubscribeResult>('subscribe', { channel: second.channel });

		assert.deepStrictEqual(secondSubscription.snapshot?.state, firstSubscription.snapshot?.state);
	});

	conformanceTest(context, 'different resource watch descriptors produce different channels', async function () {
		await initializeClient('resource-watch-distinct-channel');
		const root = createWorkspace('ahp-resource-watch-distinct-channel-');
		const rootUri = URI.file(root).toString();

		const shallow = await context.client.call<CreateResourceWatchResult>('createResourceWatch', {
			channel: ROOT_STATE_URI,
			uri: rootUri,
			recursive: false,
		});
		const recursive = await context.client.call<CreateResourceWatchResult>('createResourceWatch', {
			channel: ROOT_STATE_URI,
			uri: rootUri,
			recursive: true,
		});

		assert.notStrictEqual(recursive.channel, shallow.channel);
	});

	conformanceTest(context, 'multiple clients can subscribe to the same resource watch', async function () {
		await initializeClient('resource-watch-multi-client');
		const root = createWorkspace('ahp-resource-watch-multi-client-');
		const watch = await context.client.call<CreateResourceWatchResult>('createResourceWatch', {
			channel: ROOT_STATE_URI,
			uri: URI.file(root).toString(),
			recursive: true,
		});
		const client = await context.connectClient();
		try {
			await client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `resource-watch-multi-client-extra-${config.provider}`,
			});
			const [first, second] = await Promise.all([
				context.client.call<SubscribeResult>('subscribe', { channel: watch.channel }),
				client.call<SubscribeResult>('subscribe', { channel: watch.channel }),
			]);

			assert.deepStrictEqual(second.snapshot?.state, first.snapshot?.state);
		} finally {
			client.close();
		}
	});

	conformanceTest(context, 'resource watch subscribe snapshot identifies its channel and sequence', async function () {
		await initializeClient('resource-watch-snapshot-identity');
		const root = createWorkspace('ahp-resource-watch-snapshot-identity-');
		const watch = await context.client.call<CreateResourceWatchResult>('createResourceWatch', {
			channel: ROOT_STATE_URI,
			uri: URI.file(root).toString(),
			recursive: false,
		});
		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: watch.channel });

		assert.deepStrictEqual({
			resource: subscribed.snapshot?.resource,
			hasSequence: typeof subscribed.snapshot?.fromSeq === 'number',
		}, {
			resource: watch.channel,
			hasSequence: true,
		});
	});

	conformanceTest(context, 'resource watch can target a regular file', async function () {
		await initializeClient('resource-watch-file');
		const root = createWorkspace('ahp-resource-watch-file-');
		const file = join(root, 'watched.txt');
		writeFileSync(file, 'watched');
		const fileUriValue = URI.file(file).toString();

		const watch = await context.client.call<CreateResourceWatchResult>('createResourceWatch', {
			channel: ROOT_STATE_URI,
			uri: fileUriValue,
		});
		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: watch.channel });

		assert.deepStrictEqual(subscribed.snapshot?.state, {
			root: fileUriValue,
			recursive: false,
		});
	});

	conformanceTest(context, 'resource watch defaults recursive mode to false', async function () {
		await initializeClient('resource-watch-default-recursive');
		const root = createWorkspace('ahp-resource-watch-default-recursive-');
		const rootUri = URI.file(root).toString();

		const watch = await context.client.call<CreateResourceWatchResult>('createResourceWatch', {
			channel: ROOT_STATE_URI,
			uri: rootUri,
		});
		const subscribed = await context.client.call<SubscribeResult>('subscribe', { channel: watch.channel });

		assert.deepStrictEqual(subscribed.snapshot?.state, {
			root: rootUri,
			recursive: false,
		});
	});

	conformanceTest(context, 'subscribing to a malformed resource watch channel is rejected', async function () {
		await initializeClient('resource-watch-malformed');

		await assert.rejects(context.client.call('subscribe', {
			channel: 'ahp-resource-watch:/not-a-valid-descriptor',
		}));
	});

	conformanceTest(context, 'creating a resource watch for a missing root is rejected', async function () {
		await initializeClient('resource-watch-missing');
		const root = createWorkspace('ahp-resource-watch-missing-');

		await assert.rejects(context.client.call('createResourceWatch', {
			channel: ROOT_STATE_URI,
			uri: fileUri(root, 'missing'),
			recursive: true,
		}), { code: AhpErrorCodes.NotFound });
	});

	conformanceTest(context, 'resourceWrite appends at the end of a file', async function () {
		await initializeClient('resource-append');
		const root = createWorkspace('ahp-resource-append-');
		const file = fileUri(root, 'append.txt');
		writeFileSync(join(root, 'append.txt'), 'BEGIN');

		await writeText(file, '-END', { mode: ResourceWriteMode.Append });

		assert.strictEqual(readFileSync(join(root, 'append.txt'), 'utf8'), 'BEGIN-END');
	});

	conformanceTest(context, 'resourceWrite append position counts backwards from EOF', async function () {
		await initializeClient('resource-append-offset');
		const root = createWorkspace('ahp-resource-append-offset-');
		const file = fileUri(root, 'append-offset.txt');
		writeFileSync(join(root, 'append-offset.txt'), 'BEGIN-END');

		await writeText(file, '-MIDDLE', { mode: ResourceWriteMode.Append, position: 4 });

		assert.strictEqual(readFileSync(join(root, 'append-offset.txt'), 'utf8'), 'BEGIN-MIDDLE-END');
	});

	conformanceTest(context, 'resourceWrite inserts without replacing existing bytes', async function () {
		await initializeClient('resource-insert');
		const root = createWorkspace('ahp-resource-insert-');
		const file = fileUri(root, 'insert.txt');
		writeFileSync(join(root, 'insert.txt'), 'ABCD');

		await writeText(file, '12', { mode: ResourceWriteMode.Insert, position: 2 });

		assert.strictEqual(readFileSync(join(root, 'insert.txt'), 'utf8'), 'AB12CD');
	});

	conformanceTest(context, 'resourceWrite truncates from the requested position', async function () {
		await initializeClient('resource-truncate');
		const root = createWorkspace('ahp-resource-truncate-');
		const file = fileUri(root, 'truncate.txt');
		writeFileSync(join(root, 'truncate.txt'), 'PREFIX-OLD-SUFFIX');

		await writeText(file, 'NEW', { mode: ResourceWriteMode.Truncate, position: 7 });

		assert.strictEqual(readFileSync(join(root, 'truncate.txt'), 'utf8'), 'PREFIX-NEW');
	});

	conformanceTest(context, 'resourceWrite insert positions count UTF-8 bytes', async function () {
		await initializeClient('resource-insert-utf8');
		const root = createWorkspace('ahp-resource-insert-utf8-');
		const file = fileUri(root, 'insert-utf8.txt');
		writeFileSync(join(root, 'insert-utf8.txt'), 'A\u{1F600}B');

		await writeText(file, 'Z', { mode: ResourceWriteMode.Insert, position: 5 });

		assert.strictEqual(readFileSync(join(root, 'insert-utf8.txt'), 'utf8'), 'A\u{1F600}ZB');
	});

	conformanceTest(context, 'resourceWrite append positions count UTF-8 bytes from EOF', async function () {
		await initializeClient('resource-append-utf8');
		const root = createWorkspace('ahp-resource-append-utf8-');
		const file = fileUri(root, 'append-utf8.txt');
		writeFileSync(join(root, 'append-utf8.txt'), 'A\u{1F600}B');

		await writeText(file, 'Z', { mode: ResourceWriteMode.Append, position: 1 });

		assert.strictEqual(readFileSync(join(root, 'append-utf8.txt'), 'utf8'), 'A\u{1F600}ZB');
	});

	conformanceTest(context, 'resourceWrite truncate positions count UTF-8 bytes', async function () {
		await initializeClient('resource-truncate-utf8');
		const root = createWorkspace('ahp-resource-truncate-utf8-');
		const file = fileUri(root, 'truncate-utf8.txt');
		writeFileSync(join(root, 'truncate-utf8.txt'), 'A\u{1F600}B');

		await writeText(file, 'Z', { mode: ResourceWriteMode.Truncate, position: 5 });

		assert.strictEqual(readFileSync(join(root, 'truncate-utf8.txt'), 'utf8'), 'A\u{1F600}Z');
	});

	conformanceTest(context, 'resourceWrite createOnly rejects an existing file', async function () {
		await initializeClient('resource-create-only');
		const root = createWorkspace('ahp-resource-create-only-');
		const file = fileUri(root, 'existing.txt');
		writeFileSync(join(root, 'existing.txt'), 'original');

		await assert.rejects(writeText(file, 'replacement', { createOnly: true }), { code: AhpErrorCodes.AlreadyExists });
		assert.strictEqual(readFileSync(join(root, 'existing.txt'), 'utf8'), 'original');
	});

	conformanceTest(context, 'concurrent resourceWrite createOnly calls have a single winner', async function () {
		await initializeClient('resource-create-only-concurrent');
		const root = createWorkspace('ahp-resource-create-only-concurrent-');
		const file = fileUri(root, 'winner.txt');

		const results = await Promise.allSettled([
			writeText(file, 'first', { createOnly: true }),
			writeText(file, 'second', { createOnly: true }),
		]);
		const content = readFileSync(join(root, 'winner.txt'), 'utf8');
		const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');

		assert.deepStrictEqual({
			fulfilled: results.filter(result => result.status === 'fulfilled').length,
			rejected: results.filter(result => result.status === 'rejected').length,
			errorCode: rejected?.reason instanceof Error ? Reflect.get(rejected.reason, 'code') : undefined,
			validContent: content === 'first' || content === 'second',
		}, {
			fulfilled: 1,
			rejected: 1,
			errorCode: AhpErrorCodes.AlreadyExists,
			validContent: true,
		});
	});

	conformanceTest(context, 'resourceList preserves Unicode entry names', async function () {
		await initializeClient('resource-list-unicode');
		const root = createWorkspace('ahp-resource-list-unicode-');
		const name = 'smile-\u{1F600}.txt';
		writeFileSync(join(root, name), 'unicode');

		const result = await context.client.call<ResourceListResult>('resourceList', {
			channel: ROOT_STATE_URI,
			uri: URI.file(root).toString(),
		});

		assert.deepStrictEqual(result.entries, [{ name, type: ResourceType.File }]);
	});

	conformanceTest(context, 'resourceWrite ifMatch rejects a stale etag', async function () {
		await initializeClient('resource-if-match');
		const root = createWorkspace('ahp-resource-if-match-');
		const file = fileUri(root, 'etag.txt');
		writeFileSync(join(root, 'etag.txt'), 'before');
		const resolved = await context.client.call<ResourceResolveResult>('resourceResolve', {
			channel: ROOT_STATE_URI,
			uri: file,
		});
		if (resolved.etag === undefined) {
			this.skip();
		}
		await writeText(file, 'first', { ifMatch: resolved.etag });

		await assert.rejects(writeText(file, 'stale', { ifMatch: resolved.etag }), { code: AhpErrorCodes.Conflict });
		assert.strictEqual(readFileSync(join(root, 'etag.txt'), 'utf8'), 'first');
	});

	conformanceTest(context, 'resourceResolve returns a stable etag without mutation', async function () {
		await initializeClient('resource-etag-stable');
		const root = createWorkspace('ahp-resource-etag-stable-');
		const file = fileUri(root, 'stable.txt');
		writeFileSync(join(root, 'stable.txt'), 'stable');

		const first = await context.client.call<ResourceResolveResult>('resourceResolve', { channel: ROOT_STATE_URI, uri: file });
		const second = await context.client.call<ResourceResolveResult>('resourceResolve', { channel: ROOT_STATE_URI, uri: file });

		assert.deepStrictEqual({
			hasEtag: typeof first.etag === 'string',
			stable: second.etag === first.etag,
		}, {
			hasEtag: true,
			stable: true,
		});
	});

	conformanceTest(context, 'resourceResolve changes the etag after content changes', async function () {
		await initializeClient('resource-etag-change');
		const root = createWorkspace('ahp-resource-etag-change-');
		const file = fileUri(root, 'changing.txt');
		writeFileSync(join(root, 'changing.txt'), 'before');
		const before = await context.client.call<ResourceResolveResult>('resourceResolve', { channel: ROOT_STATE_URI, uri: file });

		await writeText(file, 'after-with-a-different-size');
		const after = await context.client.call<ResourceResolveResult>('resourceResolve', { channel: ROOT_STATE_URI, uri: file });

		assert.deepStrictEqual({
			hasEtags: typeof before.etag === 'string' && typeof after.etag === 'string',
			changed: before.etag !== after.etag,
		}, {
			hasEtags: true,
			changed: true,
		});
	});

	conformanceTest(context, 'resourceWrite enforces ifMatch in append mode', async function () {
		await initializeClient('resource-if-match-append');
		const root = createWorkspace('ahp-resource-if-match-append-');
		const file = fileUri(root, 'append.txt');
		writeFileSync(join(root, 'append.txt'), 'before');
		const resolved = await context.client.call<ResourceResolveResult>('resourceResolve', { channel: ROOT_STATE_URI, uri: file });
		assert.ok(resolved.etag);
		await writeText(file, 'changed');

		await assert.rejects(
			writeText(file, '-after', { mode: ResourceWriteMode.Append, ifMatch: resolved.etag }),
			{ code: AhpErrorCodes.Conflict },
		);

		assert.strictEqual(readFileSync(join(root, 'append.txt'), 'utf8'), 'changed');
	});

	conformanceTest(context, 'concurrent ifMatch writes allow only one winner', async function () {
		await initializeClient('resource-if-match-concurrent');
		const root = createWorkspace('ahp-resource-if-match-concurrent-');
		const file = fileUri(root, 'concurrent.txt');
		writeFileSync(join(root, 'concurrent.txt'), 'seed');
		const resolved = await context.client.call<ResourceResolveResult>('resourceResolve', { channel: ROOT_STATE_URI, uri: file });
		assert.ok(resolved.etag);

		const results = await Promise.allSettled([
			writeText(file, 'first-winner', { ifMatch: resolved.etag }),
			writeText(file, 'second-winner', { ifMatch: resolved.etag }),
		]);
		const content = readFileSync(join(root, 'concurrent.txt'), 'utf8');
		const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');

		assert.deepStrictEqual({
			fulfilled: results.filter(result => result.status === 'fulfilled').length,
			rejected: results.filter(result => result.status === 'rejected').length,
			errorCode: rejected?.reason instanceof Error ? Reflect.get(rejected.reason, 'code') : undefined,
			validContent: content === 'first-winner' || content === 'second-winner',
		}, {
			fulfilled: 1,
			rejected: 1,
			errorCode: AhpErrorCodes.Conflict,
			validContent: true,
		});
	});

	conformanceTest(context, 'resourceCopy failIfExists preserves the destination', async function () {
		await initializeClient('resource-copy-conflict');
		const root = createWorkspace('ahp-resource-copy-conflict-');
		writeFileSync(join(root, 'source.txt'), 'source');
		writeFileSync(join(root, 'destination.txt'), 'destination');

		await assert.rejects(context.client.call('resourceCopy', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'source.txt'),
			destination: fileUri(root, 'destination.txt'),
			failIfExists: true,
		}), { code: AhpErrorCodes.AlreadyExists });
		assert.strictEqual(readFileSync(join(root, 'destination.txt'), 'utf8'), 'destination');
	});

	conformanceTest(context, 'resourceCopy failIfExists preserves both directory trees', async function () {
		await initializeClient('resource-copy-directory-conflict');
		const root = createWorkspace('ahp-resource-copy-directory-conflict-');
		mkdirSync(join(root, 'source'));
		mkdirSync(join(root, 'destination'));
		writeFileSync(join(root, 'source', 'source.txt'), 'source');
		writeFileSync(join(root, 'destination', 'destination.txt'), 'destination');

		await assert.rejects(context.client.call('resourceCopy', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'source'),
			destination: fileUri(root, 'destination'),
			failIfExists: true,
		}), { code: AhpErrorCodes.AlreadyExists });

		assert.deepStrictEqual({
			source: readFileSync(join(root, 'source', 'source.txt'), 'utf8'),
			destination: readFileSync(join(root, 'destination', 'destination.txt'), 'utf8'),
		}, {
			source: 'source',
			destination: 'destination',
		});
	});

	conformanceTest(context, 'resourceMove failIfExists preserves both files', async function () {
		await initializeClient('resource-move-conflict');
		const root = createWorkspace('ahp-resource-move-conflict-');
		writeFileSync(join(root, 'source.txt'), 'source');
		writeFileSync(join(root, 'destination.txt'), 'destination');

		await assert.rejects(context.client.call('resourceMove', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'source.txt'),
			destination: fileUri(root, 'destination.txt'),
			failIfExists: true,
		}), { code: AhpErrorCodes.AlreadyExists });
		assert.deepStrictEqual({
			source: readFileSync(join(root, 'source.txt'), 'utf8'),
			destination: readFileSync(join(root, 'destination.txt'), 'utf8'),
		}, {
			source: 'source',
			destination: 'destination',
		});
	});

	conformanceTest(context, 'resourceMove failIfExists preserves both directory trees', async function () {
		await initializeClient('resource-move-directory-conflict');
		const root = createWorkspace('ahp-resource-move-directory-conflict-');
		mkdirSync(join(root, 'source'));
		mkdirSync(join(root, 'destination'));
		writeFileSync(join(root, 'source', 'source.txt'), 'source');
		writeFileSync(join(root, 'destination', 'destination.txt'), 'destination');

		await assert.rejects(context.client.call('resourceMove', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'source'),
			destination: fileUri(root, 'destination'),
			failIfExists: true,
		}), { code: AhpErrorCodes.AlreadyExists });

		assert.deepStrictEqual({
			source: readFileSync(join(root, 'source', 'source.txt'), 'utf8'),
			destination: readFileSync(join(root, 'destination', 'destination.txt'), 'utf8'),
		}, {
			source: 'source',
			destination: 'destination',
		});
	});

	conformanceTest(context, 'resourceMkdir rejects a path occupied by a file', async function () {
		await initializeClient('resource-mkdir-file');
		const root = createWorkspace('ahp-resource-mkdir-file-');
		const file = fileUri(root, 'occupied');
		writeFileSync(join(root, 'occupied'), 'file');

		await assert.rejects(context.client.call('resourceMkdir', {
			channel: ROOT_STATE_URI,
			uri: file,
		}), { code: AhpErrorCodes.AlreadyExists });
	});

	conformanceTest(context, 'resourceMkdir creates missing parent directories', async function () {
		await initializeClient('resource-mkdir-parents');
		const root = createWorkspace('ahp-resource-mkdir-parents-');
		const nested = join(root, 'one', 'two', 'three');

		await context.client.call('resourceMkdir', {
			channel: ROOT_STATE_URI,
			uri: URI.file(nested).toString(),
		});

		assert.strictEqual(existsSync(nested), true);
	});

	conformanceTest(context, 'resourceResolve reports directory metadata', async function () {
		await initializeClient('resource-resolve-directory');
		const root = createWorkspace('ahp-resource-resolve-directory-');
		const nested = join(root, 'directory');
		mkdirSync(nested);

		const result = await context.client.call<ResourceResolveResult>('resourceResolve', {
			channel: ROOT_STATE_URI,
			uri: URI.file(nested).toString(),
		});

		assert.deepStrictEqual({
			uri: result.uri,
			type: result.type,
			hasMtime: typeof result.mtime === 'string',
			hasCtime: typeof result.ctime === 'string',
		}, {
			uri: URI.file(nested).toString(),
			type: ResourceType.Directory,
			hasMtime: true,
			hasCtime: true,
		});
	});

	conformanceTest(context, 'resourceResolve reports binary size in bytes', async function () {
		await initializeClient('resource-resolve-binary-size');
		const root = createWorkspace('ahp-resource-resolve-binary-size-');
		const bytes = Buffer.from([0, 255, 1, 254, 2]);
		writeFileSync(join(root, 'size.bin'), bytes);

		const result = await context.client.call<ResourceResolveResult>('resourceResolve', {
			channel: ROOT_STATE_URI,
			uri: fileUri(root, 'size.bin'),
		});

		assert.strictEqual(result.size, bytes.byteLength);
	});

	conformanceTest(context, 'resourceDelete recursively removes a directory tree', async function () {
		await initializeClient('resource-delete-tree');
		const root = createWorkspace('ahp-resource-delete-tree-');
		const tree = join(root, 'tree');
		mkdirSync(join(tree, 'nested'), { recursive: true });
		writeFileSync(join(tree, 'nested', 'file.txt'), 'delete');

		await context.client.call('resourceDelete', {
			channel: ROOT_STATE_URI,
			uri: URI.file(tree).toString(),
			recursive: true,
		});

		assert.strictEqual(existsSync(tree), false);
	});

	conformanceTest(context, 'resourceDelete removes a regular file without recursive mode', async function () {
		await initializeClient('resource-delete-file');
		const root = createWorkspace('ahp-resource-delete-file-');
		const file = join(root, 'delete.txt');
		writeFileSync(file, 'delete');

		await context.client.call('resourceDelete', {
			channel: ROOT_STATE_URI,
			uri: URI.file(file).toString(),
		});

		assert.strictEqual(existsSync(file), false);
	});

	conformanceTest(context, 'resourceWrite decodes base64 content', async function () {
		await initializeClient('resource-base64');
		const root = createWorkspace('ahp-resource-base64-');
		const file = fileUri(root, 'base64.txt');

		await context.client.call('resourceWrite', {
			channel: ROOT_STATE_URI,
			uri: file,
			data: Buffer.from('BASE64_CONTENT').toString('base64'),
			encoding: ContentEncoding.Base64,
		});

		assert.strictEqual(readFileSync(join(root, 'base64.txt'), 'utf8'), 'BASE64_CONTENT');
	});

	conformanceTest(context, 'resourceWrite append creates a missing file', async function () {
		await initializeClient('resource-append-create');
		const root = createWorkspace('ahp-resource-append-create-');
		const file = fileUri(root, 'created.txt');

		await writeText(file, 'created', { mode: ResourceWriteMode.Append });

		assert.strictEqual(readFileSync(join(root, 'created.txt'), 'utf8'), 'created');
	});

	conformanceTest(context, 'resourceWrite insert creates a missing file', async function () {
		await initializeClient('resource-insert-create');
		const root = createWorkspace('ahp-resource-insert-create-');
		const file = fileUri(root, 'created.txt');

		await writeText(file, 'created', { mode: ResourceWriteMode.Insert, position: 0 });

		assert.strictEqual(readFileSync(join(root, 'created.txt'), 'utf8'), 'created');
	});

	// The host currently ignores the requested encoding; see KNOWN_ISSUES.md.
	conformanceTest(context, 'resourceRead returns requested base64 content without byte loss', async function () {
		await initializeClient('resource-read-base64');
		const root = createWorkspace('ahp-resource-read-base64-');
		const bytes = Buffer.from([0, 1, 127, 128, 254, 255]);
		writeFileSync(join(root, 'bytes.bin'), bytes);

		const result = await context.client.call<ResourceReadResult>('resourceRead', {
			channel: ROOT_STATE_URI,
			uri: fileUri(root, 'bytes.bin'),
			encoding: ContentEncoding.Base64,
		});

		assert.deepStrictEqual({
			encoding: result.encoding,
			bytes: [...Buffer.from(result.data, 'base64')],
		}, {
			encoding: ContentEncoding.Base64,
			bytes: [...bytes],
		});
	}, context.runHostOnlyKnownIssueTests);

	conformanceTest(context, 'resourceResolve returns versioned file metadata', async function () {
		await initializeClient('resource-resolve-metadata');
		const root = createWorkspace('ahp-resource-resolve-metadata-');
		const file = fileUri(root, 'metadata.txt');
		writeFileSync(join(root, 'metadata.txt'), 'metadata');

		const result = await context.client.call<ResourceResolveResult>('resourceResolve', {
			channel: ROOT_STATE_URI,
			uri: file,
			followSymlinks: false,
		});

		assert.deepStrictEqual({
			uri: result.uri,
			type: result.type,
			size: result.size,
			mtimeIsIso: typeof result.mtime === 'string' && new Date(result.mtime).toISOString() === result.mtime,
			ctimeIsIso: typeof result.ctime === 'string' && new Date(result.ctime).toISOString() === result.ctime,
			hasEtag: typeof result.etag === 'string' && result.etag.length > 0,
		}, {
			uri: file,
			type: ResourceType.File,
			size: 'metadata'.length,
			mtimeIsIso: true,
			ctimeIsIso: true,
			hasEtag: true,
		});
	});

	conformanceTest(context, 'resourceWrite createOnly atomically creates a missing file', async function () {
		await initializeClient('resource-create-only-new');
		const root = createWorkspace('ahp-resource-create-only-new-');
		const file = fileUri(root, 'created.txt');

		await writeText(file, 'created', { createOnly: true });

		assert.strictEqual(readFileSync(join(root, 'created.txt'), 'utf8'), 'created');
	});

	conformanceTest(context, 'resourceWrite createOnly supports append creation mode', async function () {
		await initializeClient('resource-create-only-append');
		const root = createWorkspace('ahp-resource-create-only-append-');
		const file = fileUri(root, 'created.txt');

		await writeText(file, 'created', { createOnly: true, mode: ResourceWriteMode.Append });

		assert.strictEqual(readFileSync(join(root, 'created.txt'), 'utf8'), 'created');
	});

	conformanceTest(context, 'resourceWrite append position beyond EOF prepends content', async function () {
		await initializeClient('resource-append-before-start');
		const root = createWorkspace('ahp-resource-append-before-start-');
		const file = fileUri(root, 'append.txt');
		writeFileSync(join(root, 'append.txt'), 'TAIL');

		await writeText(file, 'HEAD-', { mode: ResourceWriteMode.Append, position: 100 });

		assert.strictEqual(readFileSync(join(root, 'append.txt'), 'utf8'), 'HEAD-TAIL');
	});

	conformanceTest(context, 'resourceWrite insert position beyond EOF appends content', async function () {
		await initializeClient('resource-insert-after-end');
		const root = createWorkspace('ahp-resource-insert-after-end-');
		const file = fileUri(root, 'insert.txt');
		writeFileSync(join(root, 'insert.txt'), 'HEAD');

		await writeText(file, '-TAIL', { mode: ResourceWriteMode.Insert, position: 100 });

		assert.strictEqual(readFileSync(join(root, 'insert.txt'), 'utf8'), 'HEAD-TAIL');
	});

	conformanceTest(context, 'resourceWrite truncate position beyond EOF appends without padding', async function () {
		await initializeClient('resource-truncate-after-end');
		const root = createWorkspace('ahp-resource-truncate-after-end-');
		const file = fileUri(root, 'truncate.txt');
		writeFileSync(join(root, 'truncate.txt'), 'HEAD');

		await writeText(file, '-TAIL', { mode: ResourceWriteMode.Truncate, position: 100 });

		assert.strictEqual(readFileSync(join(root, 'truncate.txt'), 'utf8'), 'HEAD-TAIL');
	});

	conformanceTest(context, 'concurrent resourceWrite appends preserve every write', async function () {
		await initializeClient('resource-append-concurrent');
		const root = createWorkspace('ahp-resource-append-concurrent-');
		const file = fileUri(root, 'append.txt');
		writeFileSync(join(root, 'append.txt'), '');
		const pieces = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

		await Promise.all(pieces.map(piece => writeText(file, piece, { mode: ResourceWriteMode.Append })));

		assert.deepStrictEqual([...readFileSync(join(root, 'append.txt'), 'utf8')].sort(), pieces);
	});

	conformanceTest(context, 'resourceWrite accepts the current etag', async function () {
		await initializeClient('resource-if-match-current');
		const root = createWorkspace('ahp-resource-if-match-current-');
		const file = fileUri(root, 'etag.txt');
		writeFileSync(join(root, 'etag.txt'), 'before');
		const resolved = await context.client.call<ResourceResolveResult>('resourceResolve', {
			channel: ROOT_STATE_URI,
			uri: file,
		});
		if (resolved.etag === undefined) {
			this.skip();
		}

		await writeText(file, 'after', { ifMatch: resolved.etag });

		assert.strictEqual(readFileSync(join(root, 'etag.txt'), 'utf8'), 'after');
	});

	conformanceTest(context, 'resourceWrite ifMatch rejects a missing file', async function () {
		await initializeClient('resource-if-match-missing');
		const root = createWorkspace('ahp-resource-if-match-missing-');

		await assert.rejects(writeText(fileUri(root, 'missing.txt'), 'content', { ifMatch: 'missing-etag' }), {
			code: AhpErrorCodes.Conflict,
		});
	});

	conformanceTest(context, 'resourceCopy recursively copies a directory', async function () {
		await initializeClient('resource-copy-directory');
		const root = createWorkspace('ahp-resource-copy-directory-');
		mkdirSync(join(root, 'source', 'nested'), { recursive: true });
		writeFileSync(join(root, 'source', 'nested', 'file.txt'), 'copied');

		await context.client.call('resourceCopy', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'source'),
			destination: fileUri(root, 'destination'),
		});

		assert.strictEqual(readFileSync(join(root, 'destination', 'nested', 'file.txt'), 'utf8'), 'copied');
	});

	conformanceTest(context, 'resourceCopy preserves binary file bytes', async function () {
		await initializeClient('resource-copy-binary');
		const root = createWorkspace('ahp-resource-copy-binary-');
		const bytes = Buffer.from([0, 255, 32, 128, 64]);
		writeFileSync(join(root, 'source.bin'), bytes);

		await context.client.call('resourceCopy', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'source.bin'),
			destination: fileUri(root, 'copy.bin'),
		});

		assert.deepStrictEqual([...readFileSync(join(root, 'copy.bin'))], [...bytes]);
	});

	conformanceTest(context, 'resourceCopy overwrites an existing destination by default', async function () {
		await initializeClient('resource-copy-overwrite');
		const root = createWorkspace('ahp-resource-copy-overwrite-');
		writeFileSync(join(root, 'source.txt'), 'source');
		writeFileSync(join(root, 'destination.txt'), 'destination');

		await context.client.call('resourceCopy', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'source.txt'),
			destination: fileUri(root, 'destination.txt'),
		});

		assert.strictEqual(readFileSync(join(root, 'destination.txt'), 'utf8'), 'source');
	});

	conformanceTest(context, 'resourceCopy replaces an existing destination directory tree', async function () {
		await initializeClient('resource-copy-directory-overwrite');
		const root = createWorkspace('ahp-resource-copy-directory-overwrite-');
		mkdirSync(join(root, 'source'));
		mkdirSync(join(root, 'destination'));
		writeFileSync(join(root, 'source', 'source.txt'), 'source');
		writeFileSync(join(root, 'destination', 'stale.txt'), 'stale');

		await context.client.call('resourceCopy', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'source'),
			destination: fileUri(root, 'destination'),
		});

		assert.deepStrictEqual({
			source: readFileSync(join(root, 'destination', 'source.txt'), 'utf8'),
			staleExists: existsSync(join(root, 'destination', 'stale.txt')),
		}, {
			source: 'source',
			staleExists: false,
		});
	});

	conformanceTest(context, 'resourceCopy reports a missing source', async function () {
		await initializeClient('resource-copy-missing');
		const root = createWorkspace('ahp-resource-copy-missing-');

		await assert.rejects(context.client.call('resourceCopy', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'missing.txt'),
			destination: fileUri(root, 'destination.txt'),
		}), { code: AhpErrorCodes.NotFound });
	});

	conformanceTest(context, 'resourceMove relocates a directory tree', async function () {
		await initializeClient('resource-move-directory');
		const root = createWorkspace('ahp-resource-move-directory-');
		mkdirSync(join(root, 'source', 'nested'), { recursive: true });
		writeFileSync(join(root, 'source', 'nested', 'file.txt'), 'moved');

		await context.client.call('resourceMove', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'source'),
			destination: fileUri(root, 'destination'),
		});

		assert.deepStrictEqual({
			sourceExists: existsSync(join(root, 'source')),
			contents: readFileSync(join(root, 'destination', 'nested', 'file.txt'), 'utf8'),
		}, {
			sourceExists: false,
			contents: 'moved',
		});
	});

	conformanceTest(context, 'resourceMove preserves binary file bytes', async function () {
		await initializeClient('resource-move-binary');
		const root = createWorkspace('ahp-resource-move-binary-');
		const bytes = Buffer.from([0, 255, 32, 128, 64]);
		writeFileSync(join(root, 'source.bin'), bytes);

		await context.client.call('resourceMove', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'source.bin'),
			destination: fileUri(root, 'moved.bin'),
		});

		assert.deepStrictEqual({
			sourceExists: existsSync(join(root, 'source.bin')),
			bytes: [...readFileSync(join(root, 'moved.bin'))],
		}, {
			sourceExists: false,
			bytes: [...bytes],
		});
	});

	conformanceTest(context, 'resourceMove overwrites an existing destination by default', async function () {
		await initializeClient('resource-move-overwrite');
		const root = createWorkspace('ahp-resource-move-overwrite-');
		writeFileSync(join(root, 'source.txt'), 'source');
		writeFileSync(join(root, 'destination.txt'), 'destination');

		await context.client.call('resourceMove', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'source.txt'),
			destination: fileUri(root, 'destination.txt'),
		});

		assert.deepStrictEqual({
			sourceExists: existsSync(join(root, 'source.txt')),
			contents: readFileSync(join(root, 'destination.txt'), 'utf8'),
		}, {
			sourceExists: false,
			contents: 'source',
		});
	});

	conformanceTest(context, 'resourceMove replaces an existing destination directory tree', async function () {
		await initializeClient('resource-move-directory-overwrite');
		const root = createWorkspace('ahp-resource-move-directory-overwrite-');
		mkdirSync(join(root, 'source'));
		mkdirSync(join(root, 'destination'));
		writeFileSync(join(root, 'source', 'source.txt'), 'source');
		writeFileSync(join(root, 'destination', 'stale.txt'), 'stale');

		await context.client.call('resourceMove', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'source'),
			destination: fileUri(root, 'destination'),
		});

		assert.deepStrictEqual({
			sourceExists: existsSync(join(root, 'source')),
			content: readFileSync(join(root, 'destination', 'source.txt'), 'utf8'),
			staleExists: existsSync(join(root, 'destination', 'stale.txt')),
		}, {
			sourceExists: false,
			content: 'source',
			staleExists: false,
		});
	});

	conformanceTest(context, 'resourceMove reports a missing source', async function () {
		await initializeClient('resource-move-missing');
		const root = createWorkspace('ahp-resource-move-missing-');

		await assert.rejects(context.client.call('resourceMove', {
			channel: ROOT_STATE_URI,
			source: fileUri(root, 'missing.txt'),
			destination: fileUri(root, 'destination.txt'),
		}), { code: AhpErrorCodes.NotFound });
	});

	conformanceTest(context, 'resourceDelete requires recursive mode for a non-empty directory', async function () {
		await initializeClient('resource-delete-non-recursive');
		const root = createWorkspace('ahp-resource-delete-non-recursive-');
		const directory = join(root, 'directory');
		mkdirSync(directory);
		writeFileSync(join(directory, 'file.txt'), 'preserved');

		await assert.rejects(context.client.call('resourceDelete', {
			channel: ROOT_STATE_URI,
			uri: URI.file(directory).toString(),
		}));
		assert.strictEqual(readFileSync(join(directory, 'file.txt'), 'utf8'), 'preserved');
	});

	conformanceTest(context, 'resourceDelete reports a missing resource', async function () {
		await initializeClient('resource-delete-missing');
		const root = createWorkspace('ahp-resource-delete-missing-');

		await assert.rejects(context.client.call('resourceDelete', {
			channel: ROOT_STATE_URI,
			uri: fileUri(root, 'missing.txt'),
		}), { code: AhpErrorCodes.NotFound });
	});

	conformanceTest(context, 'resourceRead reports a missing file', async function () {
		await initializeClient('resource-read-missing');
		const root = createWorkspace('ahp-resource-read-missing-');

		await assert.rejects(context.client.call('resourceRead', {
			channel: ROOT_STATE_URI,
			uri: fileUri(root, 'missing.txt'),
		}), { code: AhpErrorCodes.NotFound });
	});

	conformanceTest(context, 'resourceList reports a missing directory', async function () {
		await initializeClient('resource-list-missing');
		const root = createWorkspace('ahp-resource-list-missing-');

		await assert.rejects(context.client.call('resourceList', {
			channel: ROOT_STATE_URI,
			uri: fileUri(root, 'missing'),
		}), { code: AhpErrorCodes.NotFound });
	});

	conformanceTest(context, 'resourceList rejects a file resource', async function () {
		await initializeClient('resource-list-file');
		const root = createWorkspace('ahp-resource-list-file-');
		const file = fileUri(root, 'file.txt');
		writeFileSync(join(root, 'file.txt'), 'content');

		await assert.rejects(context.client.call('resourceList', {
			channel: ROOT_STATE_URI,
			uri: file,
		}));
	});

	conformanceTest(context, 'resourceWrite reports a missing parent directory', async function () {
		await initializeClient('resource-write-missing-parent');
		const root = createWorkspace('ahp-resource-write-missing-parent-');

		await assert.rejects(writeText(fileUri(root, 'missing', 'file.txt'), 'content'), {
			code: AhpErrorCodes.NotFound,
		});
	});

	conformanceTest(context, 'resourceResolve reports a missing resource', async function () {
		await initializeClient('resource-resolve-missing');
		const root = createWorkspace('ahp-resource-resolve-missing-');

		await assert.rejects(context.client.call('resourceResolve', {
			channel: ROOT_STATE_URI,
			uri: fileUri(root, 'missing'),
		}), { code: AhpErrorCodes.NotFound });
	});

	conformanceTest(context, 'host reads a client-hosted plugin through reverse resource requests', async function () {
		// The plugin is published as belonging to this client, so the host
		// addresses it through the `vscode-agent-client` scheme and fetches it
		// over the connection. Both processes share a filesystem here, so it is
		// the assertion on `servedReverseRequests` — not where the directory
		// sits — that proves the reverse path was actually used.
		const pluginRoot = createWorkspace('ahp-client-plugin-');
		writeFileSync(join(pluginRoot, 'plugin.json'), JSON.stringify({ name: 'e2e-client-plugin', version: '1.0.0' }));

		const sessionUri = await createRealSession(context.client, config, `client-fs-${config.provider}`, createdSessions, URI.file(createWorkspace('ahp-client-fs-ws-')));
		context.client.clearReceived();

		context.client.dispatch({
			channel: sessionUri,
			clientSeq: 1,
			action: {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: `client-fs-${config.provider}`,
					displayName: 'Test Client',
					tools: [],
					customizations: [{
						id: generateUuid(),
						uri: URI.file(pluginRoot).toString(),
						name: 'e2e-client-plugin',
						type: CustomizationType.Plugin,
						nonce: 'nonce-1',
					}],
				},
			},
		});

		// `session/customizationUpdated` is emitted on both the success and the
		// failure path with the same `uri`, so the load state is what separates
		// "materialized from the client" from "tried and failed".
		const updated = await context.client.waitForNotification(n => {
			if (!isActionNotification(n, 'session/customizationUpdated')) {
				return false;
			}
			const customization = (getActionEnvelope(n).action as { customization?: { uri?: string; load?: { kind?: string } } }).customization;
			return customization?.uri === URI.file(pluginRoot).toString() && customization?.load?.kind !== undefined;
		}, 60_000);

		const loadKind = (getActionEnvelope(updated).action as { customization?: { load?: { kind?: string } } }).customization?.load?.kind;
		// Compare both sides through `URI`, never a raw filesystem path: `fsPath`
		// lower-cases the Windows drive letter, so a served
		// `file:///c%3A/...` and a `pluginRoot` of `C:\...` describe the same
		// directory but do not match as strings. `tmpdir()` and its canonical
		// form also differ on macOS (`/var` vs `/private/var`), so both
		// spellings of the root are accepted.
		const pluginRootPaths = [pluginRoot, realpathSync(pluginRoot)].map(path => URI.file(path).fsPath);
		const servedForPlugin = context.client.servedReverseRequests.filter(request => {
			const uri = request.uri;
			if (uri === undefined) {
				return false;
			}
			const requested = URI.parse(uri).fsPath;
			return pluginRootPaths.some(root => requested.startsWith(root));
		});

		assert.deepStrictEqual({
			loadKind,
			reachedBackToClient: servedForPlugin.length > 0,
			readThePluginFile: servedForPlugin.some(request => request.method === 'resourceRead'),
		}, {
			loadKind: CustomizationLoadStatus.Loaded,
			reachedBackToClient: true,
			readThePluginFile: true,
		}, `served reverse requests: ${JSON.stringify(context.client.servedReverseRequests)}`);
	});
}
