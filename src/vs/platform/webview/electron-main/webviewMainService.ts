/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webContents } from 'electron';
import { IWebviewManagerService } from 'vs/platform/webview/common/webviewManagerService';

export class WebviewMainService implements IWebviewManagerService {

	_serviceBrand: undefined;

	public setIgnoreMenuShortcuts(webContentsId: number, enabled: boolean): void {
		const contents = webContents.fromId(webContentsId);
		if (!contents) {
			throw new Error(`Invalid webContentsId: ${webContentsId}`);
		}
		if (!contents.isDestroyed()) {
			contents.setIgnoreMenuShortcuts(enabled);
		}
	}
}
