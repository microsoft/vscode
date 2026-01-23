/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check

import * as vscodeGrammarUpdater from 'vscode-grammar-updater';

function patchGrammar(grammar) {
	grammar.scopeName = 'text.html.cshtml';

	let patchCount = 0;

	let visit = function (rule, parent) {
		if (rule.include?.startsWith('text.html.basic')) {
			patchCount++;
			rule.include = 'text.html.derivative';
		}
		for (let property in rule) {
			let value = rule[property	];
			if (typeof value === 'object') {
				visit(value, { node: rule, property: property, parent: parent });
			}
		}
	};

	let roots = [grammar.repository, grammar.patterns];
	for (let root of roots) {
		for (let key in root) {
			visit(root[key], { node: root, property: key, parent: undefined });
		}
	}
	if (patchCount !== 4) {
		console.warn(`Expected to patch 4 occurrences of text.html.basic: Was ${patchCount}`);
	}

	return grammar;
}

const razorGrammarRepo = 'dotnet/razor';
const grammarPath = 'src/Razor/src/Microsoft.VisualStudio.RazorExtension/EmbeddedGrammars/aspnetcorerazor.tmLanguage.json';
vscodeGrammarUpdater.update(razorGrammarRepo, grammarPath, './syntaxes/cshtml.tmLanguage.json', grammar => patchGrammar(grammar), 'main');


