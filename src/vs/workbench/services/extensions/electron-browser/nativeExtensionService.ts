/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ExtensionHostKind, ExtensionRunningLocation, IExtensionHost, IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { NativeLocalProcessExtensionHost } from 'vs/workbench/services/extensions/electron-browser/nativeLocalProcessExtensionHost';
import { ElectronExtensionService } from 'vs/workbench/services/extensions/electron-sandbox/electronExtensionService';

export class NativeExtensionService extends ElectronExtensionService {
	protected override _createExtensionHost(runningLocation: ExtensionRunningLocation, isInitialStart: boolean): IExtensionHost | null {
		if (runningLocation.kind === ExtensionHostKind.LocalProcess) {
			return this._instantiationService.createInstance(NativeLocalProcessExtensionHost, runningLocation, this._createLocalExtensionHostDataProvider(isInitialStart, runningLocation));
		}
		return super._createExtensionHost(runningLocation, isInitialStart);
	}
}

registerSingleton(IExtensionService, NativeExtensionService);
