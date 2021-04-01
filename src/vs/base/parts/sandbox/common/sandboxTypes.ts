/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProcessEnvironment } from 'vs/base/common/platform';


// #######################################################################
// ###                                                                 ###
// ###             Types we need in a common layer for reuse    	   ###
// ###                                                                 ###
// #######################################################################


/**
 * The common properties required for any sandboxed
 * renderer to function.
 */
export interface ISandboxConfiguration {
	appRoot: string;
	userEnv: IProcessEnvironment;

	zoomLevel?: number;

	nodeCachedDataDir?: string;
}
