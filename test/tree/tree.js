/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const path = require('path');
const fs = require('fs');

function collect(location) {
	const element = path.basename(location);
	const stat = fs.statSync(location);

	if (!stat.isDirectory()) {
		return { element };
	}

	const children = fs.readdirSync(location)
		.map(child => path.join(location, child))
		.map(collect);

	return { element, children };
}

console.log(JSON.stringify(collect(process.cwd())));