/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProcessEnvironment } from 'vs/base/common/platform';
import { IProductConfiguration } from 'vs/base/common/product';


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

	/**
	 * Identifier of the sandboxed renderer.
	 */
	windowId: number;

	/**
	 * Absolute installation path.
	 */
	appRoot: string;

	/**
	 * Per window process environment.
	 */
	userEnv: IProcessEnvironment;

	/**
	 * Product configuration.
	 */
	product: IProductConfiguration;

	/**
	 * Configured zoom level.
	 */
	zoomLevel?: number;

	/**
	 * Location of V8 code cache.
	 */
	codeCachePath?: string;
}
