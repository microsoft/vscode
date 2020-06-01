/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webContents } from 'electron';
import { IWebviewManagerService, RegisterWebviewMetadata } from 'vs/platform/webview/common/webviewManagerService';
import { WebviewProtocolProvider } from 'vs/platform/webview/electron-main/webviewProtocolProvider';
import { IFileService } from 'vs/platform/files/common/files';
import { UriComponents, URI } from 'vs/base/common/uri';

export class WebviewMainService implements IWebviewManagerService {

	_serviceBrand: undefined;

	private protocolProvider: WebviewProtocolProvider;

	constructor(
		@IFileService fileService: IFileService,
	) {
		this.protocolProvider = new WebviewProtocolProvider(fileService);
	}

	public async registerWebview(id: string, metadata: RegisterWebviewMetadata): Promise<void> {
		this.protocolProvider.registerWebview(id,
			metadata.extensionLocation ? URI.from(metadata.extensionLocation) : undefined,
			metadata.localResourceRoots.map((x: UriComponents) => URI.from(x))
		);
	}

	public async unregisterWebview(id: string): Promise<void> {
		this.protocolProvider.unreigsterWebview(id);
	}

	public async updateLocalResourceRoots(id: string, roots: UriComponents[]): Promise<void> {
		this.protocolProvider.updateLocalResourceRoots(id, roots.map((x: UriComponents) => URI.from(x)));
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
