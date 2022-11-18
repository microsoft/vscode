/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { AbstractExtensionScannerService, IUnifiedExtensionScannerService, ScanLocation } from 'vs/workbench/services/extensions/common/abstractExtensionScannerService';
import { CachedExtensionScanner } from 'vs/workbench/services/extensions/electron-sandbox/cachedExtensionScanner';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

class ElectronExtensionScannerService extends AbstractExtensionScannerService implements IUnifiedExtensionScannerService {

	private _cachedExtensionScanner: CachedExtensionScanner;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
	) {
		super();
		this._cachedExtensionScanner = instantiationService.createInstance(CachedExtensionScanner);
	}

	protected override _doScanExtensions(scanLocation: ScanLocation) {
		switch (scanLocation) {
			case ScanLocation.Remote:
				return this._remoteAgentService.scanExtensions();
			case ScanLocation.Local:
				return this._scanLocalExtensions();
			default:
				throw new Error('Cannot scan extensions for scan location ' + scanLocation);
		}
	}

	private async _scanLocalExtensions() {
		await this._cachedExtensionScanner.startScanningExtensions();
		return this._cachedExtensionScanner.scannedExtensions;
	}
}

registerSingleton(IUnifiedExtensionScannerService, ElectronExtensionScannerService, InstantiationType.Eager);
