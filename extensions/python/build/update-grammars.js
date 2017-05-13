/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

var updateGrammar = require('../../../build/npm/update-grammar');

function fixGrammarName(grammar) {
	grammar.name = 'Python';
}
function fixRexExpGrammarName(grammar) {
	grammar.name = 'PythonRegExp';
}
var pyGrammarRepo = 'MagicStack/MagicPython';
updateGrammar.update(pyGrammarRepo, 'grammars/MagicPython.tmLanguage', './syntaxes/MagicPython.tmLanguage.json', fixGrammarName);
updateGrammar.update(pyGrammarRepo, 'grammars/MagicRegExp.tmLanguage', './syntaxes/MagicRegExp.tmLanguage.json', fixRexExpGrammarName);
