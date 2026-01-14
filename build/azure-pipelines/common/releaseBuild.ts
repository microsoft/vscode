/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CosmosClient } from '@azure/cosmos';
import path from 'path';
import fs from 'fs';
import { retry } from './retry.ts';

const root = path.dirname(path.dirname(path.dirname(import.meta.dirname)));

function getEnv(name: string): string {
	const result = process.env[name];

	if (typeof result === 'undefined') {
		throw new Error('Missing env: ' + name);
	}

	return result;
}

interface IExtensionManifest {
	name: string;
	publisher: string;
	version: string;
	engines: { vscode: string };
	main?: string;
	browser?: string;
	enabledApiProposals?: string[];
}

// Simplified version validation for build script
function isEngineCompatible(productVersion: string, engineVersion: string): { compatible: boolean; error?: string } {
	if (engineVersion === '*') {
		return { compatible: true };
	}

	const versionMatch = engineVersion.match(/^(\^|>=)?(\d+)\.(\d+)\.(\d+)/);
	if (!versionMatch) {
		return { compatible: false, error: `Could not parse engines.vscode value: ${engineVersion}` };
	}

	const [, prefix, major, minor, patch] = versionMatch;
	const productMatch = productVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
	if (!productMatch) {
		return { compatible: false, error: `Could not parse product version: ${productVersion}` };
	}

	const [, prodMajor, prodMinor, prodPatch] = productMatch;

	const reqMajor = parseInt(major);
	const reqMinor = parseInt(minor);
	const reqPatch = parseInt(patch);
	const pMajor = parseInt(prodMajor);
	const pMinor = parseInt(prodMinor);
	const pPatch = parseInt(prodPatch);

	if (prefix === '>=') {
		// Minimum version check
		if (pMajor > reqMajor) { return { compatible: true }; }
		if (pMajor < reqMajor) { return { compatible: false, error: `Extension requires VS Code >=${engineVersion}, but product version is ${productVersion}` }; }
		if (pMinor > reqMinor) { return { compatible: true }; }
		if (pMinor < reqMinor) { return { compatible: false, error: `Extension requires VS Code >=${engineVersion}, but product version is ${productVersion}` }; }
		if (pPatch >= reqPatch) { return { compatible: true }; }
		return { compatible: false, error: `Extension requires VS Code >=${engineVersion}, but product version is ${productVersion}` };
	}

	// Caret or exact version check
	if (pMajor !== reqMajor) {
		return { compatible: false, error: `Extension requires VS Code ${engineVersion}, but product version is ${productVersion} (major version mismatch)` };
	}

	if (prefix === '^') {
		// Caret: same major, minor and patch must be >= required
		if (pMinor > reqMinor) { return { compatible: true }; }
		if (pMinor < reqMinor) { return { compatible: false, error: `Extension requires VS Code ${engineVersion}, but product version is ${productVersion}` }; }
		if (pPatch >= reqPatch) { return { compatible: true }; }
		return { compatible: false, error: `Extension requires VS Code ${engineVersion}, but product version is ${productVersion}` };
	}

	// Exact or default behavior
	if (pMinor < reqMinor) { return { compatible: false, error: `Extension requires VS Code ${engineVersion}, but product version is ${productVersion}` }; }
	if (pMinor > reqMinor) { return { compatible: true }; }
	if (pPatch >= reqPatch) { return { compatible: true }; }
	return { compatible: false, error: `Extension requires VS Code ${engineVersion}, but product version is ${productVersion}` };
}

function parseApiProposals(enabledApiProposals: string[]): { proposalName: string; version?: number }[] {
	return enabledApiProposals.map(proposal => {
		const [proposalName, version] = proposal.split('@');
		return { proposalName, version: version ? parseInt(version) : undefined };
	});
}

function areApiProposalsCompatible(
	apiProposals: string[],
	productApiProposals: Readonly<{ [proposalName: string]: Readonly<{ proposal: string; version?: number }> }>
): { compatible: boolean; errors: string[] } {
	if (apiProposals.length === 0) {
		return { compatible: true, errors: [] };
	}

	const errors: string[] = [];
	const parsedProposals = parseApiProposals(apiProposals);

	for (const { proposalName, version } of parsedProposals) {
		if (!version) {
			continue;
		}
		const existingProposal = productApiProposals[proposalName];
		if (!existingProposal) {
			errors.push(`API proposal '${proposalName}' does not exist in this version of VS Code`);
		} else if (existingProposal.version !== version) {
			errors.push(`API proposal '${proposalName}' version mismatch: extension requires version ${version}, but VS Code has version ${existingProposal.version ?? 'unversioned'}`);
		}
	}

	return { compatible: errors.length === 0, errors };
}

async function fetchLatestExtensionManifest(extensionId: string): Promise<IExtensionManifest> {
	// Use the vscode-unpkg service to get the latest extension package.json
	const [publisher, name] = extensionId.split('.');
	const url = `https://${publisher}.vscode-unpkg.net/${publisher}/${name}/latest/extension/package.json`;

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

	// Parse the API proposals from the file content
	// Format is: proposalName: { proposal: '...', version?: N }
	const allApiProposals: { [proposalName: string]: { proposal: string; version?: number } } = {};

	// Match proposal blocks like: proposalName: {\n\t\tproposal: '...',\n\t\tversion: N\n\t}
	// or: proposalName: {\n\t\tproposal: '...',\n\t}
	const proposalBlockRegex = /\t(\w+):\s*\{([^}]+)\}/g;
	const versionRegex = /version:\s*(\d+)/;

	let match;
	while ((match = proposalBlockRegex.exec(apiProposalsContent)) !== null) {
		const [, name, block] = match;
		const versionMatch = versionRegex.exec(block);
		allApiProposals[name] = {
			proposal: '',
			version: versionMatch ? parseInt(versionMatch[1]) : undefined
		};
	}

	console.log(`Loaded ${Object.keys(allApiProposals).length} API proposals from source`);

	// Fetch the latest extension manifest
	const manifest = await retry(() => fetchLatestExtensionManifest(extensionId));

	console.log(`Extension ${extensionId}@${manifest.version}:`);
	console.log(`  engines.vscode: ${manifest.engines.vscode}`);
	console.log(`  enabledApiProposals: ${manifest.enabledApiProposals?.join(', ') || 'none'}`);

	// Check engine compatibility
	const engineResult = isEngineCompatible(productVersion, manifest.engines.vscode);
	if (!engineResult.compatible) {
		throw new Error(`Engine compatibility check failed: ${engineResult.error}`);
	}
	console.log(`  ✓ Engine version compatible`);

	// Check API proposals compatibility
	if (manifest.enabledApiProposals?.length) {
		const apiResult = areApiProposalsCompatible(manifest.enabledApiProposals, allApiProposals);
		if (!apiResult.compatible) {
			throw new Error(`API proposals compatibility check failed:\n  ${apiResult.errors.join('\n  ')}`);
		}
		console.log(`  ✓ API proposals compatible`);
	}

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
