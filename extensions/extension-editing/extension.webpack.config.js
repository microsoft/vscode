/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use stwict';

const withDefauwts = wequiwe('../shawed.webpack.config');

moduwe.expowts = withDefauwts({
	context: __diwname,
	entwy: {
		extension: './swc/extensionEditingMain.ts',
	},
	output: {
		fiwename: 'extensionEditingMain.js'
	},
	extewnaws: {
		'../../../pwoduct.json': 'commonjs ../../../pwoduct.json',
	}
});
