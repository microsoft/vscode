/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ExtensionHostKind, ExtensionRunningLocation, IExtensionHost, IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ElectronExtensionService } from 'vs/workbench/services/extensions/electron-sandbox/electronExtensionService';
import { NativeLocalProcessExtensionHost } from 'vs/workbench/services/extensions/electron-sandbox/nativeLocalProcessExtensionHost';
import { process } from 'vs/base/parts/sandbox/electron-sandbox/globals';

export class SandboxExtensionService extends ElectronExtensionService {
	protected override _createExtensionHost(runningLocation: ExtensionRunningLocation, isInitialStart: boolean): IExtensionHost | null {
		if (!process.sandboxed && runningLocation.kind === ExtensionHostKind.LocalProcess) {
			// TODO@bpasero remove me once electron utility process has landed
			return this._instantiationService.createInstance(NativeLocalProcessExtensionHost, runningLocation, this._createLocalExtensionHostDataProvider(isInitialStart, runningLocation));
		}
		return super._createExtensionHost(runningLocation, isInitialStart);
	}
}

registerSingleton(IExtensionService, SandboxExtensionService, false);
