/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

if (!/yarn\.js$/.test(process.env['npm_execpath'])) {
	console.error('*** Please use yarn to install dependencies.\n');

	process.exit(1);
}
