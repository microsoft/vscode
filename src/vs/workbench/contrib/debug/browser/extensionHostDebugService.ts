/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionHostDebugChannelClient, ExtensionHostDebugBroadcastChannel } from 'vs/platform/debug/common/extensionHostDebugIpc';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';
import { IDebugHelperService } from 'vs/workbench/contrib/debug/common/debug';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';

class BrowserExtensionHostDebugService extends ExtensionHostDebugChannelClient implements IExtensionHostDebugService {

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
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

	openExtensionDevelopmentHostWindow(args: ParsedArgs, env: IProcessEnvironment): Promise<void> {
		// we pass the "ParsedArgs" as query parameters of the URL

		let newAddress = `${document.location.origin}${document.location.pathname}?`;
		let gotFolder = false;

		const addQueryParameter = (key: string, value: string) => {
			const lastChar = newAddress.charAt(newAddress.length - 1);
			if (lastChar !== '?' && lastChar !== '&') {
				newAddress += '&';
			}
			newAddress += `${key}=${encodeURIComponent(value)}`;
		};

		const f = args['folder-uri'];
		if (f) {
			const u = URI.parse(f[0]);
			gotFolder = true;
			addQueryParameter('folder', u.path);
		}
		if (!gotFolder) {
			// request empty window
			addQueryParameter('ew', 'true');
		}

		const ep = args['extensionDevelopmentPath'];
		if (ep) {
			let u = ep[0];
			addQueryParameter('edp', u);
		}

		const di = args['debugId'];
		if (di) {
			addQueryParameter('di', di);
		}

		const ibe = args['inspect-brk-extensions'];
		if (ibe) {
			addQueryParameter('ibe', ibe);
		}

		window.open(newAddress);

		return Promise.resolve();
	}
}

registerSingleton(IExtensionHostDebugService, BrowserExtensionHostDebugService);

class BrowserDebugHelperService implements IDebugHelperService {

	_serviceBrand: undefined;

	createTelemetryService(configurationService: IConfigurationService, args: string[]): TelemetryService | undefined {
		return undefined;
	}
}

registerSingleton(IDebugHelperService, BrowserDebugHelperService);
