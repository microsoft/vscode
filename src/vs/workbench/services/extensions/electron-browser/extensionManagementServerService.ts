/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IExtensionManagementServer, IExtensionManagementServerService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/node/extensionManagementIpc';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

const localExtensionManagementServerAuthority: string = 'vscode-local';

export class ExtensionManagementServerService implements IExtensionManagementServerService {

	_serviceBrand: any;

	readonly localExtensionManagementServer: IExtensionManagementServer;
	readonly remoteExtensionManagementServer: IExtensionManagementServer | null = null;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService
	) {
		const localExtensionManagementService = new ExtensionManagementChannelClient(sharedProcessService.getChannel('extensions'));

		this.localExtensionManagementServer = { extensionManagementService: localExtensionManagementService, authority: localExtensionManagementServerAuthority, label: localize('local', "Local") };
		const remoteAgentConnection = remoteAgentService.getConnection();
		if (remoteAgentConnection) {
			const extensionManagementService = new ExtensionManagementChannelClient(remoteAgentConnection.getChannel<IChannel>('extensions'));
			this.remoteExtensionManagementServer = { authority: remoteAgentConnection.remoteAuthority, extensionManagementService, label: localize('remote', "Remote") };
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