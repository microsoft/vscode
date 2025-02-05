/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWebUIService, WebUIOptions } from '../common/webuiService.js';

export class WebUIDesktopService implements IWebUIService {
	readonly _serviceBrand: undefined;

	constructor() { }

	async openChat(options?: WebUIOptions): Promise<void> {
		// Delegate to workbench service
	}
}
