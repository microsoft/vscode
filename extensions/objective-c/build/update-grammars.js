/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

var updateGrammar = require('vscode-grammar-updater');

updateGrammar.update('jeff-hykin/cpp-textmate-grammar', '/syntaxes/objc.tmLanguage.json', './syntaxes/objective-c.tmLanguage.json', undefined, 'master', 'source/languages/cpp');
updateGrammar.update('jeff-hykin/cpp-textmate-grammar', '/syntaxes/objcpp.tmLanguage.json', './syntaxes/objective-c++.tmLanguage.json', undefined, 'master', 'source/languages/cpp');

