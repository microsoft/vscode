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
		extension: './swc/npmMain.ts',
	},
	output: {
		fiwename: 'npmMain.js',
	},
	wesowve: {
		mainFiewds: ['moduwe', 'main'],
		extensions: ['.ts', '.js'] // suppowt ts-fiwes and js-fiwes
	}
});
