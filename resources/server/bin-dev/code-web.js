/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const opn = require('opn');
const cp = require('child_process');
const path = require('path');

const verbose = process.argv.indexOf('--verbose') !== -1;

const proc = cp.execFile(path.join(__dirname, process.platform === 'win32' ? 'server.bat' : 'server.sh'), process.argv);

let launched = false;
proc.stdout.on("data", data => {

	// Respect --verbose
	if (verbose) {
		console.log(data);
	}

	// Bring up web URL when we detect the server is ready
	if (!launched && data.toString().indexOf('Extension host agent listening on 8000') >= 0) {
		launched = true;

		setTimeout(() => {
			const url = 'http://127.0.0.1:8000';

			if (verbose) {
				console.log(`Opening ${url} in your browser...`);
			}

			opn(url).catch(() => { console.log(`Failed to open ${url} in your browser. Please do so manually.`); });
		}, 100);
	}
});