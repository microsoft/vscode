/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { MainContext, MainThreadConsoleShape, IExtHostContext } from 'vs/workbench/api/common/extHost.protocol';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IRemoteConsoleLog, log, parse } from 'vs/base/common/console';
import { parseExtensionDevOptions } from 'vs/workbench/services/extensions/common/extensionDevOptions';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IExtensionHostDebugService } from 'vs/platform/debug/common/extensionHostDebug';

@extHostNamedCustomer(MainContext.MainThreadConsole)
export class MainThreadConsole implements MainThreadConsoleShape {

	private readonly _isExtensionDevHost: boolean;
	private readonly _isExtensionDevTestFromCli: boolean;

	constructor(
		extHostContext: IExtHostContext,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IWindowsService private readonly _windowsService: IWindowsService,
		@IExtensionHostDebugService private readonly _extensionHostDebugService: IExtensionHostDebugService,
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
			this._windowsService.log(entry.severity, parse(entry).args);
		}

		// Broadcast to other windows if we are in development mode
		else if (this._environmentService.debugExtensionHost.debugId && (!this._environmentService.isBuilt || this._isExtensionDevHost)) {
			this._extensionHostDebugService.logToSession(this._environmentService.debugExtensionHost.debugId, entry);
		}
	}
}
