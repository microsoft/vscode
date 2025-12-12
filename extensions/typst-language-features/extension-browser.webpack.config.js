/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
import CopyPlugin from 'copy-webpack-plugin';
import { browser as withBrowserDefaults, browserPlugins } from '../shared.webpack.config.mjs';

const baseConfig = withBrowserDefaults({
	context: import.meta.dirname,
	entry: {
		extension: './src/extension.browser.ts',
	},
	resolve: {
		fallback: {
			'child_process': false,
			'fs': false
		},
		alias: {
			// Use browser-specific typstyle loader instead of the npm package
			'@typstyle/typstyle-wasm-bundler': false
		}
	},
	plugins: [
		...browserPlugins(import.meta.dirname),
		// Copy WASM files from node_modules to dist
		new CopyPlugin({
			patterns: [
				// Typst compiler WASM
				{
					from: 'node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm',
					to: 'wasm/typst_ts_web_compiler_bg.wasm',
					noErrorOnMissing: true
				},
				// Typst renderer WASM (for SVG preview)
				{
					from: 'node_modules/@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm',
					to: 'wasm/typst_ts_renderer_bg.wasm',
					noErrorOnMissing: true
				},
				// Typstyle formatter WASM for browser manual loading
				{
					from: 'node_modules/@typstyle/typstyle-wasm-bundler/typstyle_wasm_bg.wasm',
					to: 'wasm/typstyle_wasm_bg.wasm',
					noErrorOnMissing: true
				}
			],
		}),
	],
});

export default baseConfig;
