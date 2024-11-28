/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

var updateGrammar = require('vscode-grammar-updater');

async function updateGrammars() {
	await updateGrammar.update('textmate/yaml.tmbundle', 'Syntaxes/YAML.tmLanguage', './syntaxes/yaml.tmLanguage.json',  undefined);
}

updateGrammars();
