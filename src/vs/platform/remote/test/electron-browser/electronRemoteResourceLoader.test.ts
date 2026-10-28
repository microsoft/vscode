/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { FileAccess, Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createFileSystemProviderError, FileOperationError, FileOperationResult, FileSystemProviderErrorCode, IFileContent, IFileService } from '../../../files/common/files.js';
import { IMainProcessService } from '../../../ipc/common/mainProcessService.js';
import { NODE_REMOTE_RESOURCE_CHANNEL_NAME, NODE_REMOTE_RESOURCE_IPC_METHOD_NAME, NodeRemoteResourceResponse } from '../../common/electronRemoteResources.js';
import { createBrowserResourceUriProvider, ElectronRemoteResourceLoader } from '../../electron-browser/electronRemoteResourceLoader.js';
import { BrowserResourceService } from '../../../files/browser/browserResourceService.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../agentHost/common/agentHostUri.js';

suite('ElectronRemoteResourceLoader', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createLoader(windowId = 7, readError?: Error) {
		let channel: IServerChannel | undefined;
		const mainProcessService = new class extends mock<IMainProcessService>() {
			override registerChannel(channelName: string, registeredChannel: IServerChannel): void {
				assert.strictEqual(channelName, NODE_REMOTE_RESOURCE_CHANNEL_NAME);
				channel = registeredChannel;
			}
		}();
		const reads: URI[] = [];
		const fileService = new class extends mock<IFileService>() {
			override async readFile(resource: URI): Promise<IFileContent> {
				reads.push(resource);
				if (readError) {
					throw readError;
				}
				return {
					resource,
					name: 'resource.txt',
					mtime: 0,
					ctime: 0,
					etag: '',
					size: 7,
					readonly: false,
					locked: false,
					executable: false,
					value: VSBuffer.fromString('content'),
				};
			}
		}();
		const browserResources = store.add(new BrowserResourceService(createBrowserResourceUriProvider(windowId), fileService));
		const loader = store.add(new ElectronRemoteResourceLoader(windowId, mainProcessService, fileService, browserResources));
		assert.ok(channel);
		return { loader, channel, reads, browserResources };
	}

	async function request(channel: IServerChannel, uri: URI): Promise<NodeRemoteResourceResponse> {
		return channel.call('', NODE_REMOTE_RESOURCE_IPC_METHOD_NAME, [uri]);
	}

	test('loads provider-generated remote resources as vscode-remote', async () => {
		const { loader, channel, reads } = createLoader();
		const remoteResource = URI.from({
			scheme: Schemas.vscodeRemote,
			authority: 'ssh-remote+example',
			path: '/resource.txt',
		});
		const managedResource = loader.getResourceUriProvider()(remoteResource);

		const response = await request(channel, managedResource);

		assert.deepStrictEqual({
			response,
			reads: reads.map(resource => ({
				scheme: resource.scheme,
				authority: resource.authority,
				path: resource.path,
			})),
		}, {
			response: {
				statusCode: 200,
				body: 'Y29udGVudA==',
				mimeType: 'text/plain',
			},
			reads: [{
				scheme: Schemas.vscodeRemote,
				authority: 'ssh-remote+example',
				path: '/resource.txt',
			}],
		});
	});

	test('ignores downstream scheme substitution', async () => {
		const { loader, channel, reads } = createLoader();
		const managedResource = loader.getResourceUriProvider()(URI.from({
			scheme: Schemas.vscodeRemote,
			authority: 'ssh-remote+example',
			path: '/resource.txt',
		}));
		const params = new URLSearchParams(managedResource.query);
		params.set('scheme', Schemas.file);

		const response = await request(channel, managedResource.with({ query: params.toString() }));

		assert.deepStrictEqual({
			response,
			reads: reads.map(resource => ({
				scheme: resource.scheme,
				authority: resource.authority,
				path: resource.path,
			})),
		}, {
			response: {
				statusCode: 200,
				body: 'Y29udGVudA==',
				mimeType: 'text/plain',
			},
			reads: [{
				scheme: Schemas.vscodeRemote,
				authority: 'ssh-remote+example',
				path: '/resource.txt',
			}],
		});
	});

	test('rejects requests without a remote authority before reading', async () => {
		const { channel, reads } = createLoader();
		const forgedResource = URI.from({
			scheme: Schemas.vscodeManagedRemoteResource,
			authority: 'window:7',
			path: '/resource.txt',
			query: new URLSearchParams({ scheme: Schemas.file }).toString(),
		});

		const response = await request(channel, forgedResource);

		assert.deepStrictEqual({ response, reads }, {
			response: { statusCode: 404, body: '' },
			reads: [],
		});
	});

	test('loads issued Agent Host resources through FileAccess with their complete identity', async () => {
		const { channel, reads, browserResources } = createLoader();
		store.add(browserResources.registerScheme(AGENT_HOST_SCHEME));
		const resource = toAgentHostUri(URI.parse('git-blob:///project/image.png?ref=HEAD#part'), 'sandbox');
		const browserUri = FileAccess.uriToBrowserUri(resource);
		const response = await request(channel, browserUri);
		const forged = browserUri.with({ path: '/other.txt', query: 'resourceId=unknown&scheme=file&authority=local' });
		const rejected = await request(channel, forged);

		assert.deepStrictEqual({ scheme: browserUri.scheme, authority: browserUri.authority, response, rejected, reads: reads.map(uri => uri.toString()) }, {
			scheme: Schemas.vscodeManagedRemoteResource,
			authority: 'window:7',
			response: { statusCode: 200, body: 'Y29udGVudA==', mimeType: 'image/png' },
			rejected: { statusCode: 404, body: '' },
			reads: [resource.toString()],
		});
	});

	test('an issued resource cannot be redirected by substituting its path or scheme', async () => {
		const { channel, reads, browserResources } = createLoader();
		store.add(browserResources.registerScheme(AGENT_HOST_SCHEME));
		const resource = toAgentHostUri(URI.file('/project/image.png'), 'sandbox');
		const browserUri = FileAccess.uriToBrowserUri(resource);
		await request(channel, browserUri.with({ path: '/secrets.txt', query: `${browserUri.query}&scheme=file&authority=local` }));
		assert.deepStrictEqual(reads.map(uri => uri.toString()), [resource.toString()]);
	});

	for (const { error, statusCode } of [
		{ error: new FileOperationError('Missing image', FileOperationResult.FILE_NOT_FOUND), statusCode: 404 },
		{ error: createFileSystemProviderError('Sandbox offline', FileSystemProviderErrorCode.Unavailable), statusCode: 500 },
		{ error: createFileSystemProviderError('Image read denied', FileSystemProviderErrorCode.NoPermissions), statusCode: 500 },
	]) {
		test(`returns a resource failure without reporting a product error: ${error.message}`, async () => {
			const { channel, browserResources } = createLoader(7, error);
			store.add(browserResources.registerScheme(AGENT_HOST_SCHEME));
			const resource = toAgentHostUri(URI.file('/project/image.png'), 'sandbox');
			const response = await request(channel, FileAccess.uriToBrowserUri(resource));
			assert.deepStrictEqual({ statusCode: response.statusCode, message: decodeBase64(response.body).toString() }, { statusCode, message: error.message });
		});
	}
});
