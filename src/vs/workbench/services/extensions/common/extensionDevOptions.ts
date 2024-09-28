/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../base/common/network.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';

export interface IExtensionDevOptions {
	readonly isExtensionDevHost: boolean;
	readonly isExtensionDevDebug: boolean;
	readonly isExtensionDevDebugBrk: boolean;
	readonly isExtensionDevTestFromCli: boolean;
}

export function parseExtensionDevOptions(environmentService: IEnvironmentService): IExtensionDevOptions {
	// handle extension host lifecycle a bit special when we know we are developing an extension that runs inside
	const isExtensionDevHost = environmentService.isExtensionDevelopment;

	let debugOk = true;
	const extDevLocs = environmentService.extensionDevelopmentLocationURI;
	if (extDevLocs) {
		for (const x of extDevLocs) {
			if (x.scheme !== Schemas.file) {
				debugOk = false;
			}
		}
	}

	const isExtensionDevDebug = debugOk && typeof environmentService.debugExtensionHost.port === 'number';
	const isExtensionDevDebugBrk = debugOk && !!environmentService.debugExtensionHost.break;
	const isExtensionDevTestFromCli = isExtensionDevHost && !!environmentService.extensionTestsLocationURI && !environmentService.debugExtensionHost.debugId;
	return {
		isExtensionDevHost,
		isExtensionDevDebug,
		isExtensionDevDebugBrk,
		isExtensionDevTestFromCli
	};
}
