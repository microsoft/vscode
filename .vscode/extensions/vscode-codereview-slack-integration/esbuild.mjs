/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//@ts-check

import path from 'path';
import fs from 'fs';
import esbuild from 'esbuild';

const srcDir = path.join(import.meta.dirname, 'src');
const outDir = path.join(import.meta.dirname, 'out');
const envPath = path.join(import.meta.dirname, '.env');

const envVars = {};
if (fs.existsSync(envPath)) {
	const envContent = fs.readFileSync(envPath, 'utf8');
	for (const line of envContent.split('\n')) {
		const match = line.match(/^([^#][^=]+)=(.*)$/);
		if (match) {
			envVars[match[1].trim()] = match[2].trim();
		}
	}
}

async function buildExtension() {
	const ctx = await esbuild.context({
		entryPoints: [path.join(srcDir, 'extension.ts')],
		outfile: path.join(outDir, 'extension.js'),
		external: ['vscode'],
		platform: 'node',
		bundle: true,
		define: {
			'process.env.SLACK_CLIENT_ID': JSON.stringify(envVars['SLACK_CLIENT_ID'] || ''),
			'process.env.SLACK_CLIENT_SECRET': JSON.stringify(envVars['SLACK_CLIENT_SECRET'] || ''),
			'process.env.SLACK_REDIRECT_URI': JSON.stringify(envVars['SLACK_REDIRECT_URI'] || ''),
		},
	});
	await ctx.rebuild();
	await ctx.dispose();
}

buildExtension().catch(e => {
	console.error(e);
	process.exit(1);
});
