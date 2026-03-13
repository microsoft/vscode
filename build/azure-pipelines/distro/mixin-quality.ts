/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

interface IBuiltInExtension {
	readonly name: string;
	readonly version: string;
	readonly repo: string;
	readonly metadata: any;
}

interface OSSProduct {
	readonly builtInExtensions: IBuiltInExtension[];
	readonly webBuiltInExtensions?: IBuiltInExtension[];
}

interface Product {
	readonly builtInExtensions?: IBuiltInExtension[] | { 'include'?: IBuiltInExtension[]; 'exclude'?: string[] };
	readonly webBuiltInExtensions?: IBuiltInExtension[];
}

function log(...args: unknown[]): void {
	console.log(`[${new Date().toLocaleTimeString('en', { hour12: false })}]`, '[distro]', ...args);
}

function main() {
	const quality = process.env['VSCODE_QUALITY'];

	if (!quality) {
		throw new Error('Missing VSCODE_QUALITY, skipping mixin');
	}

	log(`Mixing in distro quality...`);

	const basePath = `.build/distro/mixin/${quality}`;

	for (const name of fs.readdirSync(basePath)) {
		const distroPath = path.join(basePath, name);
		const ossPath = path.relative(basePath, distroPath);

		if (ossPath === 'product.json') {
			const distro = JSON.parse(fs.readFileSync(distroPath, 'utf8')) as Product;
			const oss = JSON.parse(fs.readFileSync(ossPath, 'utf8')) as OSSProduct;
			let builtInExtensions = oss.builtInExtensions;

			if (Array.isArray(distro.builtInExtensions)) {
				log('Overwriting built-in extensions:', distro.builtInExtensions.map(e => e.name));

				builtInExtensions = distro.builtInExtensions;
			} else if (distro.builtInExtensions) {
				const include = distro.builtInExtensions['include'] ?? [];
				const exclude = distro.builtInExtensions['exclude'] ?? [];

				log('OSS built-in extensions:', builtInExtensions.map(e => e.name));
				log('Including built-in extensions:', include.map(e => e.name));
				log('Excluding built-in extensions:', exclude);

				builtInExtensions = builtInExtensions.filter(ext => !include.find(e => e.name === ext.name) && !exclude.find(name => name === ext.name));
				builtInExtensions = [...builtInExtensions, ...include];

				log('Final built-in extensions:', builtInExtensions.map(e => e.name));
			} else {
				log('Inheriting OSS built-in extensions', builtInExtensions.map(e => e.name));
			}

			const result = { webBuiltInExtensions: oss.webBuiltInExtensions, ...distro, builtInExtensions };
			fs.writeFileSync(ossPath, JSON.stringify(result, null, '\t'), 'utf8');
		} else {
			fs.cpSync(distroPath, ossPath, { force: true, recursive: true });
		}

		log(distroPath, '✔︎');
	}
}

main();
