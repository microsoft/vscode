/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILogService } from 'vs/platform/log/common/log';
import { IWebExtensionsScannerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { AbstractExtensionScannerService, IUnifiedExtensionScannerService, ScanLocation } from 'vs/workbench/services/extensions/common/abstractExtensionScannerService';
import { toExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { dedupExtensions } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';


class BrowserExtensionsScannerService extends AbstractExtensionScannerService implements IUnifiedExtensionScannerService {

	constructor(
		@IWebExtensionsScannerService private readonly _webExtensionsScannerService: IWebExtensionsScannerService,
		@ILogService private readonly _logService: ILogService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IUserDataProfileService private readonly _userDataProfileService: IUserDataProfileService,
	) {
		super();
	}

	protected override async _doScanExtensions(scanLocation: ScanLocation) {
		switch (scanLocation) {
			case ScanLocation.Remote:
				return this._remoteAgentService.scanExtensions();
			case ScanLocation.Web:
				return this._scanWebExtensions();
			default:
				throw new Error('Cannot scan extensions for scan location ' + scanLocation);
		}
	}

	private async _scanWebExtensions() {
		const system: IExtensionDescription[] = [], user: IExtensionDescription[] = [], development: IExtensionDescription[] = [];
		try {
			await Promise.all([
				this._webExtensionsScannerService.scanSystemExtensions().then(extensions => system.push(...extensions.map(e => toExtensionDescription(e)))),
				this._webExtensionsScannerService.scanUserExtensions(this._userDataProfileService.currentProfile.extensionsResource, { skipInvalidExtensions: true }).then(extensions => user.push(...extensions.map(e => toExtensionDescription(e)))),
				this._webExtensionsScannerService.scanExtensionsUnderDevelopment().then(extensions => development.push(...extensions.map(e => toExtensionDescription(e, true))))
			]);
		} catch (error) {
			this._logService.error(error);
		}
		return dedupExtensions(system, user, development, this._logService);
	}
}

registerSingleton(IUnifiedExtensionScannerService, BrowserExtensionsScannerService, InstantiationType.Eager);
