/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

import * as vscodeGrammarUpdater from 'vscode-grammar-updater';

function patchGrammar(grammar) {
	let patchCount = 0;

	let visit = function (rule, parent) {
		if (rule.name === 'source.js' || rule.name === 'source.css') {
			if (parent.node[0].name !== 'punctuation.definition.string.end.html' && parent.parent && parent.parent.property === 'endCaptures') {
				rule.name = rule.name + '-ignored-vscode';
				patchCount++;
			}
		}
		for (let property in rule) {
			let value = rule[property];
			if (typeof value === 'object') {
				visit(value, { node: rule, property: property, parent: parent });
			}
		}
	};

	let repository = grammar.repository;
	for (let key in repository) {
		visit(repository[key], { node: repository, property: key, parent: undefined });
	}
	if (patchCount !== 2) {
		console.warn(`Expected to patch 2 occurrences of source.js & source.css: Was ${patchCount}`);
	}


	return grammar;
}

const tsGrammarRepo = 'textmate/html.tmbundle';
const grammarPath = 'Syntaxes/HTML.plist';
vscodeGrammarUpdater.update(tsGrammarRepo, grammarPath, './syntaxes/html.tmLanguage.json', grammar => patchGrammar(grammar));


