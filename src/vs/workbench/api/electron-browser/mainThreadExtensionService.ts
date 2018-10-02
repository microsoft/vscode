/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { MainThreadExtensionServiceShape, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { ExtensionService } from 'vs/workbench/services/extensions/electron-browser/extensionService';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { SerializedError } from 'vs/base/common/errors';

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
	$onExtensionActivated(extensionId: string, startup: boolean, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number, activationEvent: string): void {
		this._extensionService._onExtensionActivated(extensionId, startup, codeLoadingTime, activateCallTime, activateResolvedTime, activationEvent);
	}
	$onExtensionRuntimeError(extensionId: string, data: SerializedError): void {
		const error = new Error();
		error.name = data.name;
		error.message = data.message;
		error.stack = data.stack;
		this._extensionService._onExtensionRuntimeError(extensionId, error);
		console.error(`[${extensionId}]${error.message}`);
		console.error(error.stack);
	}
	$onExtensionActivationFailed(extensionId: string): void {
	}
	$addMessage(extensionId: string, severity: Severity, message: string): void {
		this._extensionService._addMessage(extensionId, severity, message);
	}
}
