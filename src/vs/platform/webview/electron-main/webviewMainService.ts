/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { webContents } from 'electron';
import { IWebviewMainService } from 'vs/platform/webview/common/webviewMainService';

export class WebviewMainService implements IWebviewMainService {

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
