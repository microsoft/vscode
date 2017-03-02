/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const fs = require('fs');
const path = require('path');
const toDelete = new Set(['tsc.js', 'tsserverlibrary.js', 'typescriptServices.js']);

const root = path.join(__dirname, 'node_modules', 'typescript', 'lib');
for (let name of fs.readdirSync(root)) {
	if (name === 'lib.d.ts' || name.match(/^lib\..*\.d\.ts$/) || name === 'protocol.d.ts') {
		continue;
	}
	if (name === 'typescript.js' || name === 'typescript.d.ts') {
		// used by html and extension editing
		continue;
	}

	if (toDelete.has(name) || name.match(/\.d\.ts$/)) {
		try {
			fs.unlinkSync(path.join(root, name));
			console.log(`removed '${path.join(root, name)}'`);
		} catch (e) {
			console.warn(e);
		}
	}
}