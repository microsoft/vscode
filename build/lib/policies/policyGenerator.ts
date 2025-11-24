/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimist from 'minimist';
import * as fs from 'fs';
import path from 'path';
import { type CategoryDto, type ExportedPolicyDataDto } from './policyDto.ts';
import * as JSONC from 'jsonc-parser';
import { BooleanPolicy } from './booleanPolicy.ts';
import { NumberPolicy } from './numberPolicy.ts';
import { ObjectPolicy } from './objectPolicy.ts';
import { StringEnumPolicy } from './stringEnumPolicy.ts';
import { StringPolicy } from './stringPolicy.ts';
import { type Version, type LanguageTranslations, type Policy, type Translations, Languages, type ProductJson } from './types.ts';
import { renderGP, renderJsonPolicies, renderMacOSPolicy } from './render.ts';

const product: ProductJson = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../../product.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../../package.json'), 'utf8'));

async function getSpecificNLS(resourceUrlTemplate: string, languageId: string, version: Version): Promise<LanguageTranslations> {
	const resource = {
		publisher: 'ms-ceintl',
		name: `vscode-language-pack-${languageId}`,
		version: `${version[0]}.${version[1]}.${version[2]}`,
		path: 'extension/translations/main.i18n.json'
	};

	const url = resourceUrlTemplate.replace(/\{([^}]+)\}/g, (_, key) => resource[key as keyof typeof resource]);
	const res = await fetch(url);

	if (res.status !== 200) {
		throw new Error(`[${res.status}] Error downloading language pack ${languageId}@${version}`);
	}

	const { contents: result } = await res.json() as { contents: LanguageTranslations };

	// TODO: support module namespacing
	// Flatten all moduleName keys to empty string
	const flattened: LanguageTranslations = { '': {} };
	for (const moduleName in result) {
		for (const nlsKey in result[moduleName]) {
			flattened[''][nlsKey] = result[moduleName][nlsKey];
		}
	}

	return flattened;
}

function parseVersion(version: string): Version {
	const [, major, minor, patch] = /^(\d+)\.(\d+)\.(\d+)/.exec(version)!;
	return [parseInt(major), parseInt(minor), parseInt(patch)];
}

function compareVersions(a: Version, b: Version): number {
	if (a[0] !== b[0]) { return a[0] - b[0]; }
	if (a[1] !== b[1]) { return a[1] - b[1]; }
	return a[2] - b[2];
}

async function queryVersions(serviceUrl: string, languageId: string): Promise<Version[]> {
	const res = await fetch(`${serviceUrl}/extensionquery`, {
		method: 'POST',
		headers: {
			'Accept': 'application/json;api-version=3.0-preview.1',
			'Content-Type': 'application/json',
			'User-Agent': 'VS Code Build',
		},
		body: JSON.stringify({
			filters: [{ criteria: [{ filterType: 7, value: `ms-ceintl.vscode-language-pack-${languageId}` }] }],
			flags: 0x1
		})
	});

	if (res.status !== 200) {
		throw new Error(`[${res.status}] Error querying for extension: ${languageId}`);
	}

	const result = await res.json() as { results: [{ extensions: { versions: { version: string }[] }[] }] };
	return result.results[0].extensions[0].versions.map(v => parseVersion(v.version)).sort(compareVersions);
}

async function getNLS(extensionGalleryServiceUrl: string, resourceUrlTemplate: string, languageId: string, version: Version) {
	const versions = await queryVersions(extensionGalleryServiceUrl, languageId);
	const nextMinor: Version = [version[0], version[1] + 1, 0];
	const compatibleVersions = versions.filter(v => compareVersions(v, nextMinor) < 0);
	const latestCompatibleVersion = compatibleVersions.at(-1)!; // order is newest to oldest

	if (!latestCompatibleVersion) {
		throw new Error(`No compatible language pack found for ${languageId} for version ${version}`);
	}

	return await getSpecificNLS(resourceUrlTemplate, languageId, latestCompatibleVersion);
}

// TODO: add more policy types
const PolicyTypes = [
	BooleanPolicy,
	NumberPolicy,
	StringEnumPolicy,
	StringPolicy,
	ObjectPolicy
];

async function parsePolicies(policyDataFile: string): Promise<Policy[]> {
	const contents = JSONC.parse(await fs.promises.readFile(policyDataFile, { encoding: 'utf8' })) as ExportedPolicyDataDto;
	const categories = new Map<string, CategoryDto>();
	for (const category of contents.categories) {
		categories.set(category.key, category);
	}

	const policies: Policy[] = [];
	for (const policy of contents.policies) {
		const category = categories.get(policy.category);
		if (!category) {
			throw new Error(`Unknown category: ${policy.category}`);
		}

		let result: Policy | undefined;
		for (const policyType of PolicyTypes) {
			if (result = policyType.from(category, policy)) {
				break;
			}
		}

		if (!result) {
			throw new Error(`Unsupported policy type: ${policy.type} for policy ${policy.name}`);
		}

		policies.push(result);
	}

	// Sort policies first by category name, then by policy name
	policies.sort((a, b) => {
		const categoryCompare = a.category.name.value.localeCompare(b.category.name.value);
		if (categoryCompare !== 0) {
			return categoryCompare;
		}
		return a.name.localeCompare(b.name);
	});

	return policies;
}

async function getTranslations(): Promise<Translations> {
	const extensionGalleryServiceUrl = product.extensionsGallery?.serviceUrl;

	if (!extensionGalleryServiceUrl) {
		console.warn(`Skipping policy localization: No 'extensionGallery.serviceUrl' found in 'product.json'.`);
		return [];
	}

	const resourceUrlTemplate = product.extensionsGallery?.resourceUrlTemplate;

	if (!resourceUrlTemplate) {
		console.warn(`Skipping policy localization: No 'resourceUrlTemplate' found in 'product.json'.`);
		return [];
	}

	const version = parseVersion(packageJson.version);
	const languageIds = Object.keys(Languages);

	return await Promise.all(languageIds.map(
		languageId => getNLS(extensionGalleryServiceUrl, resourceUrlTemplate, languageId, version)
			.then(languageTranslations => ({ languageId, languageTranslations }))
	));
}

async function windowsMain(policies: Policy[], translations: Translations) {
	const root = '.build/policies/win32';
	const { admx, adml } = renderGP(product, policies, translations);

	await fs.promises.rm(root, { recursive: true, force: true });
	await fs.promises.mkdir(root, { recursive: true });

	await fs.promises.writeFile(path.join(root, `${product.win32RegValueName}.admx`), admx.replace(/\r?\n/g, '\n'));

	for (const { languageId, contents } of adml) {
		const languagePath = path.join(root, languageId === 'en-us' ? 'en-us' : Languages[languageId as keyof typeof Languages]);
		await fs.promises.mkdir(languagePath, { recursive: true });
		await fs.promises.writeFile(path.join(languagePath, `${product.win32RegValueName}.adml`), contents.replace(/\r?\n/g, '\n'));
	}
}

async function darwinMain(policies: Policy[], translations: Translations) {
	const bundleIdentifier = product.darwinBundleIdentifier;
	if (!bundleIdentifier || !product.darwinProfilePayloadUUID || !product.darwinProfileUUID) {
		throw new Error(`Missing required product information.`);
	}
	const root = '.build/policies/darwin';
	const { profile, manifests } = renderMacOSPolicy(product, policies, translations);

	await fs.promises.rm(root, { recursive: true, force: true });
	await fs.promises.mkdir(root, { recursive: true });
	await fs.promises.writeFile(path.join(root, `${bundleIdentifier}.mobileconfig`), profile.replace(/\r?\n/g, '\n'));

	for (const { languageId, contents } of manifests) {
		const languagePath = path.join(root, languageId === 'en-us' ? 'en-us' : Languages[languageId as keyof typeof Languages]);
		await fs.promises.mkdir(languagePath, { recursive: true });
		await fs.promises.writeFile(path.join(languagePath, `${bundleIdentifier}.plist`), contents.replace(/\r?\n/g, '\n'));
	}
}

async function linuxMain(policies: Policy[]) {
	const root = '.build/policies/linux';
	const policyFileContents = JSON.stringify(renderJsonPolicies(policies), undefined, 4);

	await fs.promises.rm(root, { recursive: true, force: true });
	await fs.promises.mkdir(root, { recursive: true });

	const jsonPath = path.join(root, `policy.json`);
	await fs.promises.writeFile(jsonPath, policyFileContents.replace(/\r?\n/g, '\n'));
}

async function main() {
	const args = minimist(process.argv.slice(2));
	if (args._.length !== 2) {
		console.error(`Usage: node build/lib/policies <policy-data-file> <darwin|win32|linux>`);
		process.exit(1);
	}

	const policyDataFile = args._[0];
	const platform = args._[1];
	const [policies, translations] = await Promise.all([parsePolicies(policyDataFile), getTranslations()]);

	if (platform === 'darwin') {
		await darwinMain(policies, translations);
	} else if (platform === 'win32') {
		await windowsMain(policies, translations);
	} else if (platform === 'linux') {
		await linuxMain(policies);
	} else {
		console.error(`Usage: node build/lib/policies <policy-data-file> <darwin|win32|linux>`);
		process.exit(1);
	}
}

if (import.meta.main) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
