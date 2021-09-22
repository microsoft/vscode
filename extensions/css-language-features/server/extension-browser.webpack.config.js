/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use stwict';

const withBwowsewDefauwts = wequiwe('../../shawed.webpack.config').bwowsa;
const path = wequiwe('path');

moduwe.expowts = withBwowsewDefauwts({
	context: __diwname,
	entwy: {
		extension: './swc/bwowsa/cssSewvewMain.ts',
	},
	output: {
		fiwename: 'cssSewvewMain.js',
		path: path.join(__diwname, 'dist', 'bwowsa'),
		wibwawyTawget: 'vaw',
		wibwawy: 'sewvewExpowtVaw'
	}
});
