/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

var path = require('path');
var fs = require('fs');
var plist = require('fast-plist');

exports.update = function (srcName, destName) {
	try {
		console.log('reading ', srcName);
		let result = {};
		let plistContent = fs.readFileSync(srcName).toString();
		let theme = plist.parse(plistContent);
		let settings = theme.settings;
		if (Array.isArray(settings)) {
			for (let entry of settings) {
				let scope = entry.scope;
				if (scope) {
					let parts = scope.split(',').map(p => p.trim());
					if (parts.length > 1) {
						entry.scope = parts;
					}
				}
			}
			result.syntaxTokens = settings;
			result.colors = {};
		}
		fs.writeFileSync(destName, JSON.stringify(result, null, '\t'));
	} catch (e) {
		console.log(e);
	}
}

if (path.basename(process.argv[1]) === 'update-theme.js') {
	exports.update(process.argv[2], process.argv[3]);
}
