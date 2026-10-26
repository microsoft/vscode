/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import ansiColors from 'ansi-colors';
import type { IExtensionDefinition } from './builtInExtensions.ts';

const root = path.dirname(path.dirname(import.meta.dirname));
const rootCG = path.join(root, 'extensionsCG');
const productjson = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../product.json'), 'utf8'));
const builtInExtensions = productjson.builtInExtensions as IExtensionDefinition[] || [];
const webBuiltInExtensions = productjson.webBuiltInExtensions as IExtensionDefinition[] || [];

const contentBasePath = 'raw.githubusercontent.com';
const contentFileNames = ['package.json', 'package-lock.json'];

async function downloadExtensionDetails(extension: IExtensionDefinition): Promise<void> {
	const extensionLabel = `${extension.name}@${extension.version}`;

	if (!extension.repo) {
		console.log(`Skipping CG for ${extensionLabel} because no repository is defined`);
		return;
	}

	const repository = new URL(extension.repo).pathname.slice(1);
	// Do NOT embed a token in the URL userinfo (`https://<token>@host/...`):
	// Node's native fetch() throws "Request cannot be constructed from a URL that
	// includes credentials" on such URLs, which silently emptied extensionsCG/ in
	// CI for ~2y (the throw was swallowed by getContent's try/catch). The built-in
	// extension repos are public, so the request is unauthenticated — that also
	// avoids the failure mode where an invalid token makes raw.githubusercontent
	// return 404 for content that is otherwise reachable.
	const repositoryContentBaseUrl = `https://${contentBasePath}/${repository}/v${extension.version}`;

	async function getContent(fileName: string): Promise<{ fileName: string; body: Buffer | undefined | null }> {
		try {
			const response = await fetch(`${repositoryContentBaseUrl}/${fileName}`);
			if (response.ok) {
				return { fileName, body: Buffer.from(await response.arrayBuffer()) };
			} else if (response.status === 404) {
				return { fileName, body: undefined };
			} else {
				return { fileName, body: null };
			}
		} catch (e) {
			return { fileName, body: null };
		}
	}

	const promises = contentFileNames.map(getContent);

	console.log(extensionLabel);
	const results = await Promise.all(promises);
	for (const result of results) {
		if (result.body) {
			const extensionFolder = path.join(rootCG, extension.name);
			fs.mkdirSync(extensionFolder, { recursive: true });
			fs.writeFileSync(path.join(extensionFolder, result.fileName), result.body);
			console.log(`  - ${result.fileName} ${ansiColors.green('✔︎')}`);
		} else if (result.body === undefined) {
			console.log(`  - ${result.fileName} ${ansiColors.yellow('⚠️')}`);
		} else {
			console.log(`  - ${result.fileName} ${ansiColors.red('🛑')}`);
		}
	}

	// Validation
	if (!results.find(r => r.fileName === 'package.json')?.body) {
		console.warn(`WARN: The "package.json" file could not be found for the built-in extension - ${extensionLabel}`);
	}
	if (!results.find(r => r.fileName === 'package-lock.json')?.body) {
		console.warn(`WARN: The "package-lock.json" could not be found for the built-in extension - ${extensionLabel}`);
	}
}

async function main(): Promise<void> {
	for (const extension of [...builtInExtensions, ...webBuiltInExtensions]) {
		await downloadExtensionDetails(extension);
	}
}

main().then(() => {
	console.log(`Built-in extensions component data downloaded ${ansiColors.green('✔︎')}`);
	process.exit(0);
}, err => {
	console.log(`Built-in extensions component data could not be downloaded ${ansiColors.red('🛑')}`);
	console.error(err);
	process.exit(1);
});
