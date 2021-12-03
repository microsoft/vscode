/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

function installHeaders(rcFile) {
	const lines = fs.readFileSync(rcFile, 'utf8').split(/\r\n?/g);
	let disturl, target;
	for (const line of lines) {
		let match = line.match(/\s*disturl\s*(.*)$/);
		if (match !== null && match.length >= 1) {
			disturl = match[1];
		}
		match = line.match(/\s*target\s*(.*)$/);
		if (match !== null && match.length >= 1) {
			target = match[1];
		}
	}
	if (disturl !== undefined && target !== undefined) {
		console.log(`Pre-fetch headers for ${target} from ${disturl}`);
		cp.execSync(`node-gyp install --dist-url ${disturl} ${target}`);
	}
}


function main() {
	installHeaders(path.join(__dirname, '..', '.yarnrc'));
	installHeaders(path.join(__dirname, '..', 'remote', '.yarnrc'));
}


if (require.main === module) {
	main();
}
