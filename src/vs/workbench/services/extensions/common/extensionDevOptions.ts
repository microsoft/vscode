/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export interface IExtensionDevOptions {
	readonly isExtensionDevHost: boolean;
	readonly isExtensionDevDebug: boolean;
	readonly isExtensionDevDebugBrk: boolean;
	readonly isExtensionDevTestFromCli: boolean;
}

export function parseExtensionDevOptions(environmentService: IEnvironmentService): IExtensionDevOptions {
	// handle extension host lifecycle a bit special when we know we are developing an extension that runs inside
	let isExtensionDevHost = environmentService.isExtensionDevelopment;

	let debugOk = true;
	let extDevLoc = environmentService.extensionDevelopmentLocationURI;
	if (Array.isArray(extDevLoc)) {
		for (let x of extDevLoc) {
			if (x.scheme !== Schemas.file) {
				debugOk = false;
			}
		}
	} else if (extDevLoc && extDevLoc.scheme !== Schemas.file) {
		debugOk = false;
	}

	let isExtensionDevDebug = debugOk && typeof environmentService.debugExtensionHost.port === 'number';
	let isExtensionDevDebugBrk = debugOk && !!environmentService.debugExtensionHost.break;
	let isExtensionDevTestFromCli = isExtensionDevHost && !!environmentService.extensionTestsLocationURI && !environmentService.debugExtensionHost.break;
	return {
		isExtensionDevHost,
		isExtensionDevDebug,
		isExtensionDevDebugBrk,
		isExtensionDevTestFromCli,
	};
}
