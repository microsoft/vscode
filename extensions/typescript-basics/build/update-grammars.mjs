/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

import { update } from 'vscode-grammar-updater';

function removeDom(grammar) {
	grammar.repository['support-objects'].patterns = grammar.repository['support-objects'].patterns.filter(pattern => {
		if (pattern.match && (
			/\b(HTMLElement|ATTRIBUTE_NODE|stopImmediatePropagation)\b/g.test(pattern.match)
			|| /\bJSON\b/g.test(pattern.match)
			|| /\bMath\b/g.test(pattern.match)
		)) {
			return false;
		}

		if (pattern.name?.startsWith('support.class.error.')
			|| pattern.name?.startsWith('support.class.builtin.')
			|| pattern.name?.startsWith('support.function.')
		) {
			return false;
		}

		return true;
	});
	return grammar;
}

function removeNodeTypes(grammar) {
	grammar.repository['support-objects'].patterns = grammar.repository['support-objects'].patterns.filter(pattern => {
		if (pattern.name) {
			if (pattern.name.startsWith('support.variable.object.node') || pattern.name.startsWith('support.class.node.')) {
				return false;
			}
		}
		if (pattern.captures) {
			if (Object.values(pattern.captures).some(capture =>
				capture.name && (capture.name.startsWith('support.variable.object.process')
					|| capture.name.startsWith('support.class.console'))
			)) {
				return false;
			}
		}
		return true;
	});
	return grammar;
}

function patchJsdoctype(grammar) {
	grammar.repository['jsdoctype'].patterns = grammar.repository['jsdoctype'].patterns.filter(pattern => {
		if (pattern.name && pattern.name.includes('illegal')) {
			return false;
		}
		return true;
	});
	return grammar;
}

function patchGrammar(grammar) {
	return removeNodeTypes(removeDom(patchJsdoctype(grammar)));
}

function adaptToJavaScript(grammar, replacementScope) {
	grammar.name = 'JavaScript (with React support)';
	grammar.fileTypes = ['.js', '.jsx', '.es6', '.mjs', '.cjs'];
	grammar.scopeName = `source${replacementScope}`;

	var fixScopeNames = function (rule) {
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

var tsGrammarRepo = 'microsoft/TypeScript-TmLanguage';
update(tsGrammarRepo, 'TypeScript.tmLanguage', './syntaxes/TypeScript.tmLanguage.json', grammar => patchGrammar(grammar));
update(tsGrammarRepo, 'TypeScriptReact.tmLanguage', './syntaxes/TypeScriptReact.tmLanguage.json', grammar => patchGrammar(grammar));
update(tsGrammarRepo, 'TypeScriptReact.tmLanguage', '../javascript/syntaxes/JavaScript.tmLanguage.json', grammar => adaptToJavaScript(patchGrammar(grammar), '.js'));
update(tsGrammarRepo, 'TypeScriptReact.tmLanguage', '../javascript/syntaxes/JavaScriptReact.tmLanguage.json', grammar => adaptToJavaScript(patchGrammar(grammar), '.js.jsx'));
