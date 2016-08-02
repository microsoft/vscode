/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

var download = require('../../../build/lib/download');
var fs = require('fs');
var plist = require('plist');

var contentBaseLocation = 'https://raw.githubusercontent.com/Microsoft/TypeScript-TmLanguage/master/';

var lastCommit = 'https://api.github.com/repos/Microsoft/TypeScript-TmLanguage/git/refs/heads/master';
download.toString(lastCommit).then(function (content) {
	var commitSha = JSON.parse(content).object.sha;
	function writeJSON(fileName, modifyGrammar) {
		return function(content) {
			var grammar = plist.parse(content);
			grammar.version = 'https://github.com/Microsoft/TypeScript-TmLanguage/commit/' + commitSha;
			if (modifyGrammar) {
				modifyGrammar(grammar);
			}
			fs.writeFileSync(fileName, JSON.stringify(grammar, null, '\t'));
		}
	}

	return Promise.all([
		download.toString(contentBaseLocation + 'TypeScript.tmLanguage').then(writeJSON('./syntaxes/TypeScript.tmLanguage.json'), console.error),
		download.toString(contentBaseLocation + 'TypeScriptReact.tmLanguage').then(writeJSON('./syntaxes/TypeScriptReact.tmLanguage.json'), console.error),
		download.toString(contentBaseLocation + 'TypeScriptReact.tmLanguage').then(writeJSON('../javascript/syntaxes/JavaScript.tmLanguage.json', adaptToJavaScript), console.error)
	]).then(function() {
		console.log('Update complete.');
		console.log('[typescript] update grammar (Microsoft/TypeScript-TmLanguage@' + commitSha.substr(0, 7) + ')');
	});
}, console.error);

function adaptToJavaScript(grammar) {
	grammar.name = 'JavaScript (with React support)';
	grammar.fileTypes = ['.js', '.jsx' ];
	grammar.scopeName = 'source.js';

	var fixScopeNames = function(rule) {
		if (typeof rule.name === 'string') {
			rule.name = rule.name.replace(/\.tsx/g, '.js');
		}
		for (var property in rule) {
			var value = rule[property];
			if (typeof value === 'object') {
				fixScopeNames(value);
			}
		}
	};

	var repository = grammar.repository;
	for (var key in repository) {
		fixScopeNames(repository[key]);
	}
	// disable type parameters
	if (repository['type-parameters']) {
		repository['type-parameters']['begin'] = 'DO_NOT_MATCH';
	}
}



