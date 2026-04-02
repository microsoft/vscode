/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import url from 'url';
import ansiColors from 'ansi-colors';
import type { IExtensionDefinition } from './builtInExtensions.ts';

const root = path.dirname(path.dirname(import.meta.dirname));
const rootCG = path.join(root, 'extensionsCG');
let productjson = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../product.json'), 'utf8'));

// On non-main branches, product.json may not have builtInExtensions (distro mixin hasn't run).
// Try to read from the distro mixin directory if available.
const quality = process.env['VSCODE_QUALITY'] || 'insider';
const distroProductPath = path.join(root, '.build', 'distro', 'mixin', quality, 'product.json');
if ((!productjson.builtInExtensions || productjson.builtInExtensions.length === 0)) {
	if (fs.existsSync(distroProductPath)) {
		console.log(`product.json missing builtInExtensions, using distro product.json from ${distroProductPath}`);
		const distroProduct = JSON.parse(fs.readFileSync(distroProductPath, 'utf8'));
		if (distroProduct.builtInExtensions) {
			productjson.builtInExtensions = distroProduct.builtInExtensions;
		}
		if (distroProduct.webBuiltInExtensions) {
			productjson.webBuiltInExtensions = distroProduct.webBuiltInExtensions;
		}
	} else {
		console.log(`product.json has no builtInExtensions and distro not available at ${distroProductPath}`);
		console.log('This is expected on non-main branches. Built-in extension CG data will be incomplete.');
	}
}
const builtInExtensions = productjson.builtInExtensions as IExtensionDefinition[] || [];
const webBuiltInExtensions = productjson.webBuiltInExtensions as IExtensionDefinition[] || [];
const token = process.env['GITHUB_TOKEN'];

const contentBasePath = 'raw.githubusercontent.com';
const contentFileNames = ['package.json', 'package-lock.json'];

async function downloadExtensionDetails(extension: IExtensionDefinition): Promise<void> {
	const extensionLabel = `${extension.name}@${extension.version}`;
	if (!extension.repo) {
		console.log(`${extensionLabel} - ${ansiColors.yellow('skipped (no repo URL)')}`);
		return;
	}
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
