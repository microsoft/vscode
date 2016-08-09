/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const fs = require('fs');
const path = require('path');

// delete unused typescript stuff
const root = path.dirname(require.resolve('typescript'));

for (let name of fs.readdirSync(root)) {
	if (name !== 'typescript.d.ts' && name !== 'typescript.js') {
		try {
			fs.unlinkSync(path.join(root, name));
			console.log(`removed '${path.join(root, name)}'`);
		} catch (e) {
			console.warn(e);
		}
	}
}
