/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionHostDebugChannelClient, ExtensionHostDebugBroadcastChannel } from 'vs/platform/debug/common/extensionHostDebugIpc';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { IDebugHelperService } from 'vs/workbench/contrib/debug/common/debug';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';

class BrowserExtensionHostDebugService extends ExtensionHostDebugChannelClient {

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		// @IWindowService windowService: IWindowService, // TODO@weinand TODO@isidorn cyclic dependency?
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		const connection = remoteAgentService.getConnection();

		let channel: IChannel;
		if (connection) {
			channel = connection.getChannel(ExtensionHostDebugBroadcastChannel.ChannelName);
		} else {
			channel = { call: async () => undefined, listen: () => Event.None } as any;
			// TODO@weinand TODO@isidorn fallback?
			console.warn('Extension Host Debugging not available due to missing connection.');
		}

		super(channel);

		this._register(this.onReload(event => {
			if (environmentService.isExtensionDevelopment && environmentService.debugExtensionHost.debugId === event.sessionId) {
				window.location.reload();
			}
		}));
		this._register(this.onClose(event => {
			if (environmentService.isExtensionDevelopment && environmentService.debugExtensionHost.debugId === event.sessionId) {
				window.close();
			}
		}));
	}
}

registerSingleton(IExtensionHostDebugService, BrowserExtensionHostDebugService);

class BrowserDebugHelperService implements IDebugHelperService {

	_serviceBrand!: ServiceIdentifier<IDebugHelperService>;

	createTelemetryService(configurationService: IConfigurationService, args: string[]): TelemetryService | undefined {
		return undefined;
	}
}

registerSingleton(IDebugHelperService, BrowserDebugHelperService);
