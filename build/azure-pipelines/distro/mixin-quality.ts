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

type TrustedAuthAccess = string[] | { [providerId: string]: string[] };

interface OSSProduct {
	readonly builtInExtensions: IBuiltInExtension[];
	readonly webBuiltInExtensions?: IBuiltInExtension[];
	readonly trustedExtensionAuthAccess?: TrustedAuthAccess;
}

interface Product {
	readonly builtInExtensions?: IBuiltInExtension[] | { 'include'?: IBuiltInExtension[]; 'exclude'?: string[] };
	readonly webBuiltInExtensions?: IBuiltInExtension[];
	readonly trustedExtensionAuthAccess?: TrustedAuthAccess;
}

/**
 * The distro's sign-in trust, plus what the OSS product.json trusts the OSS built-in extensions with, so a
 * built-in this repository adds keeps it (e.g. using the GitHub account VS Code is signed in with, without
 * asking). Only extensions the OSS product.json builds in, and only per provider.
 */
function mergeTrustedAuthAccess(distro: TrustedAuthAccess | undefined, oss: TrustedAuthAccess | undefined, ossBuiltIns: IBuiltInExtension[]): TrustedAuthAccess | undefined {
	if (!oss || Array.isArray(oss)) {
		return distro;
	}
	if (Array.isArray(distro)) {
		log('The distro trusts extensions with every sign-in (an array); not adding the OSS built-ins to it');
		return distro;
	}
	const ours = new Set(ossBuiltIns.map(e => e.name.toLowerCase()));
	const merged: { [providerId: string]: string[] } = { ...(distro ?? {}) };
	for (const [provider, ids] of Object.entries(oss)) {
		for (const id of ids.filter(id => ours.has(id.toLowerCase()))) {
			const list = merged[provider] ?? [];
			if (!list.some(x => x.toLowerCase() === id.toLowerCase())) {
				merged[provider] = [...list, id];
				log(`Trusting built-in ${id} with ${provider} sign-ins`);
			}
		}
	}
	return merged;
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
				throw new Error('Unexpected builtInExtensions array, expected object with include/exclude or array of extensions');

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

			const trustedExtensionAuthAccess = mergeTrustedAuthAccess(distro.trustedExtensionAuthAccess, oss.trustedExtensionAuthAccess, oss.builtInExtensions);
			const result = { webBuiltInExtensions: oss.webBuiltInExtensions, ...distro, builtInExtensions, ...(trustedExtensionAuthAccess ? { trustedExtensionAuthAccess } : {}) };
			fs.writeFileSync(ossPath, JSON.stringify(result, null, '\t'), 'utf8');
		} else {
			fs.cpSync(distroPath, ossPath, { force: true, recursive: true });
		}

		log(distroPath, '✔︎');
	}
}

main();
