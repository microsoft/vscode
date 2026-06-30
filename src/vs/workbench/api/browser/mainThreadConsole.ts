/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { MainContext, MainThreadConsoleShape } from '../common/extHost.protocol.js';
import { IEnvironmentService } from '../../../platform/environment/common/environment.js';
import { IRemoteConsoleLog, log } from '../../../base/common/console.js';
import { logRemoteEntry, logRemoteEntryIfError } from '../../services/extensions/common/remoteConsoleUtil.js';
import { parseExtensionDevOptions } from '../../services/extensions/common/extensionDevOptions.js';
import { ILogService, isDevConsoleLogForwardingEnabled } from '../../../platform/log/common/log.js';

@extHostNamedCustomer(MainContext.MainThreadConsole)
export class MainThreadConsole implements MainThreadConsoleShape {

	private readonly _logAllExtensionHostConsole: boolean;
	private readonly _logExtensionHostConsoleToLocalConsole: boolean;

	constructor(
		_extHostContext: IExtHostContext,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@ILogService private readonly _logService: ILogService,
	) {
		const devOpts = parseExtensionDevOptions(this._environmentService);
		const isDevConsoleLogForwardingActive = !this._environmentService.isBuilt && isDevConsoleLogForwardingEnabled;
		this._logAllExtensionHostConsole = devOpts.isExtensionDevTestFromCli || isDevConsoleLogForwardingActive;
		this._logExtensionHostConsoleToLocalConsole = !devOpts.isExtensionDevTestFromCli && !isDevConsoleLogForwardingActive;
	}

	dispose(): void {
		//
	}

	$logExtensionHostMessage(entry: IRemoteConsoleLog): void {
		if (this._logAllExtensionHostConsole) {
			// In development scenarios, log all extension host console output to the log service.
			logRemoteEntry(this._logService, entry);
			if (this._logExtensionHostConsoleToLocalConsole) {
				log(entry, 'Extension Host');
			}
		} else {
			// Log to the log service only errors and log everything to local console
			logRemoteEntryIfError(this._logService, entry, 'Extension Host');
			log(entry, 'Extension Host');
		}
	}
}
