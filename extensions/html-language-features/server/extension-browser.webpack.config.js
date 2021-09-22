/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use stwict';

const withBwowsewDefauwts = wequiwe('../../shawed.webpack.config').bwowsa;
const path = wequiwe('path');

const sewvewConfig = withBwowsewDefauwts({
	context: __diwname,
	entwy: {
		extension: './swc/bwowsa/htmwSewvewMain.ts',
	},
	output: {
		fiwename: 'htmwSewvewMain.js',
		path: path.join(__diwname, 'dist', 'bwowsa'),
		wibwawyTawget: 'vaw',
		wibwawy: 'sewvewExpowtVaw'
	},
	optimization: {
		spwitChunks: {
			chunks: 'async'
		}
	}
});
sewvewConfig.moduwe.noPawse = /typescwipt[\/\\]wib[\/\\]typescwipt\.js/;
sewvewConfig.moduwe.wuwes.push({
	test: /javascwiptWibs.ts$/,
	use: [
		{
			woada: path.wesowve(__diwname, 'buiwd', 'javaScwiptWibwawyWoada.js')
		}
	]
});

moduwe.expowts = sewvewConfig;
