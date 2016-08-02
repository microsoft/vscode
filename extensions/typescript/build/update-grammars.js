/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

var download = require('../../../build/lib/download');
var fs = require('fs');

var contentBaseLocation = 'https://raw.githubusercontent.com/Microsoft/TypeScript-TmLanguage/master/';
var lastCommit = 'https://api.github.com/repos/Microsoft/TypeScript-TmLanguage/git/refs/heads/master';
Promise.all([
	download.toFile(contentBaseLocation + 'TypeScript.tmLanguage', './syntaxes/TypeScript.tmLanguage'),
	download.toFile(contentBaseLocation + 'TypeScriptReact.tmLanguage', './syntaxes/TypeScriptReact.tmLanguage'),
	download.toString(lastCommit).then(function (content) {
		var commitInfo = JSON.parse(content);
		fs.writeFileSync('./syntaxes/grammar-version.txt', commitInfo.object.url);
		console.log('Update completed.');
		console.log('New commit comment:');
		console.log('[typescript] update grammar (Microsoft/TypeScript-TmLanguage@' + commitInfo.object.sha.substr(0, 7) + ')');
	}, console.error)
]);



