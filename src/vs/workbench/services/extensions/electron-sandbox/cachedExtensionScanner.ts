/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'vs/base/common/path';
import * as platform from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { IExtensionDescription, ExtensionType } from 'vs/platform/extensions/common/extensions';
import { dedupExtensions } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { IExtensionsScannerService, toExtensionDescription } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { ILogService } from 'vs/platform/log/common/log';
import Severity from 'vs/base/common/severity';
import { localize } from 'vs/nls';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { timeout } from 'vs/base/common/async';

export class CachedExtensionScanner {

	public readonly scannedExtensions: Promise<IExtensionDescription[]>;
	private _scannedExtensionsResolve!: (result: IExtensionDescription[]) => void;
	private _scannedExtensionsReject!: (err: any) => void;

	constructor(
		@INotificationService private readonly _notificationService: INotificationService,
		@IHostService private readonly _hostService: IHostService,
		@IExtensionsScannerService private readonly _extensionsScannerService: IExtensionsScannerService,
		@ILogService private readonly _logService: ILogService,
	) {
		this.scannedExtensions = new Promise<IExtensionDescription[]>((resolve, reject) => {
			this._scannedExtensionsResolve = resolve;
			this._scannedExtensionsReject = reject;
		});
	}

	public async scanSingleExtension(extensionPath: string, isBuiltin: boolean): Promise<IExtensionDescription | null> {
		const scannedExtension = await this._extensionsScannerService.scanExistingExtension(URI.file(path.resolve(extensionPath)), isBuiltin ? ExtensionType.System : ExtensionType.User, { language: platform.language });
		return scannedExtension ? toExtensionDescription(scannedExtension, false) : null;
	}

	public async startScanningExtensions(): Promise<void> {
		try {
			const { system, user, development } = await this._scanInstalledExtensions();
			const r = dedupExtensions(system, user, development, this._logService);
			this._scannedExtensionsResolve(r);
		} catch (err) {
			this._scannedExtensionsReject(err);
		}
	}

	private async _scanInstalledExtensions(): Promise<{ system: IExtensionDescription[]; user: IExtensionDescription[]; development: IExtensionDescription[] }> {
		const language = platform.language;

		const builtinExtensions = this._extensionsScannerService.scanSystemExtensions({ language, useCache: true, checkControlFile: true })
			.then(scannedExtensions => scannedExtensions.map(e => toExtensionDescription(e, false)));

		const userExtensions = this._extensionsScannerService.scanUserExtensions({ language, useCache: true })
			.then(scannedExtensions => scannedExtensions.map(e => toExtensionDescription(e, false)));

		const developedExtensions = this._extensionsScannerService.scanExtensionsUnderDevelopment({ language })
			.then(scannedExtensions => scannedExtensions.map(e => toExtensionDescription(e, true)));

		return Promise.all([builtinExtensions, userExtensions, developedExtensions]).then((extensionDescriptions: IExtensionDescription[][]) => {
			const system = extensionDescriptions[0];
			const user = extensionDescriptions[1];
			const development = extensionDescriptions[2];
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
			return { system, user, development };
		}).then(undefined, err => {
			this._logService.error(`Error scanning installed extensions:`);
			this._logService.error(err);
			return { system: [], user: [], development: [] };
		});
	}

}
