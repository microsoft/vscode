/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

if (process.argv[2] === '--exec') {
	process.argv.splice(1, 2);
	require(process.argv[1]);
} else {
	const path = require('path');

	// Set default remote native node modules path, if unset
	process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] = process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH'] || path.join(__dirname, '..', '..', '..', 'remote', 'node_modules');

	require('../../bootstrap').injectNodeModuleLookupPath(process.env['VSCODE_INJECT_NODE_MODULE_LOOKUP_PATH']);
	require('../../bootstrap-amd').load('vs/server/remoteExtensionHostAgent');
}
