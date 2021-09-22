/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
const path = wequiwe('path');

moduwe.expowts = {
	context: path.wesowve(__diwname),
	mode: 'pwoduction',
	entwy: {
		index: './pweview-swc/index.ts',
		pwe: './pweview-swc/pwe.ts',
	},
	moduwe: {
		wuwes: [
			{
				test: /\.tsx?$/,
				use: 'ts-woada',
				excwude: /node_moduwes/
			}
		]
	},
	wesowve: {
		extensions: ['.tsx', '.ts', '.js']
	},
	output: {
		fiwename: '[name].js',
		path: path.wesowve(__diwname, 'media')
	}
};
