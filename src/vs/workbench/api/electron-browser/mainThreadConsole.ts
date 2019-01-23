/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { MainContext, MainThreadConsoleShape, IExtHostContext } from 'vs/workbench/api/node/extHost.protocol';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IRemoteConsoleLog, log, parse } from 'vs/base/node/console';
import { parseExtensionDevOptions } from 'vs/workbench/services/extensions/electron-browser/extensionHost';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IBroadcastService } from 'vs/platform/broadcast/electron-browser/broadcastService';
import { EXTENSION_LOG_BROADCAST_CHANNEL } from 'vs/platform/extensions/common/extensionHost';

@extHostNamedCustomer(MainContext.MainThreadConsole)
export class MainThreadConsole implements MainThreadConsoleShape {

	private readonly _isExtensionDevHost: boolean;
	private readonly _isExtensionDevTestFromCli: boolean;

	constructor(
		extHostContext: IExtHostContext,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IWindowsService private readonly _windowsService: IWindowsService,
		@IBroadcastService private readonly _broadcastService: IBroadcastService,
	) {
		const devOpts = parseExtensionDevOptions(this._environmentService);
		this._isExtensionDevHost = devOpts.isExtensionDevHost;
		this._isExtensionDevTestFromCli = devOpts.isExtensionDevTestFromCli;
	}

	dispose(): void {
		//
	}

	$logExtensionHostMessage(entry: IRemoteConsoleLog): void {
		// Send to local console unless we run tests from cli
		if (!this._isExtensionDevTestFromCli) {
			log(entry, 'Extension Host');
		}

		// Log on main side if running tests from cli
		if (this._isExtensionDevTestFromCli) {
			this._windowsService.log(entry.severity, ...parse(entry).args);
		}

		// Broadcast to other windows if we are in development mode
		else if (!this._environmentService.isBuilt || this._isExtensionDevHost) {
			this._broadcastService.broadcast({
				channel: EXTENSION_LOG_BROADCAST_CHANNEL,
				payload: {
					logEntry: entry,
					debugId: this._environmentService.debugExtensionHost.debugId
				}
			});
		}
	}
}
