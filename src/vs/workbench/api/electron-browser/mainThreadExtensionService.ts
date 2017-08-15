/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Severity from 'vs/base/common/severity';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { MainProcessExtensionServiceShape } from '../node/extHost.protocol';
import { MainProcessExtensionService } from "vs/workbench/services/extensions/electron-browser/extensionService";

export class MainProcessExtensionServiceAPI extends MainProcessExtensionServiceShape {

	private readonly _extensionService: MainProcessExtensionService;

	constructor( @IExtensionService extensionService: IExtensionService) {
		super();

		if (extensionService instanceof MainProcessExtensionService) {
			this._extensionService = extensionService;
		}
	}

	$localShowMessage(severity: Severity, msg: string): void {
		this._extensionService._localShowMessage(severity, msg);
	}
	$onExtensionActivated(extensionId: string): void {
	}
	$onExtensionActivationFailed(extensionId: string): void {
	}
}
