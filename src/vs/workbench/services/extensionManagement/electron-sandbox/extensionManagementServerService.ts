/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Schemas } from 'vs/base/common/network';
import { IExtensionManagementServer, IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { NativeRemoteExtensionManagementService } from 'vs/workbench/services/extensionManagement/electron-sandbox/remoteExtensionManagementService';
import { ILabelService } from 'vs/platform/label/common/label';
import { IExtension } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { getTargetPlatformFromOS, CURRENT_TARGET_PLATFORM } from 'vs/platform/extensionManagement/common/extensionManagement';

export class ExtensionManagementServerService implements IExtensionManagementServerService {

	declare readonly _serviceBrand: undefined;

	private readonly _localExtensionManagementServer: IExtensionManagementServer;
	public get localExtensionManagementServer(): IExtensionManagementServer { return this._localExtensionManagementServer; }
	readonly remoteExtensionManagementServer: IExtensionManagementServer | null = null;
	readonly webExtensionManagementServer: IExtensionManagementServer | null = null;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ILabelService labelService: ILabelService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		const localExtensionManagementService = new ExtensionManagementChannelClient(sharedProcessService.getChannel('extensions'));

		this._localExtensionManagementServer = { extensionManagementService: localExtensionManagementService, id: 'local', label: localize('local', "Local"), getTargetPlatform() { return Promise.resolve(CURRENT_TARGET_PLATFORM); } };
		const remoteAgentConnection = remoteAgentService.getConnection();
		if (remoteAgentConnection) {
			const extensionManagementService = instantiationService.createInstance(NativeRemoteExtensionManagementService, remoteAgentConnection.getChannel<IChannel>('extensions'), this.localExtensionManagementServer);
			const remoteEnvironemntPromise = remoteAgentService.getEnvironment();
			this.remoteExtensionManagementServer = {
				id: 'remote',
				extensionManagementService,
				get label() { return labelService.getHostLabel(Schemas.vscodeRemote, remoteAgentConnection!.remoteAuthority) || localize('remote', "Remote"); },
				async getTargetPlatform() {
					const remoteEnvironment = await remoteEnvironemntPromise;
					if (remoteEnvironment) {
						return getTargetPlatformFromOS(remoteEnvironment.os, remoteEnvironment.arch);
					}
					throw new Error('Cannot get remote environment');
				}
			};
		}
	}

	getExtensionManagementServer(extension: IExtension): IExtensionManagementServer {
		if (extension.location.scheme === Schemas.file) {
			return this.localExtensionManagementServer;
		}
		if (this.remoteExtensionManagementServer && extension.location.scheme === Schemas.vscodeRemote) {
			return this.remoteExtensionManagementServer;
		}
		throw new Error(`Invalid Extension ${extension.location}`);
	}
}

registerSingleton(IExtensionManagementServerService, ExtensionManagementServerService);
