/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeHostService } from '../../..//platform/native/common/native.js';
import { IWebUIService } from '../../../platform/webui/common/webuiService.js';

export class WebUIMainService implements IWebUIService {
	declare readonly _serviceBrand: undefined;

	constructor(@INativeHostService private readonly nativeHostService: INativeHostService) { }

	async openChat(): Promise<void> {
		await this.nativeHostService.openExternal('http://localhost:3000');
	}
}
