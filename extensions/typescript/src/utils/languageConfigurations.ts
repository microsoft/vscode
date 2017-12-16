/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from typescript-sublime-plugin project, obtained from
 * https://github.com/Microsoft/TypeScript-Sublime-Plugin/blob/master/TypeScript%20Indent.tmPreferences
 * ------------------------------------------------------------------------------------------ */

import { IndentAction } from 'vscode';

export const jsTsLanguageConfiguration = {
	indentationRules: {
		// ^(.*\*/)?\s*\}.*$
		decreaseIndentPattern: /^((?!.*?\/\*).*\*\/)?\s*[\}\]\)].*$/,
		// ^.*\{[^}"']*$
		increaseIndentPattern: /^((?!\/\/).)*(\{[^}"'`]*|\([^)"'`]*|\[[^\]"'`]*)$/
	},
	wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
	onEnterRules: [
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
		}
	]
};

const EMPTY_ELEMENTS: string[] = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr'];

export const jsxTags = {
	wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g,
	onEnterRules: [
		{
			beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))([_:\\w][_:\\w-.\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
			afterText: /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
			action: { indentAction: IndentAction.IndentOutdent }
		},
		{
			beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
			action: { indentAction: IndentAction.Indent }
		}
	],
};