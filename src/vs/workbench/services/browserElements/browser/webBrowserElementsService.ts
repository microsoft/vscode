/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BrowserType, IElementData } from '../../../../platform/browserElements/common/browserElements.js';
import { IRectangle } from '../../../../platform/window/common/window.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IBrowserElementsService } from './browserElementsService.js';

class WebBrowserElementsService implements IBrowserElementsService {
	_serviceBrand: undefined;

	constructor() { }

	async getElementData(rect: IRectangle, token: CancellationToken): Promise<IElementData | undefined> {
		throw new Error('Not implemented');
	}

	startDebugSession(token: CancellationToken, browserType: BrowserType): Promise<void> {
		throw new Error('Not implemented');
	}
}

registerSingleton(IBrowserElementsService, WebBrowserElementsService, InstantiationType.Delayed);
