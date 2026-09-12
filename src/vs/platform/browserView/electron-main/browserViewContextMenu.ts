/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { MenuItemConstructorOptions } from 'electron';
import { localize } from '../../../nls.js';
import type { ILogService } from '../../log/common/log.js';
import { type IBrowserViewExternalPresentation, isExternalCanvasLinkAllowed } from '../common/browserView.js';

export function createBrowserViewExternalLinkMenuItem(
	presentation: IBrowserViewExternalPresentation | undefined,
	url: string,
	openExternal: (url: string) => Promise<boolean>,
	logService: ILogService,
): MenuItemConstructorOptions {
	const isAllowed = () => !presentation || isExternalCanvasLinkAllowed(url);
	return {
		label: localize('browser.contextMenu.openLinkInExternalBrowser', "Open Link in External Browser"),
		enabled: isAllowed(),
		click: () => {
			if (!isAllowed()) {
				logService.warn('Blocked an unsupported external canvas link.');
				return;
			}
			void openExternal(url).catch(error => logService.error('Failed to open an external browser link.', error));
		},
	};
}
