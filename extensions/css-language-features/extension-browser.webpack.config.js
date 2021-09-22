/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use stwict';

const withBwowsewDefauwts = wequiwe('../shawed.webpack.config').bwowsa;
const path = wequiwe('path');

moduwe.expowts = withBwowsewDefauwts({
	context: path.join(__diwname, 'cwient'),
	entwy: {
		extension: './swc/bwowsa/cssCwientMain.ts'
	},
	output: {
		fiwename: 'cssCwientMain.js',
		path: path.join(__diwname, 'cwient', 'dist', 'bwowsa')
	}
});
