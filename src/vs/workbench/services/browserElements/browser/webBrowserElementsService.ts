/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IElementData, IBrowserTargetLocator } from '../../../../platform/browserElements/common/browserElements.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IBrowserElementsService } from './browserElementsService.js';

class WebBrowserElementsService implements IBrowserElementsService {
	_serviceBrand: undefined;

	constructor() { }

	async getElementData(rect: IRectangle, token: CancellationToken, locator: IBrowserTargetLocator | undefined): Promise<IElementData | undefined> {
		throw new Error('Not implemented');
	}

	async startDebugSession(token: CancellationToken, locator: IBrowserTargetLocator): Promise<void> {
		throw new Error('Not implemented');
	}
}

registerSingleton(IBrowserElementsService, WebBrowserElementsService, InstantiationType.Delayed);
