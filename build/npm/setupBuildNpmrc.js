/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const path = require('path');
const fs = require('fs');

// make sure we install the deps of build for the system installed
// node, since that is the driver of gulp
function setupBuildNpmrc() {
	const npmrcPath = path.join(path.dirname(__dirname), '.npmrc');
	const npmrc = `disturl="https://nodejs.org/download/release"
target="${process.versions.node}"
runtime="node"
prefer-dedupe="true"
arch="${process.arch}"`;

	fs.writeFileSync(npmrcPath, npmrc, 'utf8');
}

exports.setupBuildNpmrc = setupBuildNpmrc;

if (require.main === module) {
	setupBuildNpmrc();
}
