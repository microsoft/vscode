/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../instantiation/common/extensions.js';
import { ISandboxDependencyStatus, ISandboxHelperService } from '../common/sandboxHelperService.js';

class NullSandboxHelperService implements ISandboxHelperService {
	declare readonly _serviceBrand: undefined;

	async checkSandboxDependencies(): Promise<ISandboxDependencyStatus> {
		// Web targets cannot inspect host sandbox dependencies directly.
		// Treat them as satisfied so browser workbench targets do not fail DI
		// or block sandbox flows on an unavailable host-side capability.
		return {
			bubblewrapInstalled: true,
			socatInstalled: true,
		};
	}
}

registerSingleton(ISandboxHelperService, NullSandboxHelperService, InstantiationType.Delayed);
