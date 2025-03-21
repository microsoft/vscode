/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as platform from '../../../../base/common/platform.js';
import { IExtensionDescription, IExtension } from '../../../../platform/extensions/common/extensions.js';
import { dedupExtensions } from '../common/extensionsUtil.js';
import { IExtensionsScannerService, IScannedExtension, toExtensionDescription as toExtensionDescriptionFromScannedExtension } from '../../../../platform/extensionManagement/common/extensionsScannerService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import Severity from '../../../../base/common/severity.js';
import { localize } from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IHostService } from '../../host/browser/host.js';
import { timeout } from '../../../../base/common/async.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { IWorkbenchExtensionManagementService } from '../../extensionManagement/common/extensionManagement.js';
import { toExtensionDescription } from '../common/extensions.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';

export class CachedExtensionScanner {

	public readonly scannedExtensions: Promise<IExtensionDescription[]>;
	private _scannedExtensionsResolve!: (result: IExtensionDescription[]) => void;
	private _scannedExtensionsReject!: (err: any) => void;

	constructor(
		@INotificationService private readonly _notificationService: INotificationService,
		@IHostService private readonly _hostService: IHostService,
		@IExtensionsScannerService private readonly _extensionsScannerService: IExtensionsScannerService,
		@IUserDataProfileService private readonly _userDataProfileService: IUserDataProfileService,
		@IWorkbenchExtensionManagementService private readonly _extensionManagementService: IWorkbenchExtensionManagementService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@ILogService private readonly _logService: ILogService,
	) {
		this.scannedExtensions = new Promise<IExtensionDescription[]>((resolve, reject) => {
			this._scannedExtensionsResolve = resolve;
			this._scannedExtensionsReject = reject;
		});
	}

	public async startScanningExtensions(): Promise<void> {
		try {
			const extensions = await this._scanInstalledExtensions();
			this._scannedExtensionsResolve(extensions);
		} catch (err) {
			this._scannedExtensionsReject(err);
		}
	}

	private async _scanInstalledExtensions(): Promise<IExtensionDescription[]> {
		try {
			const language = platform.language;
			const result = await Promise.allSettled([
				this._extensionsScannerService.scanSystemExtensions({ language, checkControlFile: true }),
				this._extensionsScannerService.scanUserExtensions({ language, profileLocation: this._userDataProfileService.currentProfile.extensionsResource, useCache: true }),
				this._environmentService.remoteAuthority ? [] : this._extensionManagementService.getInstalledWorkspaceExtensions(false)
			]);

			let scannedSystemExtensions: IScannedExtension[] = [],
				scannedUserExtensions: IScannedExtension[] = [],
				workspaceExtensions: IExtension[] = [],
				scannedDevelopedExtensions: IScannedExtension[] = [],
				hasErrors = false;

			if (result[0].status === 'fulfilled') {
				scannedSystemExtensions = result[0].value;
			} else {
				hasErrors = true;
				this._logService.error(`Error scanning system extensions:`, getErrorMessage(result[0].reason));
			}

			if (result[1].status === 'fulfilled') {
				scannedUserExtensions = result[1].value;
			} else {
				hasErrors = true;
				this._logService.error(`Error scanning user extensions:`, getErrorMessage(result[1].reason));
			}

			if (result[2].status === 'fulfilled') {
				workspaceExtensions = result[2].value;
			} else {
				hasErrors = true;
				this._logService.error(`Error scanning workspace extensions:`, getErrorMessage(result[2].reason));
			}

			try {
				scannedDevelopedExtensions = await this._extensionsScannerService.scanExtensionsUnderDevelopment([...scannedSystemExtensions, ...scannedUserExtensions], { language });
			} catch (error) {
				this._logService.error(error);
			}

			const system = scannedSystemExtensions.map(e => toExtensionDescriptionFromScannedExtension(e, false));
			const user = scannedUserExtensions.map(e => toExtensionDescriptionFromScannedExtension(e, false));
			const workspace = workspaceExtensions.map(e => toExtensionDescription(e, false));
			const development = scannedDevelopedExtensions.map(e => toExtensionDescriptionFromScannedExtension(e, true));
			const r = dedupExtensions(system, user, workspace, development, this._logService);

			if (!hasErrors) {
				const disposable = this._extensionsScannerService.onDidChangeCache(() => {
					disposable.dispose();
					this._notificationService.prompt(
						Severity.Error,
						localize('extensionCache.invalid', "Extensions have been modified on disk. Please reload the window."),
						[{
							label: localize('reloadWindow', "Reload Window"),
							run: () => this._hostService.reload()
						}]
					);
				});
				timeout(5000).then(() => disposable.dispose());
			}

			return r;
		} catch (err) {
			this._logService.error(`Error scanning installed extensions:`);
			this._logService.error(err);
			return [];
		}
	}

}
