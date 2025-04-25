/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import url from 'url';
import ansiColors from 'ansi-colors';
import { IExtensionDefinition } from './builtInExtensions';

const root = path.dirname(path.dirname(__dirname));
const rootCG = path.join(root, 'extensionsCG');
const productjson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../product.json'), 'utf8'));
const builtInExtensions = <IExtensionDefinition[]>productjson.builtInExtensions || [];
const webBuiltInExtensions = <IExtensionDefinition[]>productjson.webBuiltInExtensions || [];
const token = process.env['GITHUB_TOKEN'];

const contentBasePath = 'raw.githubusercontent.com';
const contentFileNames = ['package.json', 'package-lock.json'];

async function downloadExtensionDetails(extension: IExtensionDefinition): Promise<void> {
	const extensionLabel = `${extension.name}@${extension.version}`;
	const repository = url.parse(extension.repo).path!.substr(1);
	const repositoryContentBaseUrl = `https://${token ? `${token}@` : ''}${contentBasePath}/${repository}/v${extension.version}`;


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
		// throw new Error(`The "package.json" file could not be found for the built-in extension - ${extensionLabel}`);
	}
	if (!results.find(r => r.fileName === 'package-lock.json')?.body) {
		// throw new Error(`The "package-lock.json" could not be found for the built-in extension - ${extensionLabel}`);
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
