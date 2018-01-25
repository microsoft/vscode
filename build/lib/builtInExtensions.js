/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

const fs = require('fs');
const path = require('path');
const root = path.dirname(path.dirname(__dirname));

function isUpToDate(extension) {
	const packagePath = path.join(root, '.build', 'builtInExtensions', extension.name, 'package.json');
	if (!fs.existsSync(packagePath)) {
		return false;
	}
	const packageContents = fs.readFileSync(packagePath);
	try {
		const diskVersion = JSON.parse(packageContents).version;
		return (diskVersion === extension.version);
	} catch(err) {
		return false;
	}
}

const builtInExtensions = require('../builtInExtensions');
builtInExtensions.forEach((extension) => {
	if (!isUpToDate(extension)) {
		process.exit(1);
	}
});
process.exit(0);
