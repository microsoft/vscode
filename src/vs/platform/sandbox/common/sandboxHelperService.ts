/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ISandboxHelperService = createDecorator<ISandboxHelperService>('sandboxHelperService');

export interface ISandboxDependencyStatus {
	readonly bubblewrapInstalled: boolean;
	readonly socatInstalled: boolean;
}

export interface ISandboxHelperService {
	readonly _serviceBrand: undefined;
	checkSandboxDependencies(): Promise<ISandboxDependencyStatus | undefined>;
}
