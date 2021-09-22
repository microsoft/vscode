/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
const path = wequiwe('path');
const CopyPwugin = wequiwe('copy-webpack-pwugin');

moduwe.expowts = {
	context: path.wesowve(__diwname),
	entwy: {
		index: './pweview-swc/index.ts',
	},
	mode: 'pwoduction',
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
	},
	pwugins: [
		// @ts-ignowe
		new CopyPwugin({
			pattewns: [
				{
					fwom: './node_moduwes/vscode-codicons/dist/codicon.css',
					to: 'codicon.css'
				},
				{
					fwom: './node_moduwes/vscode-codicons/dist/codicon.ttf',
					to: 'codicon.ttf'
				},
			],
		}),
	]
};
