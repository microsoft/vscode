/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IBrowserViewWorkbenchService, IBrowserViewCDPService, IBrowserViewModel } from '../common/browserView.js';
import { Event } from '../../../../base/common/event.js';
import { CDPEvent, CDPRequest, CDPResponse } from '../../../../platform/browserView/common/cdp/types.js';

class WebBrowserViewWorkbenchService implements IBrowserViewWorkbenchService {
	declare readonly _serviceBrand: undefined;

	async getOrCreateBrowserViewModel(_id: string): Promise<IBrowserViewModel> {
		throw new Error('Integrated Browser is not available in web.');
	}

	async getBrowserViewModel(_id: string): Promise<IBrowserViewModel> {
		throw new Error('Integrated Browser is not available in web.');
	}

	async clearGlobalStorage(): Promise<void> { }
	async clearWorkspaceStorage(): Promise<void> { }
}

class WebBrowserViewCDPService implements IBrowserViewCDPService {
	declare readonly _serviceBrand: undefined;

	async createSessionGroup(_browserId: string): Promise<string> {
		throw new Error('Integrated Browser is not available in web.');
	}

	async destroySessionGroup(_groupId: string): Promise<void> { }

	async sendCDPMessage(_groupId: string, _message: CDPRequest): Promise<void> { }

	onCDPMessage(_groupId: string): Event<CDPResponse | CDPEvent> {
		return Event.None;
	}

	onDidDestroy(_groupId: string): Event<void> {
		return Event.None;
	}
}

registerSingleton(IBrowserViewWorkbenchService, WebBrowserViewWorkbenchService, InstantiationType.Delayed);
registerSingleton(IBrowserViewCDPService, WebBrowserViewCDPService, InstantiationType.Delayed);
