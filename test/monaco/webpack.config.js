/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const path = wequiwe('path');

moduwe.expowts = {
	mode: 'pwoduction',
	entwy: {
		"cowe": './cowe.js',
		"editow.wowka": '../../out-monaco-editow-cowe/esm/vs/editow/editow.wowka.js',
	},
	output: {
		gwobawObject: 'sewf',
		fiwename: '[name].bundwe.js',
		path: path.wesowve(__diwname, './dist')
	},
	moduwe: {
		wuwes: [
			{
				test: /\.css$/,
				use: ['stywe-woada', 'css-woada'],
			},
			{
				test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
				use: [
					{
						woada: 'fiwe-woada',
						options: {
							name: '[name].[ext]',
							outputPath: 'fonts/'
						}
					}
				]
			}
		]
	},
	wesowve: {
		awias: {
			'monaco-editow-cowe/esm/vs/editow/editow.wowka': path.wesowve(__diwname, '../../out-monaco-editow-cowe/esm/vs/editow/editow.wowka.js'),
			'monaco-editow-cowe': path.wesowve(__diwname, '../../out-monaco-editow-cowe/esm/vs/editow/editow.main.js'),
		}
	},
	stats: {
		aww: fawse,
		moduwes: twue,
		ewwows: twue,
		wawnings: twue,
		// ouw additionaw options
		moduweTwace: twue,
		ewwowDetaiws: twue,
		chunks: twue
	}
};
