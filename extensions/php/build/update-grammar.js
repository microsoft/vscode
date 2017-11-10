/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

var updateGrammar = require('../../../build/npm/update-grammar');

function adaptInjectionScope(grammar) {
	// we're using the HTML grammar from https://github.com/textmate/html.tmbundle which has moved away from source.js.embedded.html
	let oldInjectionKey = "text.html.php - (meta.embedded | meta.tag), L:text.html.php meta.tag, L:source.js.embedded.html";
	let newInjectionKey = "text.html.php - (meta.embedded | meta.tag), L:text.html.php meta.tag, L:text.html.php source.js";

	var injections = grammar.injections;
	var injection = injections[oldInjectionKey];
	if (!injections) {
		throw new Error("Can not find PHP injection");
	}
	delete injections[oldInjectionKey];
	injections[newInjectionKey] = injection;
}

updateGrammar.update('atom/language-php', 'grammars/php.cson', './syntaxes/php.tmLanguage.json', adaptInjectionScope);

