/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHostService } from 'vs/workbench/services/host/browser/host';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class BrowserHostService implements IHostService {

	_serviceBrand: undefined;

	//#region Window

	readonly windowCount = Promise.resolve(1);

	//#endregion

	async restart(): Promise<void> {
		window.location.reload();
	}
}

registerSingleton(IHostService, BrowserHostService, true);
