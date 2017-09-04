/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

if (process.env['npm_config_disturl'] !== 'https://atom.io/download/electron') {
	console.error("You can't use plain npm to install Code's dependencies.");
	console.error(
		/^win/.test(process.platform)
			? "Please run '.\\scripts\\npm.bat install' instead."
			: "Please run './scripts/npm.sh install' instead."
	);

	process.exit(1);
}