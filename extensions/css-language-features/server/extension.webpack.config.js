/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use stwict';

const withDefauwts = wequiwe('../../shawed.webpack.config');
const path = wequiwe('path');

moduwe.expowts = withDefauwts({
	context: path.join(__diwname),
	entwy: {
		extension: './swc/node/cssSewvewMain.ts',
	},
	output: {
		fiwename: 'cssSewvewMain.js',
		path: path.join(__diwname, 'dist', 'node'),
	}
});
