/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webContents } from 'electron';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { IRequestService } from 'vs/platform/request/common/request';
import { IWebviewManagerService, RegisterWebviewMetadata } from 'vs/platform/webview/common/webviewManagerService';
import { WebviewProtocolProvider } from 'vs/platform/webview/electron-main/webviewProtocolProvider';

export class WebviewMainService implements IWebviewManagerService {

	declare readonly _serviceBrand: undefined;

	private protocolProvider: WebviewProtocolProvider;

	constructor(
		@IFileService fileService: IFileService,
		@IRequestService requestService: IRequestService,
	) {
		this.protocolProvider = new WebviewProtocolProvider(fileService, requestService);
	}

	public async registerWebview(id: string, metadata: RegisterWebviewMetadata): Promise<void> {
		this.protocolProvider.registerWebview(id, {
			...metadata,
			extensionLocation: metadata.extensionLocation ? URI.from(metadata.extensionLocation) : undefined,
			localResourceRoots: metadata.localResourceRoots.map(x => URI.from(x))
		});
	}

	public async unregisterWebview(id: string): Promise<void> {
		this.protocolProvider.unreigsterWebview(id);
	}

	public async updateWebviewMetadata(id: string, metadataDelta: Partial<RegisterWebviewMetadata>): Promise<void> {
		this.protocolProvider.updateWebviewMetadata(id, {
			...metadataDelta,
			localResourceRoots: metadataDelta.localResourceRoots?.map(x => URI.from(x)),
			extensionLocation: metadataDelta.extensionLocation ? URI.from(metadataDelta.extensionLocation) : undefined,
		});
	}

	public async setIgnoreMenuShortcuts(webContentsId: number, enabled: boolean): Promise<void> {
		const contents = webContents.fromId(webContentsId);
		if (!contents) {
			throw new Error(`Invalid webContentsId: ${webContentsId}`);
		}
		if (!contents.isDestroyed()) {
			contents.setIgnoreMenuShortcuts(enabled);
		}
	}
}
