/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionManagementServer, IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { RemoteExtensionManagementChannelClient } from 'vs/workbench/services/extensions/electron-browser/remoteExtensionManagementIpc';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProductService } from 'vs/platform/product/common/product';
import { ILabelService } from 'vs/platform/label/common/label';

const localExtensionManagementServerAuthority: string = 'vscode-local';

export class ExtensionManagementServerService implements IExtensionManagementServerService {

	_serviceBrand: any;

	readonly localExtensionManagementServer: IExtensionManagementServer;
	readonly remoteExtensionManagementServer: IExtensionManagementServer | null = null;
	readonly isSingleServer: boolean = false;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IExtensionGalleryService galleryService: IExtensionGalleryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IProductService productService: IProductService,
		@ILogService logService: ILogService,
		@ILabelService labelService: ILabelService,
	) {
		const localExtensionManagementService = new ExtensionManagementChannelClient(sharedProcessService.getChannel('extensions'));

		this.localExtensionManagementServer = { extensionManagementService: localExtensionManagementService, authority: localExtensionManagementServerAuthority, label: localize('local', "Local") };
		const remoteAgentConnection = remoteAgentService.getConnection();
		if (remoteAgentConnection) {
			const extensionManagementService = new RemoteExtensionManagementChannelClient(remoteAgentConnection.getChannel<IChannel>('extensions'), this.localExtensionManagementServer.extensionManagementService, galleryService, logService, configurationService, productService);
			this.remoteExtensionManagementServer = {
				authority: remoteAgentConnection.remoteAuthority, extensionManagementService,
				get label() { return labelService.getHostLabel(REMOTE_HOST_SCHEME, remoteAgentConnection!.remoteAuthority) || localize('remote', "Remote"); }
			};
		}
	}

	getExtensionManagementServer(location: URI): IExtensionManagementServer | null {
		if (location.scheme === Schemas.file) {
			return this.localExtensionManagementServer;
		}
		if (location.scheme === REMOTE_HOST_SCHEME) {
			return this.remoteExtensionManagementServer;
		}
		return null;
	}
}

registerSingleton(IExtensionManagementServerService, ExtensionManagementServerService);