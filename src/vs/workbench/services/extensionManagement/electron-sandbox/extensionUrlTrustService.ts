/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionUrlTrustService } from 'vs/platform/extensionManagement/common/extensionUrlTrust';
import { ExtensionUrlTrustChannelClient } from 'vs/platform/extensionManagement/common/extensionUrlTrustIpc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';

class ExtensionUrlTrustService extends ExtensionUrlTrustChannelClient {

	declare readonly _serviceBrand: undefined;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		super(mainProcessService.getChannel('extensionUrlTrust'));
	}
}

registerSingleton(IExtensionUrlTrustService, ExtensionUrlTrustService);
