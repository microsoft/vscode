/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const fs = require('fs');
const path = require('path');

function removeFile(filePath) {
	try {
		fs.unlinkSync(filePath);
		console.log(`removed '${filePath}'`);
	} catch (e) {
		console.warn(e);
	}
}

// delete unused typescript stuff in lib folder
const libPath = path.dirname(require.resolve('typescript'));
for (let name of fs.readdirSync(libPath)) {
	if (name !== 'typescript.d.ts' && name !== 'typescript.js' && name !== 'lib.es6.d.ts') {
		removeFile(path.join(libPath, name));
	}
}

// delete unused typescript stuff in bin folder
const binPath = path.join(path.dirname(libPath), 'bin');
for (let name of fs.readdirSync(binPath)) {
	removeFile(path.join(binPath, name));
}

removeFile(path.join(path.dirname(libPath), 'Gulpfile.ts'));
