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

	async openEmptyWindow(options?: { reuse?: boolean }): Promise<void> {
		// TODO@Ben delegate to embedder
		const targetHref = `${document.location.origin}${document.location.pathname}?ew=true`;
		if (options && options.reuse) {
			window.location.href = targetHref;
		} else {
			window.open(targetHref);
		}
	}

	//#endregion

	async restart(): Promise<void> {
		window.location.reload();
	}
}

registerSingleton(IHostService, BrowserHostService, true);
