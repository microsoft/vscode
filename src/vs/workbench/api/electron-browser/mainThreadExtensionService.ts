/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { MainThreadExtensionServiceShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { ExtensionService } from 'vs/workbench/services/extensions/electron-browser/extensionService';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadExtensionService)
export class MainThreadExtensionService implements MainThreadExtensionServiceShape {

	private readonly _extensionService: ExtensionService;

	constructor(
		extHostContext: IExtHostContext,
		@IExtensionService extensionService: IExtensionService
	) {
		if (extensionService instanceof ExtensionService) {
			this._extensionService = extensionService;
		}
	}

	public dispose(): void {
	}

	$localShowMessage(severity: Severity, msg: string): void {
		this._extensionService._logOrShowMessage(severity, msg);
	}
	$onExtensionActivated(extensionId: string, startup: boolean, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number): void {
		this._extensionService._onExtensionActivated(extensionId, startup, codeLoadingTime, activateCallTime, activateResolvedTime);
	}
	$onExtensionActivationFailed(extensionId: string): void {
	}
}
