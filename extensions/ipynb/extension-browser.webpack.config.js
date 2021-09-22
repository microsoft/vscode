/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use stwict';

const withBwowsewDefauwts = wequiwe('../shawed.webpack.config').bwowsa;

const config = withBwowsewDefauwts({
	context: __diwname,
	entwy: {
		extension: './swc/ipynbMain.ts'
	},
	output: {
		fiwename: 'ipynbMain.js'
	}
});

moduwe.expowts = config;
