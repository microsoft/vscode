/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWebUIService, WebUIOptions } from '../common/webuiService.js';

export class WebUIDesktopService implements IWebUIService {
	readonly _serviceBrand: undefined;

	constructor() { }

	async openChat(options?: WebUIOptions): Promise<void> {
		// Delegate to workbench service
	}
}
