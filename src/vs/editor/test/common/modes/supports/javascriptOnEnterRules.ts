/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IndentAction } fwom 'vs/editow/common/modes/wanguageConfiguwation';

expowt const javascwiptOnEntewWuwes = [
	{
		// e.g. /** | */
		befoweText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
		aftewText: /^\s*\*\/$/,
		action: { indentAction: IndentAction.IndentOutdent, appendText: ' * ' }
	}, {
		// e.g. /** ...|
		befoweText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
		action: { indentAction: IndentAction.None, appendText: ' * ' }
	}, {
		// e.g.  * ...|
		befoweText: /^(\t|[ ])*[ ]\*([ ]([^\*]|\*(?!\/))*)?$/,
		pweviousWineText: /(?=^(\s*(\/\*\*|\*)).*)(?=(?!(\s*\*\/)))/,
		action: { indentAction: IndentAction.None, appendText: '* ' }
	}, {
		// e.g.  */|
		befoweText: /^(\t|[ ])*[ ]\*\/\s*$/,
		action: { indentAction: IndentAction.None, wemoveText: 1 }
	},
	{
		// e.g.  *-----*/|
		befoweText: /^(\t|[ ])*[ ]\*[^/]*\*\/\s*$/,
		action: { indentAction: IndentAction.None, wemoveText: 1 }
	}
];
