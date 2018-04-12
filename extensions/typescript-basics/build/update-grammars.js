/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

var updateGrammar = require('../../../build/npm/update-grammar');

function adaptToJavaScript(grammar, replacementScope) {
	grammar.name = 'JavaScript (with React support)';
	grammar.fileTypes = ['.js', '.jsx', '.es6', '.mjs' ];
	grammar.scopeName = `source${replacementScope}`;

	var fixScopeNames = function(rule) {
		if (typeof rule.name === 'string') {
			rule.name = rule.name.replace(/\.tsx/g, replacementScope);
		}
		if (typeof rule.contentName === 'string') {
			rule.contentName = rule.contentName.replace(/\.tsx/g, replacementScope);
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
}

var tsGrammarRepo = 'Microsoft/TypeScript-TmLanguage';
updateGrammar.update(tsGrammarRepo, 'TypeScript.tmLanguage', './syntaxes/TypeScript.tmLanguage.json');
updateGrammar.update(tsGrammarRepo, 'TypeScriptReact.tmLanguage', './syntaxes/TypeScriptReact.tmLanguage.json');
updateGrammar.update(tsGrammarRepo, 'TypeScriptReact.tmLanguage', '../javascript/syntaxes/JavaScript.tmLanguage.json', grammar => adaptToJavaScript(grammar, '.js'));
updateGrammar.update(tsGrammarRepo, 'TypeScriptReact.tmLanguage', '../javascript/syntaxes/JavaScriptReact.tmLanguage.json', grammar => adaptToJavaScript(grammar, '.js.jsx'));





