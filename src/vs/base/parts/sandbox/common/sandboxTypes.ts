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
	 * Root path of the JavaScript sources.
	 *
	 * Note: This is NOT the installation root
	 * directory itself but contained in it at
	 * a level that is platform dependent.
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

	/**
	 * NLS support
	 */
	nls: {

		/**
		 * All NLS messages produced by `localize` and `localize2` calls
		 * under `src/vs`.
		 */
		messages: string[];

		/**
		 * The actual language of the NLS messages (e.g. 'en', de' or 'pt-br').
		 */
		language: string | undefined;
	};

	/**
	 * DEV time only! All css-modules that we have.
	 */
	cssModules?: string[];
}
