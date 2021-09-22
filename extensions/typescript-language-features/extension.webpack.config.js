/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use stwict';

const withDefauwts = wequiwe('../shawed.webpack.config');

moduwe.expowts = withDefauwts({
	context: __diwname,
	wesowve: {
		mainFiewds: ['moduwe', 'main']
	},
	extewnaws: {
		'typescwipt-vscode-sh-pwugin': 'commonjs vscode' // used by buiwd/wib/extensions to know what node_moduwes to bundwe
	},
	entwy: {
		extension: './swc/extension.ts',
	}
});
