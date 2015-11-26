/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var win = "Please run '.\\scripts\\npm.bat install' instead."
var nix = "Please run './scripts/npm.sh install' instead."

if (process.env['npm_config_disturl'] !== 'https://atom.io/download/atom-shell') {
	console.error("You can't use plain npm to install Code's dependencies.");
	console.error(/^win/.test(process.platform) ? win : nix);
	process.exit(1);
}