/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Schemas } from 'vs/base/common/network';
import { ExtensionInstallLocation, IExtensionManagementServer, IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { ISharedProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { NativeRemoteExtensionManagementService } from 'vs/workbench/services/extensionManagement/electron-sandbox/remoteExtensionManagementService';
import { ILabelService } from 'vs/platform/label/common/label';
import { IExtension } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { NativeExtensionManagementService } from 'vs/workbench/services/extensionManagement/electron-sandbox/nativeExtensionManagementService';
import { Disposable } from 'vs/base/common/lifecycle';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export class ExtensionManagementServerService extends Disposable implements IExtensionManagementServerService {

	declare readonly _serviceBrand: undefined;

	readonly localExtensionManagementServer: IExtensionManagementServer;
	readonly remoteExtensionManagementServer: IExtensionManagementServer | null = null;
	readonly webExtensionManagementServer: IExtensionManagementServer | null = null;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@ILabelService labelService: ILabelService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const localExtensionManagementService = this._register(instantiationService.createInstance(NativeExtensionManagementService, sharedProcessService.getChannel('extensions')));
		this.localExtensionManagementServer = { extensionManagementService: localExtensionManagementService, id: 'local', label: localize('local', "Local") };
		const remoteAgentConnection = remoteAgentService.getConnection();
		if (remoteAgentConnection) {
			const extensionManagementService = instantiationService.createInstance(NativeRemoteExtensionManagementService, remoteAgentConnection.getChannel<IChannel>('extensions'), this.localExtensionManagementServer);
			this.remoteExtensionManagementServer = {
				id: 'remote',
				extensionManagementService,
				get label() { return labelService.getHostLabel(Schemas.vscodeRemote, remoteAgentConnection!.remoteAuthority) || localize('remote', "Remote"); },
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

	getExtensionInstallLocation(extension: IExtension): ExtensionInstallLocation | null {
		const server = this.getExtensionManagementServer(extension);
		return server === this.remoteExtensionManagementServer ? ExtensionInstallLocation.Remote : ExtensionInstallLocation.Local;
	}
}

registerSingleton(IExtensionManagementServerService, ExtensionManagementServerService, true);
