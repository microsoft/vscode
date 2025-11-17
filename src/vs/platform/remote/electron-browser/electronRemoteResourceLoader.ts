/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer, encodeBase64 } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { getMediaOrTextMime } from '../../../base/common/mime.js';
import { Schemas } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService } from '../../files/common/files.js';
import { IMainProcessService } from '../../ipc/common/mainProcessService.js';
import { NODE_REMOTE_RESOURCE_CHANNEL_NAME, NODE_REMOTE_RESOURCE_IPC_METHOD_NAME, NodeRemoteResourceResponse } from '../common/electronRemoteResources.js';

export class ElectronRemoteResourceLoader extends Disposable {
	constructor(
		private readonly windowId: number,
		@IMainProcessService mainProcessService: IMainProcessService,
		@IFileService private readonly fileService: IFileService,
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
		let content: IFileContent;
		try {
			const params = new URLSearchParams(uri.query);
			const actual = uri.with({
				scheme: params.get('scheme')!,
				authority: params.get('authority')!,
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
