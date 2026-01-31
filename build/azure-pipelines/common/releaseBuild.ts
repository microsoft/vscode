/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CosmosClient } from '@azure/cosmos';
import path from 'path';
import fs from 'fs';
import { retry } from './retry.ts';
import { type IExtensionManifest, parseApiProposalsFromSource, checkExtensionCompatibility, areAllowlistedApiProposalsMatching } from './versionCompatibility.ts';

const root = path.dirname(path.dirname(path.dirname(import.meta.dirname)));

function getEnv(name: string): string {
	const result = process.env[name];

	if (typeof result === 'undefined') {
		throw new Error('Missing env: ' + name);
	}

	return result;
}

async function fetchLatestExtensionManifest(extensionId: string): Promise<IExtensionManifest> {
	// Use the vscode-unpkg service to get the latest extension package.json
	const [publisher, name] = extensionId.split('.');

	// First, get the latest version from the gallery endpoint
	const galleryUrl = `https://main.vscode-unpkg.net/_gallery/${publisher}/${name}/latest`;
	const galleryResponse = await fetch(galleryUrl, {
		headers: { 'User-Agent': 'VSCode Build' }
	});

	if (!galleryResponse.ok) {
		throw new Error(`Failed to fetch latest version for ${extensionId}: ${galleryResponse.status} ${galleryResponse.statusText}`);
	}

	const galleryData = await galleryResponse.json() as { versions: { version: string }[] };
	const version = galleryData.versions[0].version;

	// Now fetch the package.json using the actual version
	const url = `https://${publisher}.vscode-unpkg.net/${publisher}/${name}/${version}/extension/package.json`;

	const response = await fetch(url, {
		headers: { 'User-Agent': 'VSCode Build' }
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch extension ${extensionId} from unpkg: ${response.status} ${response.statusText}`);
	}

	return await response.json() as IExtensionManifest;
}

async function checkCopilotChatCompatibility(): Promise<void> {
	const extensionId = 'github.copilot-chat';

	console.log(`Checking compatibility of ${extensionId}...`);

	// Get product version from package.json
	const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
	const productVersion = packageJson.version;

	console.log(`Product version: ${productVersion}`);

	// Get API proposals from the generated file
	const apiProposalsPath = path.join(root, 'src/vs/platform/extensions/common/extensionsApiProposals.ts');
	const apiProposalsContent = fs.readFileSync(apiProposalsPath, 'utf8');
	const allApiProposals = parseApiProposalsFromSource(apiProposalsContent);

	const proposalCount = Object.keys(allApiProposals).length;
	if (proposalCount === 0) {
		throw new Error('Failed to load API proposals from source');
	}

	console.log(`Loaded ${proposalCount} API proposals from source`);

	// Load product.json to check allowlisted API proposals
	const productJsonPath = path.join(root, 'product.json');
	let productJson;
	try {
		productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
	} catch (error) {
		throw new Error(`Failed to load or parse product.json: ${error}`);
	}
	const extensionEnabledApiProposals = productJson?.extensionEnabledApiProposals;
	const extensionIdKey = extensionEnabledApiProposals ? Object.keys(extensionEnabledApiProposals).find(key => key.toLowerCase() === extensionId.toLowerCase()) : undefined;
	const productAllowlistedProposals = extensionIdKey ? extensionEnabledApiProposals[extensionIdKey] : undefined;

	if (productAllowlistedProposals) {
		console.log(`Product.json allowlisted proposals for ${extensionId}:`);
		for (const proposal of productAllowlistedProposals) {
			console.log(`    ${proposal}`);
		}
	} else {
		console.log(`Product.json allowlisted proposals for ${extensionId}: none`);
	}

	// Fetch the latest extension manifest
	const manifest = await retry(() => fetchLatestExtensionManifest(extensionId));

	console.log(`Extension ${extensionId}@${manifest.version}:`);
	console.log(`  engines.vscode: ${manifest.engines.vscode}`);
	console.log(`  enabledApiProposals:\n    ${manifest.enabledApiProposals?.join('\n    ') || 'none'}`);

	// Check compatibility
	const result = checkExtensionCompatibility(productVersion, allApiProposals, manifest);
	if (!result.compatible) {
		throw new Error(`Compatibility check failed:\n  ${result.errors.join('\n  ')}`);
	}

	console.log(`  ✓ Engine version compatible`);
	if (manifest.enabledApiProposals?.length) {
		console.log(`  ✓ API proposals compatible`);
	}

	// Check that product.json allowlist matches package.json declarations
	const allowlistResult = areAllowlistedApiProposalsMatching(extensionId, productAllowlistedProposals, manifest.enabledApiProposals);
	if (!allowlistResult.compatible) {
		throw new Error(`Allowlist check failed:\n  ${allowlistResult.errors.join('\n  ')}`);
	}

	console.log(`  ✓ Product.json allowlist matches package.json`);
	console.log(`✓ ${extensionId} is compatible with this build`);
}

interface Config {
	id: string;
	frozen: boolean;
}

function createDefaultConfig(quality: string): Config {
	return {
		id: quality,
		frozen: false
	};
}

async function getConfig(client: CosmosClient, quality: string): Promise<Config> {
	const query = `SELECT TOP 1 * FROM c WHERE c.id = "${quality}"`;

	const res = await client.database('builds').container('config').items.query(query).fetchAll();

	if (res.resources.length === 0) {
		return createDefaultConfig(quality);
	}

	return res.resources[0] as Config;
}

async function main(force: boolean): Promise<void> {
	const commit = getEnv('BUILD_SOURCEVERSION');
	const quality = getEnv('VSCODE_QUALITY');

	// Check Copilot Chat compatibility before releasing insider builds
	if (quality === 'insider') {
		await checkCopilotChatCompatibility();
	}

	const { cosmosDBAccessToken } = JSON.parse(getEnv('PUBLISH_AUTH_TOKENS'));
	const client = new CosmosClient({ endpoint: process.env['AZURE_DOCUMENTDB_ENDPOINT']!, tokenProvider: () => Promise.resolve(`type=aad&ver=1.0&sig=${cosmosDBAccessToken.token}`) });

	if (!force) {
		const config = await getConfig(client, quality);

		console.log('Quality config:', config);

		if (config.frozen) {
			console.log(`Skipping release because quality ${quality} is frozen.`);
			return;
		}
	}

	console.log(`Releasing build ${commit}...`);

	let rolloutDurationMs = undefined;

	// If the build is insiders or exploration, start a rollout of 4 hours
	if (quality === 'insider') {
		rolloutDurationMs = 4 * 60 * 60 * 1000; // 4 hours
	}

	const scripts = client.database('builds').container(quality).scripts;
	await retry(() => scripts.storedProcedure('releaseBuild').execute('', [commit, rolloutDurationMs]));
}

const [, , force] = process.argv;

console.log(process.argv);

main(/^true$/i.test(force)).then(() => {
	console.log('Build successfully released');
	process.exit(0);
}, err => {
	console.error(err);
	process.exit(1);
});
