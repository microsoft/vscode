/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { execSync } = require('child_process');

// Check npm version is 5.x.x
if (!execSync('npm -v', { encoding: 'utf-8' }).startsWith('5.')) {
	console.error('VS Code requires npm v5');
	console.error('Run `npm install -g npm` to update');
	process.exit(1);
}

if (process.env['npm_config_disturl'] !== 'https://atom.io/download/electron') {
	console.error("You can't use plain npm to install Code's dependencies.");
	console.error(
		/^win/.test(process.platform)
			? "Please run '.\\scripts\\npm.bat install' instead."
			: "Please run './scripts/npm.sh install' instead."
	);

	process.exit(1);
}