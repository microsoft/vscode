/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

var updateGrammar = require('vscode-grammar-updater');

async function updateGrammars() {
	await updateGrammar.update('RedCMD/YAML-Syntax-Highlighter', 'syntaxes/yaml-1.0.tmLanguage.json', './syntaxes/yaml-1.0.tmLanguage.json',  undefined, 'main');
	await updateGrammar.update('RedCMD/YAML-Syntax-Highlighter', 'syntaxes/yaml-1.1.tmLanguage.json', './syntaxes/yaml-1.1.tmLanguage.json',  undefined, 'main');
	await updateGrammar.update('RedCMD/YAML-Syntax-Highlighter', 'syntaxes/yaml-1.2.tmLanguage.json', './syntaxes/yaml-1.2.tmLanguage.json',  undefined, 'main');
	await updateGrammar.update('RedCMD/YAML-Syntax-Highlighter', 'syntaxes/yaml-1.3.tmLanguage.json', './syntaxes/yaml-1.3.tmLanguage.json',  undefined, 'main');
	await updateGrammar.update('RedCMD/YAML-Syntax-Highlighter', 'syntaxes/yaml-embedded.tmLanguage.json', './syntaxes/yaml-embedded.tmLanguage.json',  undefined, 'main');
	await updateGrammar.update('RedCMD/YAML-Syntax-Highlighter', 'syntaxes/yaml.tmLanguage.json', './syntaxes/yaml.tmLanguage.json',  undefined, 'main');
}

updateGrammars();
