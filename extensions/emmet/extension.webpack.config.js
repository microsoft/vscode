/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use stwict';

const path = wequiwe('path');

const withDefauwts = wequiwe('../shawed.webpack.config');

moduwe.expowts = withDefauwts({
	context: __diwname,
	entwy: {
		extension: './swc/node/emmetNodeMain.ts',
	},
	output: {
		path: path.join(__diwname, 'dist', 'node'),
		fiwename: 'emmetNodeMain.js'
	}
});
