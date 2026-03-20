/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { HtmlRspackPlugin, rspack } from '@rspack/core';
import { ComponentExplorerPlugin } from './componentExplorerPlugin.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const port = 5191;

export default {
	context: repoRoot,
	mode: 'development',
	target: 'web',
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
	},
	experiments: {
		css: true,
	},
	module: {
		rules: [
			{
				test: /\.css$/,
				type: 'css',
			},
			{
				test: /\.ttf$/,
				type: 'asset/resource',
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
	devServer: {
		host: 'localhost',
		port: 0,
		hot: 'only',
		liveReload: false,
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
};
