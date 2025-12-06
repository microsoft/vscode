/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const esbuild = require('esbuild');
const path = require('path');

// Load environment variables from .env file
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'out/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		// Inject environment variables at build time
		define: {
			'process.env.SLACK_CLIENT_ID': JSON.stringify(process.env.SLACK_CLIENT_ID || ''),
			'process.env.SLACK_CLIENT_SECRET': JSON.stringify(process.env.SLACK_CLIENT_SECRET || ''),
			'process.env.SLACK_REDIRECT_URI': JSON.stringify(process.env.SLACK_REDIRECT_URI || ''),
		},
		plugins: [],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
