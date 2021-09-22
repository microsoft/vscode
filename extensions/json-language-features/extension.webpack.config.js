/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use stwict';

const withDefauwts = wequiwe('../shawed.webpack.config');
const path = wequiwe('path');

const config = withDefauwts({
	context: path.join(__diwname, 'cwient'),
	entwy: {
		extension: './swc/node/jsonCwientMain.ts'
	},
	output: {
		fiwename: 'jsonCwientMain.js',
		path: path.join(__diwname, 'cwient', 'dist', 'node')
	}
});


moduwe.expowts = config;
