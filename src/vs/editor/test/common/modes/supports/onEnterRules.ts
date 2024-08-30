/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IndentAction } from '../../../../common/languages/languageConfiguration.js';

export const javascriptOnEnterRules = [
	{
		// e.g. /** | */
		beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
		afterText: /^\s*\*\/$/,
		action: { indentAction: IndentAction.IndentOutdent, appendText: ' * ' }
	}, {
		// e.g. /** ...|
		beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
		action: { indentAction: IndentAction.None, appendText: ' * ' }
	}, {
		// e.g.  * ...|
		beforeText: /^(\t|[ ])*[ ]\*([ ]([^\*]|\*(?!\/))*)?$/,
		previousLineText: /(?=^(\s*(\/\*\*|\*)).*)(?=(?!(\s*\*\/)))/,
		action: { indentAction: IndentAction.None, appendText: '* ' }
	}, {
		// e.g.  */|
		beforeText: /^(\t|[ ])*[ ]\*\/\s*$/,
		action: { indentAction: IndentAction.None, removeText: 1 }
	},
	{
		// e.g.  *-----*/|
		beforeText: /^(\t|[ ])*[ ]\*[^/]*\*\/\s*$/,
		action: { indentAction: IndentAction.None, removeText: 1 }
	},
	{
		beforeText: /^\s*(\bcase\s.+:|\bdefault:)$/,
		afterText: /^(?!\s*(\bcase\b|\bdefault\b))/,
		action: { indentAction: IndentAction.Indent }
	},
	{
		previousLineText: /^\s*(((else ?)?if|for|while)\s*\(.*\)\s*|else\s*)$/,
		beforeText: /^\s+([^{i\s]|i(?!f\b))/,
		action: { indentAction: IndentAction.Outdent }
	},
	// Indent when pressing enter from inside ()
	{
		beforeText: /^.*\([^\)]*$/,
		afterText: /^\s*\).*$/,
		action: { indentAction: IndentAction.IndentOutdent, appendText: '\t' }
	},
	// Indent when pressing enter from inside {}
	{
		beforeText: /^.*\{[^\}]*$/,
		afterText: /^\s*\}.*$/,
		action: { indentAction: IndentAction.IndentOutdent, appendText: '\t' }
	},
	// Indent when pressing enter from inside []
	{
		beforeText: /^.*\[[^\]]*$/,
		afterText: /^\s*\].*$/,
		action: { indentAction: IndentAction.IndentOutdent, appendText: '\t' }
	},
];

export const phpOnEnterRules = [
	{
		beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
		afterText: /^\s*\*\/$/,
		action: {
			indentAction: IndentAction.IndentOutdent,
			appendText: ' * ',
		}
	},
	{
		beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
		action: {
			indentAction: IndentAction.None,
			appendText: ' * ',
		}
	},
	{
		beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
		action: {
			indentAction: IndentAction.None,
			appendText: '* ',
		}
	},
	{
		beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
		action: {
			indentAction: IndentAction.None,
			removeText: 1,
		}
	},
	{
		beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
		action: {
			indentAction: IndentAction.None,
			removeText: 1,
		}
	},
	{
		beforeText: /^\s+([^{i\s]|i(?!f\b))/,
		previousLineText: /^\s*(((else ?)?if|for(each)?|while)\s*\(.*\)\s*|else\s*)$/,
		action: {
			indentAction: IndentAction.Outdent
		}
	},
];

export const cppOnEnterRules = [
	{
		previousLineText: /^\s*(((else ?)?if|for|while)\s*\(.*\)\s*|else\s*)$/,
		beforeText: /^\s+([^{i\s]|i(?!f\b))/,
		action: {
			indentAction: IndentAction.Outdent
		}
	}
];

export const htmlOnEnterRules = [
	{
		beforeText: /<(?!(?:area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr))([_:\w][_:\w\-.\d]*)(?:(?:[^'"/>]|"[^"]*"|'[^']*')*?(?!\/)>)[^<]*$/i,
		afterText: /^<\/([_:\w][_:\w\-.\d]*)\s*>/i,
		action: {
			indentAction: IndentAction.IndentOutdent
		}
	},
	{
		beforeText: /<(?!(?:area|base|br|col|embed|hr|img|input|keygen|link|menuitem|meta|param|source|track|wbr))([_:\w][_:\w\-.\d]*)(?:(?:[^'"/>]|"[^"]*"|'[^']*')*?(?!\/)>)[^<]*$/i,
		action: {
			indentAction: IndentAction.Indent
		}
	}
];

/*
export enum IndentAction {
	None = 0,
	Indent = 1,
	IndentOutdent = 2,
	Outdent = 3
}
*/
