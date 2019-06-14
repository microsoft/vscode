/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const cp = require('child_process');

function exec(cmdLine) {
	console.log(cmdLine);
	cp.execSync(cmdLine, {stdio: "inherit"});
}

exec('git fetch distro');
exec(`git checkout ${process.env['npm_package_distro']} -- src/vs/server resources/server`);
exec('git reset HEAD src/vs/server resources/server');