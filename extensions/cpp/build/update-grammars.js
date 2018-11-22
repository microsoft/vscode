/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

var updateGrammar = require('../../../build/npm/update-grammar');

updateGrammar.update('atom/language-c', 'grammars/c.cson', './syntaxes/c.tmLanguage.json');
updateGrammar.update('atom/language-c', 'grammars/c%2B%2B.cson', './syntaxes/cpp.tmLanguage.json');

// `source.c.platform` which is still included by other grammars
updateGrammar.update('textmate/c.tmbundle', 'Syntaxes/Platform.tmLanguage', './syntaxes/platform.tmLanguage.json');

