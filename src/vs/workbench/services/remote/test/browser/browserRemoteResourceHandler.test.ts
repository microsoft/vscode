/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { BrowserResourceService } from '../../../../../platform/files/browser/browserResourceService.js';
import { createFileSystemProviderError, FileOperationError, FileOperationResult, FileSystemProviderErrorCode, IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { IRemoteResourceRequest } from '../../../../browser/web.api.js';
import { BrowserRemoteResourceLoader } from '../../browser/browserRemoteResourceHandler.js';

suite('BrowserRemoteResourceLoader', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createLoader(readError?: Error) {
		const requests = store.add(new Emitter<IRemoteResourceRequest>());
		const reads: URI[] = [];
		const fileService = new class extends mock<IFileService>() {
			override async readFile(resource: URI): Promise<IFileContent> {
				reads.push(resource);
				if (readError) {
					throw readError;
				}
				return {
					resource, name: 'image.png', mtime: 0, ctime: 0, size: 5, etag: '',
					readonly: true, locked: false, executable: false, value: VSBuffer.fromString('image'),
				};
			}
		}();
		const browserResources = store.add(new BrowserResourceService((id, resource) => URI.from({
			scheme: 'https', authority: 'workbench.test', path: '/resource', query: new URLSearchParams({ resourceId: id }).toString(), fragment: resource.fragment,
		}), fileService));
		store.add(browserResources.registerScheme(AGENT_HOST_SCHEME));
		store.add(new BrowserRemoteResourceLoader({ path: '/resource', onDidReceiveRequest: requests.event }, fileService, browserResources));

		async function request(uri: URI) {
			const response = new DeferredPromise<{ status: number; text: string; headers: Record<string, string> }>();
			requests.fire({
				uri, respondWith: (status, body, headers) => response.complete({ status, text: VSBuffer.wrap(body).toString(), headers }),
			});
			return response.p;
		}
		return { reads, request };
	}

	test('loads Agent Host resources using their full original identity', async () => {
		const { reads, request } = createLoader();
		const resource = toAgentHostUri(URI.parse('file:///project/my%20image.png?version=2#fragment'), 'sandbox');
		const browserUri = FileAccess.uriToBrowserUri(resource);
		const response = await request(browserUri);
		const rejected = await request(browserUri.with({ query: 'resourceId=forged&scheme=file' }));
		assert.deepStrictEqual({ response, rejected, reads: reads.map(uri => uri.toString()) }, {
			response: { status: 200, text: 'image', headers: { 'content-type': 'image/png' } },
			rejected: { status: 404, text: '', headers: {} },
			reads: [resource.toString()],
		});
	});

	test('preserves existing embedder remote-resource requests', async () => {
		const { reads, request } = createLoader();
		const resource = URI.parse('vscode-remote://ssh-host/project/image.png');
		const response = await request(URI.parse('https://workbench.test/resource').with({ query: JSON.stringify(resource) }));
		assert.deepStrictEqual({ response, reads: reads.map(uri => uri.toString()) }, {
			response: { status: 200, text: 'image', headers: { 'content-type': 'image/png' } },
			reads: [resource.toString()],
		});
	});

	for (const { error, status } of [
		{ error: new FileOperationError('Missing image', FileOperationResult.FILE_NOT_FOUND), status: 404 },
		{ error: createFileSystemProviderError('Sandbox offline', FileSystemProviderErrorCode.Unavailable), status: 500 },
		{ error: createFileSystemProviderError('Image read denied', FileSystemProviderErrorCode.NoPermissions), status: 500 },
	]) {
		test(`returns a resource failure without reporting a product error: ${error.message}`, async () => {
			const { request } = createLoader(error);
			const resource = toAgentHostUri(URI.file('/project/image.png'), 'sandbox');
			const response = await request(FileAccess.uriToBrowserUri(resource));
			assert.deepStrictEqual(response, { status, text: error.message, headers: {} });
		});
	}
});
