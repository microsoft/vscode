/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./codicon/codicon';
import 'vs/css!./codicon/codicon-modifications';
import 'vs/css!./codicon/codicon-animations';

import { Codicon, iconRegistry } from 'vs/base/common/codicons';
import { createCSSRule, createStyleSheet } from 'vs/base/browser/dom';

let codiconStyleSheet: undefined | HTMLStyleElement;

function getOrCreateStyleSheet(): HTMLStyleElement {
	if (!codiconStyleSheet) {
		codiconStyleSheet = createStyleSheet();
		codiconStyleSheet.className = 'codiconStyleSheet';
	}
	return codiconStyleSheet;
}

function initialize() {
	for (let c of iconRegistry.all) {
		register(c);
	}
	iconRegistry.onDidRegister(register);
}


function register(c: Codicon) {
	let def = c.definition;
	while (def instanceof Codicon) {
		def = def.definition;
	}
	createCSSRule(`.codicon-${c.id}:before`, `content: '${def.character}'`, getOrCreateStyleSheet());
}

initialize();
