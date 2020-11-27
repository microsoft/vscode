/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createChannelSender } from 'vs/base/parts/ipc/common/ipc';
import { IExtensionUrlTrustService } from 'vs/platform/extensionManagement/common/extensionUrlTrust';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';

class ExtensionUrlTrustService implements IExtensionUrlTrustService {

	declare readonly _serviceBrand: undefined;
	private service: IExtensionUrlTrustService;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		this.service = createChannelSender<IExtensionUrlTrustService>(mainProcessService.getChannel('extensionUrlTrust'));
	}

	isExtensionUrlTrusted(extensionId: string, url: string): Promise<boolean> {
		return this.service.isExtensionUrlTrusted(extensionId, url);
	}
}

registerSingleton(IExtensionUrlTrustService, ExtensionUrlTrustService);
