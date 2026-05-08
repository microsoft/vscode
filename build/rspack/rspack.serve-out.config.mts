/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { type Configuration, HtmlRspackPlugin, rspack } from '@rspack/core';
import { ComponentExplorerPlugin } from '@vscode/component-explorer-webpack-plugin';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function findFreePort(startPort: number): Promise<number> {
	return new Promise(resolve => {
		const server = net.createServer();
		server.listen(startPort, 'localhost', () => {
			server.close(() => resolve(startPort));
		});
		server.on('error', () => resolve(findFreePort(startPort + 1)));
	});
}

const port = await findFreePort(5123);

export default {
	context: repoRoot,
	mode: 'development',
	target: 'web',
	devtool: 'source-map',
	entry: {
		workbench: path.join(repoRoot, 'out', 'vs', 'code', 'browser', 'workbench', 'workbench.js'),
	},
	output: {
		path: path.join(repoRoot, '.build', 'rspack-serve-out'),
		filename: 'bundled/[name].js',
		chunkFilename: 'bundled/[name].js',
		assetModuleFilename: 'bundled/assets/[name][ext][query]',
		publicPath: '/',
		clean: true,
		devtoolModuleFilenameTemplate: (info: { absoluteResourcePath: string }) => {
			return `file:///${info.absoluteResourcePath.replace(/\\/g, '/')}`;
		},
	},
	resolve: {
		fallback: {
			path: path.resolve(repoRoot, 'node_modules', 'path-browserify'),
			fs: false,
			module: false,
		},
	},
	resolveLoader: {
		modules: [path.join(__dirname, 'node_modules'), 'node_modules'],
	},
	experiments: {
		css: true,
	},
	module: {
		rules: [
			{
				test: /\.js$/,
				enforce: 'pre',
				use: ['source-map-loader'],
			},
			{
				test: /\.css$/,
				type: 'css',
			},
			{
				test: /\.ttf$/,
				type: 'asset/resource',
			},
			{
				// Built-in theme JSON files use JSONC (comments / trailing
				// commas), so import them as raw strings and let VS Code's
				// JSON parser handle them.
				test: /[\\/]extensions[\\/]theme-defaults[\\/]themes[\\/].*\.json$/,
				type: 'asset/source',
			},
		],
	},
	plugins: [
		new ComponentExplorerPlugin({
			include: 'out/**/*.fixture.js',
		}),
		new rspack.NormalModuleReplacementPlugin(/\.css$/, resource => {
			if (!resource.request.startsWith('.')) {
				return;
			}

			const requestedPath = path.resolve(resource.context, resource.request);
			const outVsSegment = `${path.sep}out${path.sep}vs${path.sep}`;
			const srcVsSegment = `${path.sep}src${path.sep}vs${path.sep}`;

			if (!requestedPath.includes(outVsSegment) || fs.existsSync(requestedPath)) {
				return;
			}

			const sourceCssPath = requestedPath.replace(outVsSegment, srcVsSegment);
			if (sourceCssPath !== requestedPath && fs.existsSync(sourceCssPath)) {
				resource.request = sourceCssPath;
			}
		}),
		new HtmlRspackPlugin({
			filename: 'index.html',
			template: path.join(__dirname, 'workbench-rspack.html'),
			chunks: ['workbench'],
		}),
	],
	lazyCompilation: false,
	devServer: {
		host: 'localhost',
		port,
		hot: true,
		liveReload: true,
		compress: false,
		headers: {
			'Access-Control-Allow-Origin': '*',
		},
		devMiddleware: {
			writeToDisk: false,
		},
		static: [
			{
				directory: repoRoot,
				publicPath: '/',
				watch: false,
			},
		],
		client: {
			overlay: false,
		},
		allowedHosts: 'all',
	},
	watchOptions: {
		// Poll the out/ directory since it's gitignored and may be excluded by default
		ignored: /node_modules/,
	},
} satisfies Configuration;
