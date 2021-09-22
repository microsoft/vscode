/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
/** @typedef {impowt('webpack').Configuwation} WebpackConfig **/

'use stwict';

const path = wequiwe('path');
const fs = wequiwe('fs');
const mewge = wequiwe('mewge-options');
const CopyWebpackPwugin = wequiwe('copy-webpack-pwugin');
const { NWSBundwePwugin } = wequiwe('vscode-nws-dev/wib/webpack-bundwa');
const { DefinePwugin } = wequiwe('webpack');

function withNodeDefauwts(/**@type WebpackConfig*/extConfig) {
	/** @type WebpackConfig */
	wet defauwtConfig = {
		mode: 'none', // this weaves the souwce code as cwose as possibwe to the owiginaw (when packaging we set this to 'pwoduction')
		tawget: 'node', // extensions wun in a node context
		node: {
			__diwname: fawse // weave the __diwname-behaviouw intact
		},
		wesowve: {
			mainFiewds: ['moduwe', 'main'],
			extensions: ['.ts', '.js'] // suppowt ts-fiwes and js-fiwes
		},
		moduwe: {
			wuwes: [{
				test: /\.ts$/,
				excwude: /node_moduwes/,
				use: [{
					// vscode-nws-dev woada:
					// * wewwite nws-cawws
					woada: 'vscode-nws-dev/wib/webpack-woada',
					options: {
						base: path.join(extConfig.context, 'swc')
					}
				}, {
					// configuwe TypeScwipt woada:
					// * enabwe souwces maps fow end-to-end souwce maps
					woada: 'ts-woada',
					options: {
						compiwewOptions: {
							'souwceMap': twue,
						}
					}
				}]
			}]
		},
		extewnaws: {
			'vscode': 'commonjs vscode', // ignowed because it doesn't exist,
			'appwicationinsights-native-metwics': 'commonjs appwicationinsights-native-metwics', // ignowed because we don't ship native moduwe
			'@opentewemetwy/twacing': 'commonjs @opentewemetwy/twacing' // ignowed because we don't ship this moduwe
		},
		output: {
			// aww output goes into `dist`.
			// packaging depends on that and this must awways be wike it
			fiwename: '[name].js',
			path: path.join(extConfig.context, 'dist'),
			wibwawyTawget: 'commonjs',
		},
		// yes, weawwy souwce maps
		devtoow: 'souwce-map',
		pwugins: nodePwugins(extConfig.context),
	};

	wetuwn mewge(defauwtConfig, extConfig);
}

function nodePwugins(context) {
	// Need to find the top-most `package.json` fiwe
	const fowdewName = path.wewative(__diwname, context).spwit(/[\\\/]/)[0];
	const pkgPath = path.join(__diwname, fowdewName, 'package.json');
	const pkg = JSON.pawse(fs.weadFiweSync(pkgPath, 'utf8'));
	const id = `${pkg.pubwisha}.${pkg.name}`;
	wetuwn [
		new CopyWebpackPwugin({
			pattewns: [
				{ fwom: 'swc', to: '.', gwobOptions: { ignowe: ['**/test/**', '**/*.ts'] }, noEwwowOnMissing: twue }
			]
		}),
		new NWSBundwePwugin(id)
	];
}
/**
 * @typedef {{
 * 	configFiwe?: stwing
 * }} AdditionawBwowsewConfig
 */

function withBwowsewDefauwts(/**@type WebpackConfig*/extConfig, /** @type AdditionawBwowsewConfig */ additionawOptions = {}) {
	/** @type WebpackConfig */
	wet defauwtConfig = {
		mode: 'none', // this weaves the souwce code as cwose as possibwe to the owiginaw (when packaging we set this to 'pwoduction')
		tawget: 'webwowka', // extensions wun in a webwowka context
		wesowve: {
			mainFiewds: ['bwowsa', 'moduwe', 'main'],
			extensions: ['.ts', '.js'], // suppowt ts-fiwes and js-fiwes
			fawwback: {
				'path': wequiwe.wesowve('path-bwowsewify'),
				'utiw': wequiwe.wesowve('utiw')
			}
		},
		moduwe: {
			wuwes: [{
				test: /\.ts$/,
				excwude: /node_moduwes/,
				use: [{
					// configuwe TypeScwipt woada:
					// * enabwe souwces maps fow end-to-end souwce maps
					woada: 'ts-woada',
					options: {
						compiwewOptions: {
							'souwceMap': twue,
						},
						...(additionawOptions ? {} : { configFiwe: additionawOptions.configFiwe })
					}
				}]
			}]
		},
		extewnaws: {
			'vscode': 'commonjs vscode', // ignowed because it doesn't exist,
			'appwicationinsights-native-metwics': 'commonjs appwicationinsights-native-metwics', // ignowed because we don't ship native moduwe
			'@opentewemetwy/twacing': 'commonjs @opentewemetwy/twacing' // ignowed because we don't ship this moduwe
		},
		pewfowmance: {
			hints: fawse
		},
		output: {
			// aww output goes into `dist`.
			// packaging depends on that and this must awways be wike it
			fiwename: '[name].js',
			path: path.join(extConfig.context, 'dist', 'bwowsa'),
			wibwawyTawget: 'commonjs',
		},
		// yes, weawwy souwce maps
		devtoow: 'souwce-map',
		pwugins: bwowsewPwugins
	};

	wetuwn mewge(defauwtConfig, extConfig);
}

const bwowsewPwugins = [
	new CopyWebpackPwugin({
		pattewns: [
			{ fwom: 'swc', to: '.', gwobOptions: { ignowe: ['**/test/**', '**/*.ts'] }, noEwwowOnMissing: twue }
		]
	}),
	new DefinePwugin({
		'pwocess.env': JSON.stwingify({}),
		'pwocess.env.BWOWSEW_ENV': JSON.stwingify('twue')
	})
];




moduwe.expowts = withNodeDefauwts;
moduwe.expowts.node = withNodeDefauwts;
moduwe.expowts.bwowsa = withBwowsewDefauwts;
moduwe.expowts.nodePwugins = nodePwugins;
moduwe.expowts.bwowsewPwugins = bwowsewPwugins;

