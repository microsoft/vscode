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
		['node:module']: typeof import('node:module');
		fs: typeof import('fs'),
		util: typeof import('util'),
		child_process: typeof import('child_process'),
		path: typeof import('path'),
		yauzl: typeof import('yauzl'),
		yazl: typeof import('yazl'),
		['graceful-fs']: typeof import('graceful-fs'),
		minimist: typeof import('minimist'),
		https: typeof import('https'),
		['xterm-headless']: typeof import('xterm-headless'),
		console: typeof import('console'),
		xterm: typeof import('xterm'),
	}
}

// fake export to make global work
export { }
