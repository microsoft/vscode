/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare global {

	/**
	 * Holds the file root for resources.
	 */
	var MonacoFileRoot: string;

	/**
	 * @deprecated Node modules that used in a context
	 * that shouldn't have access to node modules.
	 *
	 * This is only needed during AMD2ESM transition period
	 */
	var MonacoNodeModules: {
		crypto: typeof import('crypto');
		zlib: typeof import('zlib');
		net: typeof import('net');
		os: typeof import('os');
	}
}

// fake export to make global work
export { }
