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
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import type {
	ResourceListResult,
	ResourceReadResult,
	ResourceResolveResult,
} from '../../../../common/state/protocol/commands.js';
import { ContentEncoding, ResourceType } from '../../../../common/state/protocol/common/commands.js';
import { ActionType } from '../../../../common/state/sessionActions.js';
import { CustomizationLoadStatus, CustomizationType, ROOT_STATE_URI } from '../../../../common/state/sessionState.js';
import { createRealSession } from '../harness/agentHostE2ETestHarness.js';
import { getActionEnvelope, isActionNotification } from '../../serverIntegrationTestHelpers.js';
import { conformanceTest, type IAgentHostE2ETestContext } from './e2eTestContext.js';

export function defineClientFilesystemTests(context: IAgentHostE2ETestContext): void {
	const { config, createdSessions, tempDirs } = context;

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

	conformanceTest(context, 'createResourceWatch returns a subscribable watch channel', async function () {
		await initializeClient('resource-watch');
		const root = createWorkspace('ahp-resource-watch-');

		// `CreateResourceWatchResult.channel` is declared as a `URI`, but it
		// crosses the wire as a string, so it is typed here as what actually
		// arrives rather than what the declaration promises.
		const watch = await context.client.call<{ channel: string }>('createResourceWatch', {
			channel: ROOT_STATE_URI, uri: URI.file(root).toString(), recursive: true,
		});

		assert.strictEqual(URI.parse(watch.channel).scheme, 'ahp-resource-watch');
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
						enabled: true,
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
