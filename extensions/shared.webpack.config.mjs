/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import path from 'node:path';
import fs from 'node:fs';
import merge from 'merge-options';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import webpack from 'webpack';
import { createRequire } from 'node:module';

/** @typedef {import('webpack').Configuration} WebpackConfig **/

const require = createRequire(import.meta.url);

const tsLoaderOptions = {
	compilerOptions: {
		'sourceMap': true,
	},
	onlyCompileBundledFiles: true,
};

function withNodeDefaults(/**@type WebpackConfig & { context: string }*/extConfig) {
	const defaultConfig = {
		mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
		target: 'node', // extensions run in a node context
		node: {
			__dirname: false // leave the __dirname-behaviour intact
		},

		resolve: {
			conditionNames: ['import', 'require', 'node-addons', 'node'],
			mainFields: ['module', 'main'],
			extensions: ['.ts', '.js'], // support ts-files and js-files
			extensionAlias: {
				// this is needed to resolve dynamic imports that now require the .js extension
				'.js': ['.js', '.ts'],
			}
		},
		module: {
			rules: [{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [
					{
						// configure TypeScript loader:
						// * enable sources maps for end-to-end source maps
						loader: 'ts-loader',
						options: tsLoaderOptions
					},
					// disable mangling for now, SEE https://github.com/microsoft/vscode/issues/204692
					// {
					// 	loader: path.resolve(import.meta.dirname, 'mangle-loader.js'),
					// 	options: {
					// 		configFile: path.join(extConfig.context, 'tsconfig.json')
					// 	},
					// },
				]
			}]
		},
		externals: {
			'electron': 'commonjs electron', // ignored to avoid bundling from node_modules
			'vscode': 'commonjs vscode', // ignored because it doesn't exist,
			'applicationinsights-native-metrics': 'commonjs applicationinsights-native-metrics', // ignored because we don't ship native module
			'@azure/functions-core': 'commonjs azure/functions-core', // optional dependency of appinsights that we don't use
			'@opentelemetry/tracing': 'commonjs @opentelemetry/tracing', // ignored because we don't ship this module
			'@opentelemetry/instrumentation': 'commonjs @opentelemetry/instrumentation', // ignored because we don't ship this module
			'@azure/opentelemetry-instrumentation-azure-sdk': 'commonjs @azure/opentelemetry-instrumentation-azure-sdk', // ignored because we don't ship this module
		},
		output: {
			// all output goes into `dist`.
			// packaging depends on that and this must always be like it
			filename: '[name].js',
			path: path.join(extConfig.context, 'dist'),
			libraryTarget: 'commonjs',
		},
		// yes, really source maps
		devtool: 'source-map',
		plugins: nodePlugins(extConfig.context),
	};

	return merge(defaultConfig, extConfig);
}

/**
 *
 * @param {string} context
 */
function nodePlugins(context) {
	// Need to find the top-most `package.json` file
	const folderName = path.relative(import.meta.dirname, context).split(/[\\\/]/)[0];
	const pkgPath = path.join(import.meta.dirname, folderName, 'package.json');
	const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
	const id = `${pkg.publisher}.${pkg.name}`;
	return [
		new CopyWebpackPlugin({
			patterns: [
				{ from: 'src', to: '.', globOptions: { ignore: ['**/test/**', '**/*.ts'] }, noErrorOnMissing: true }
			]
		})
	];
}
/**
 * @typedef {{
 * 	configFile?: string
 * }} AdditionalBrowserConfig
 */

function withBrowserDefaults(/**@type WebpackConfig & { context: string }*/extConfig, /** @type AdditionalBrowserConfig */ additionalOptions = {}) {
	/** @type WebpackConfig */
	const defaultConfig = {
		mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
		target: 'webworker', // extensions run in a webworker context
		resolve: {
			mainFields: ['browser', 'module', 'main'],
			extensions: ['.ts', '.js'], // support ts-files and js-files
			fallback: {
				'path': require.resolve('path-browserify'),
				'os': require.resolve('os-browserify'),
				'util': require.resolve('util')
			},
			extensionAlias: {
				// this is needed to resolve dynamic imports that now require the .js extension
				'.js': ['.js', '.ts'],
			},
		},
		module: {
			rules: [{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [
					{
						// configure TypeScript loader:
						// * enable sources maps for end-to-end source maps
						loader: 'ts-loader',
						options: {
							...tsLoaderOptions,
							//							...(additionalOptions ? {} : { configFile: additionalOptions.configFile }),
						}
					},
					// disable mangling for now, SEE https://github.com/microsoft/vscode/issues/204692
					// {
					// 	loader: path.resolve(import.meta.dirname, 'mangle-loader.js'),
					// 	options: {
					// 		configFile: path.join(extConfig.context, additionalOptions?.configFile ?? 'tsconfig.json')
					// 	},
					// },
				]
			}, {
				test: /\.wasm$/,
				type: 'asset/inline'
			}]
		},
		externals: {
			'vscode': 'commonjs vscode', // ignored because it doesn't exist,
			'applicationinsights-native-metrics': 'commonjs applicationinsights-native-metrics', // ignored because we don't ship native module
			'@azure/functions-core': 'commonjs azure/functions-core', // optional dependency of appinsights that we don't use
			'@opentelemetry/tracing': 'commonjs @opentelemetry/tracing', // ignored because we don't ship this module
			'@opentelemetry/instrumentation': 'commonjs @opentelemetry/instrumentation', // ignored because we don't ship this module
			'@azure/opentelemetry-instrumentation-azure-sdk': 'commonjs @azure/opentelemetry-instrumentation-azure-sdk', // ignored because we don't ship this module
		},
		performance: {
			hints: false
		},
		output: {
			// all output goes into `dist`.
			// packaging depends on that and this must always be like it
			filename: '[name].js',
			path: path.join(extConfig.context, 'dist', 'browser'),
			libraryTarget: 'commonjs',
		},
		// yes, really source maps
		devtool: 'source-map',
		plugins: browserPlugins(extConfig.context)
	};

	return merge(defaultConfig, extConfig);
}

/**
 *
 * @param {string} context
 */
function browserPlugins(context) {
	// Need to find the top-most `package.json` file
	// const folderName = path.relative(__dirname, context).split(/[\\\/]/)[0];
	// const pkgPath = path.join(__dirname, folderName, 'package.json');
	// const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
	// const id = `${pkg.publisher}.${pkg.name}`;
	return [
		new webpack.optimize.LimitChunkCountPlugin({
			maxChunks: 1
		}),
		new CopyWebpackPlugin({
			patterns: [
				{ from: 'src', to: '.', globOptions: { ignore: ['**/test/**', '**/*.ts'] }, noErrorOnMissing: true }
			]
		}),
		new webpack.DefinePlugin({
			'process.platform': JSON.stringify('web'),
			'process.env': JSON.stringify({}),
			'process.env.BROWSER_ENV': JSON.stringify('true')
		})
	];
}

export default withNodeDefaults;
export { withNodeDefaults as node, withBrowserDefaults as browser, nodePlugins, browserPlugins };
