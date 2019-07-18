/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { IExtensionManagementServer, IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILabelService } from 'vs/platform/label/common/label';

export class ExtensionManagementServerService implements IExtensionManagementServerService {

	_serviceBrand: any;

	readonly localExtensionManagementServer: IExtensionManagementServer | null = null;
	readonly remoteExtensionManagementServer: IExtensionManagementServer | null = null;

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ILabelService labelService: ILabelService,
	) {
		const remoteAgentConnection = remoteAgentService.getConnection();
		if (remoteAgentConnection) {
			const extensionManagementService = new ExtensionManagementChannelClient(remoteAgentConnection!.getChannel<IChannel>('extensions'));
			this.remoteExtensionManagementServer = {
				authority: remoteAgentConnection.remoteAuthority, extensionManagementService,
				get label() { return labelService.getHostLabel(REMOTE_HOST_SCHEME, remoteAgentConnection!.remoteAuthority) || localize('remote', "Remote"); }
			};
		}
	}

	getExtensionManagementServer(location: URI): IExtensionManagementServer | null {
		if (location.scheme === REMOTE_HOST_SCHEME) {
			return this.remoteExtensionManagementServer;
		}
		return null;
	}
}

registerSingleton(IExtensionManagementServerService, ExtensionManagementServerService);