/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, encodeBase64 } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { getMediaOrTextMime } from '../../../base/common/mime.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService } from '../../files/common/files.js';
import { IBrowserResourceService } from '../../files/common/browserResourceService.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { NODE_REMOTE_RESOURCE_CHANNEL_NAME, NODE_REMOTE_RESOURCE_IPC_METHOD_NAME, NodeRemoteResourceResponse } from '../common/electronRemoteResources.js';

export class ElectronRemoteResourceLoader extends Disposable {
	constructor(
		private readonly windowId: number,
		@IMainProcessService mainProcessService: IMainProcessService,
		@IFileService private readonly fileService: IFileService,
		@IBrowserResourceService private readonly browserResourceService: IBrowserResourceService,
	) {
		super();

		const channel: IServerChannel = {
			listen<T>(_: unknown, event: string): Event<T> {
				throw new Error(`Event not found: ${event}`);
			},

			call: (_: unknown, command: string, arg?: any): Promise<any> => {
				switch (command) {
					case NODE_REMOTE_RESOURCE_IPC_METHOD_NAME: return this.doRequest(URI.revive(arg[0]));
				}

				throw new Error(`Call not found: ${command}`);
			}
		};

		mainProcessService.registerChannel(NODE_REMOTE_RESOURCE_CHANNEL_NAME, channel);
	}

	private async doRequest(uri: URI): Promise<NodeRemoteResourceResponse> {
		if (uri.scheme !== Schemas.vscodeManagedRemoteResource || uri.authority !== `window:${this.windowId}`) {
			return { statusCode: 404, body: '' };
		}
		const params = new URLSearchParams(uri.query);
		const resourceId = params.get('resourceId');
		if (resourceId !== null) {
			try {
				const result = await this.browserResourceService.read(resourceId);
				return result ? { statusCode: 200, body: encodeBase64(result.content), mimeType: result.mimeType } : { statusCode: 404, body: '' };
			} catch (error) {
				return {
					statusCode: error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND ? 404 : 500,
					body: encodeBase64(VSBuffer.fromString(toErrorMessage(error))),
				};
			}
		}
		const authority = params.get('authority');
		if (!authority) {
			return { statusCode: 404, body: '' };
		}

		let content: IFileContent;
		try {
			const actual = uri.with({
				scheme: Schemas.vscodeRemote,
				authority,
				query: '',
			});
			content = await this.fileService.readFile(actual);
		} catch (e) {
			const str = encodeBase64(VSBuffer.fromString(e.message));
			if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				return { statusCode: 404, body: str };
			} else {
				return { statusCode: 500, body: str };
			}
		}

		const mimeType = uri.path && getMediaOrTextMime(uri.path);
		return { statusCode: 200, body: encodeBase64(content.value), mimeType };
	}

	public getResourceUriProvider() {
		return (uri: URI) => uri.with({
			scheme: Schemas.vscodeManagedRemoteResource,
			authority: `window:${this.windowId}`,
			query: new URLSearchParams({ authority: uri.authority, scheme: uri.scheme }).toString(),
		});
	}
}

export function createBrowserResourceUriProvider(windowId: number): (resourceId: string, resource: URI) => URI {
	return (resourceId, resource) => resource.with({
		scheme: Schemas.vscodeManagedRemoteResource,
		authority: `window:${windowId}`,
		query: new URLSearchParams({ resourceId }).toString(),
	});
}
