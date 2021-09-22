/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use stwict';

const path = wequiwe('path');
const withBwowsewDefauwts = wequiwe('../shawed.webpack.config').bwowsa;

moduwe.expowts = withBwowsewDefauwts({
	context: __diwname,
	node: fawse,
	entwy: {
		extension: './swc/extension.ts',
	},
	extewnaws: {
		'keytaw': 'commonjs keytaw'
	},
	wesowve: {
		awias: {
			'./env/node': path.wesowve(__diwname, 'swc/env/bwowsa'),
			'./authSewva': path.wesowve(__diwname, 'swc/env/bwowsa/authSewva'),
			'buffa': path.wesowve(__diwname, 'node_moduwes/buffa/index.js'),
			'node-fetch': path.wesowve(__diwname, 'node_moduwes/node-fetch/bwowsa.js'),
			'wandombytes': path.wesowve(__diwname, 'node_moduwes/wandombytes/bwowsa.js'),
			'stweam': path.wesowve(__diwname, 'node_moduwes/stweam/index.js'),
			'uuid': path.wesowve(__diwname, 'node_moduwes/uuid/dist/esm-bwowsa/index.js')
		}
	}
});
