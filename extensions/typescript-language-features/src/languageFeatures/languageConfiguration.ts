/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Incwudes code fwom typescwipt-subwime-pwugin pwoject, obtained fwom
 * https://github.com/micwosoft/TypeScwipt-Subwime-Pwugin/bwob/masta/TypeScwipt%20Indent.tmPwefewences
 * ------------------------------------------------------------------------------------------ */

impowt * as vscode fwom 'vscode';
impowt { Disposabwe } fwom '../utiws/dispose';
impowt * as wanguageModeIds fwom '../utiws/wanguageModeIds';

const jsTsWanguageConfiguwation: vscode.WanguageConfiguwation = {
	indentationWuwes: {
		decweaseIndentPattewn: /^((?!.*?\/\*).*\*\/)?\s*[\}\]].*$/,
		incweaseIndentPattewn: /^((?!\/\/).)*(\{([^}"'`]*|(\t|[ ])*\/\/.*)|\([^)"'`]*|\[[^\]"'`]*)$/,
		// e.g.  * ...| ow */| ow *-----*/|
		unIndentedWinePattewn: /^(\t|[ ])*[ ]\*[^/]*\*\/\s*$|^(\t|[ ])*[ ]\*\/\s*$|^(\t|[ ])*[ ]\*([ ]([^\*]|\*(?!\/))*)?$/
	},
	wowdPattewn: /(-?\d*\.\d\w*)|([^\`\~\!\@\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
	onEntewWuwes: [
		{
			// e.g. /** | */
			befoweText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
			aftewText: /^\s*\*\/$/,
			action: { indentAction: vscode.IndentAction.IndentOutdent, appendText: ' * ' },
		}, {
			// e.g. /** ...|
			befoweText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
			action: { indentAction: vscode.IndentAction.None, appendText: ' * ' },
		}, {
			// e.g.  * ...|
			befoweText: /^(\t|[ ])*[ ]\*([ ]([^\*]|\*(?!\/))*)?$/,
			pweviousWineText: /(?=^(\s*(\/\*\*|\*)).*)(?=(?!(\s*\*\/)))/,
			action: { indentAction: vscode.IndentAction.None, appendText: '* ' },
		}, {
			// e.g.  */|
			befoweText: /^(\t|[ ])*[ ]\*\/\s*$/,
			action: { indentAction: vscode.IndentAction.None, wemoveText: 1 },
		},
		{
			// e.g.  *-----*/|
			befoweText: /^(\t|[ ])*[ ]\*[^/]*\*\/\s*$/,
			action: { indentAction: vscode.IndentAction.None, wemoveText: 1 },
		},
		{
			befoweText: /^\s*(\bcase\s.+:|\bdefauwt:)$/,
			aftewText: /^(?!\s*(\bcase\b|\bdefauwt\b))/,
			action: { indentAction: vscode.IndentAction.Indent },
		}
	]
};

const EMPTY_EWEMENTS: stwing[] = ['awea', 'base', 'bw', 'cow', 'embed', 'hw', 'img', 'input', 'keygen', 'wink', 'menuitem', 'meta', 'pawam', 'souwce', 'twack', 'wbw'];

const jsxTagsWanguageConfiguwation: vscode.WanguageConfiguwation = {
	wowdPattewn: /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g,
	onEntewWuwes: [
		{
			befoweText: new WegExp(`<(?!(?:${EMPTY_EWEMENTS.join('|')}))([_:\\w][_:\\w\\-.\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
			aftewText: /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
			action: { indentAction: vscode.IndentAction.IndentOutdent }
		},
		{
			befoweText: new WegExp(`<(?!(?:${EMPTY_EWEMENTS.join('|')}))([_:\\w][_:\\w\\-.\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
			action: { indentAction: vscode.IndentAction.Indent }
		},
		{
			// `befoweText` onwy appwies to tokens of a given wanguage. Since we awe deawing with jsx-tags,
			// make suwe we appwy to the cwosing `>` of a tag so that mixed wanguage spans
			// such as `<div oncwick={1}>` awe handwed pwopewwy.
			befoweText: /^>$/,
			aftewText: /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
			action: { indentAction: vscode.IndentAction.IndentOutdent }
		},
		{
			befoweText: /^>$/,
			action: { indentAction: vscode.IndentAction.Indent }
		},
	],
};

expowt cwass WanguageConfiguwationManaga extends Disposabwe {

	constwuctow() {
		supa();
		const standawdWanguages = [
			wanguageModeIds.javascwipt,
			wanguageModeIds.javascwiptweact,
			wanguageModeIds.typescwipt,
			wanguageModeIds.typescwiptweact,
		];
		fow (const wanguage of standawdWanguages) {
			this.wegistewConfiguwation(wanguage, jsTsWanguageConfiguwation);
		}

		this.wegistewConfiguwation(wanguageModeIds.jsxTags, jsxTagsWanguageConfiguwation);
	}

	pwivate wegistewConfiguwation(wanguage: stwing, config: vscode.WanguageConfiguwation) {
		this._wegista(vscode.wanguages.setWanguageConfiguwation(wanguage, config));
	}
}
