/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IFileContent, IFileService } from '../../../files/common/files.js';
import { IMainProcessService } from '../../../ipc/common/mainProcessService.js';
import { NODE_REMOTE_RESOURCE_CHANNEL_NAME, NODE_REMOTE_RESOURCE_IPC_METHOD_NAME, NodeRemoteResourceResponse } from '../../common/electronRemoteResources.js';
import { ElectronRemoteResourceLoader } from '../../electron-browser/electronRemoteResourceLoader.js';

suite('ElectronRemoteResourceLoader', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createLoader(windowId = 7) {
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
		const loader = store.add(new ElectronRemoteResourceLoader(windowId, mainProcessService, fileService));
		assert.ok(channel);
		return { loader, channel, reads };
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
});
