/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SerializedError } from 'vs/base/common/errors';
import Severity from 'vs/base/common/severity';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IExtHostContext, MainContext, MainThreadExtensionServiceShape } from 'vs/workbench/api/node/extHost.protocol';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ExtensionService } from 'vs/workbench/services/extensions/electron-browser/extensionService';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

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
	$onWillActivateExtension(extensionId: ExtensionIdentifier): void {
		this._extensionService._onWillActivateExtension(extensionId);
	}
	$onDidActivateExtension(extensionId: ExtensionIdentifier, startup: boolean, codeLoadingTime: number, activateCallTime: number, activateResolvedTime: number, activationEvent: string): void {
		this._extensionService._onDidActivateExtension(extensionId, startup, codeLoadingTime, activateCallTime, activateResolvedTime, activationEvent);
	}
	$onExtensionRuntimeError(extensionId: ExtensionIdentifier, data: SerializedError): void {
		const error = new Error();
		error.name = data.name;
		error.message = data.message;
		error.stack = data.stack;
		this._extensionService._onExtensionRuntimeError(extensionId, error);
		console.error(`[${extensionId}]${error.message}`);
		console.error(error.stack);
	}
	$onExtensionActivationFailed(extensionId: ExtensionIdentifier): void {
	}
	$addMessage(extensionId: ExtensionIdentifier, severity: Severity, message: string): void {
		this._extensionService._addMessage(extensionId, severity, message);
	}
}
