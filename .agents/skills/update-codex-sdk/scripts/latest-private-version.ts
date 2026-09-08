/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'node:child_process';

const feedUrl = 'https://pkgs.dev.azure.com/monacotools/Monaco/_packaging/vscode/npm/registry';
const azureDevOpsResource = '499b84ac-1321-427f-aa17-267ca6975798';
const codexAliasPrefix = 'npm:@openai/codex@';

type OutputFormat = 'text' | 'raw' | 'json';

interface Options {
	format: OutputFormat;
	requestedVersion: string | undefined;
}

interface CodexVersionMetadata {
	optionalDependencies?: Record<string, string>;
}

interface CodexPackument {
	versions: Record<string, CodexVersionMetadata>;
}

function usage(): void {
	console.error('Usage: node --experimental-strip-types latest-private-version.ts [--raw | --json] [--version <x.y.z>]');
}

function fail(message: string): never {
	console.error(`Error: ${message}`);
	process.exit(1);
}

function parseArgs(args: string[]): Options {
	let format: OutputFormat = 'text';
	let requestedVersion: string | undefined;

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === '--raw') {
			format = 'raw';
		} else if (arg === '--json') {
			format = 'json';
		} else if (arg === '--version') {
			requestedVersion = args[++index];
			if (!requestedVersion) {
				usage();
				process.exit(2);
			}
		} else {
			usage();
			process.exit(2);
		}
	}

	if (requestedVersion && !/^\d+\.\d+\.\d+$/.test(requestedVersion)) {
		fail(`--version must be a stable x.y.z version, got ${requestedVersion}`);
	}

	return { format, requestedVersion };
}

function getAccessToken(): string {
	const azureCli = process.platform === 'win32' ? 'az.cmd' : 'az';
	const result = spawnSync(azureCli, [
		'account',
		'get-access-token',
		'--resource',
		azureDevOpsResource,
		'--query',
		'accessToken',
		'--output',
		'tsv',
	], { encoding: 'utf8' });

	if (result.error) {
		fail(`could not run Azure CLI (${result.error.message}). Install it and sign in to the monacotools organization.`);
	}
	if (result.status !== 0) {
		const detail = result.stderr?.trim();
		fail(`Azure CLI could not obtain an Azure DevOps token${detail ? `: ${detail}` : ''}`);
	}

	const token = result.stdout?.trim();
	if (!token) {
		fail('Azure CLI returned an empty Azure DevOps token. Sign in and try again.');
	}
	return token;
}

function parseStableVersion(version: string): number[] | undefined {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	return match ? match.slice(1).map(Number) : undefined;
}

function compareVersions(left: string, right: string): number {
	const leftParts = parseStableVersion(left);
	const rightParts = parseStableVersion(right);
	if (!leftParts || !rightParts) {
		throw new Error('compareVersions only accepts stable versions');
	}
	for (let index = 0; index < 3; index++) {
		const difference = leftParts[index] - rightParts[index];
		if (difference !== 0) {
			return difference;
		}
	}
	return 0;
}

function binaryVersions(packument: CodexPackument, version: string): string[] {
	const optionalDependencies = packument.versions[version]?.optionalDependencies;
	if (!optionalDependencies || typeof optionalDependencies !== 'object') {
		return [];
	}

	return Object.values(optionalDependencies)
		.filter(value => typeof value === 'string' && value.startsWith(codexAliasPrefix))
		.map(value => value.slice(codexAliasPrefix.length));
}

function requiredVersions(packument: CodexPackument, version: string): string[] {
	return [version, ...binaryVersions(packument, version)];
}

const { format, requestedVersion } = parseArgs(process.argv.slice(2));
const accessToken = getAccessToken();
const response = await fetch(`${feedUrl}/@openai%2Fcodex`, {
	headers: { Authorization: `Bearer ${accessToken}` },
});

if (!response.ok) {
	fail(`private VS Code feed returned HTTP ${response.status} ${response.statusText}`);
}

const packument = await response.json() as CodexPackument;
if (!packument || typeof packument !== 'object' || !packument.versions || typeof packument.versions !== 'object') {
	fail('private VS Code feed returned an unexpected @openai/codex response');
}

const availableVersions = new Set(Object.keys(packument.versions));
const completeStableVersions = [...availableVersions]
	.filter(version => parseStableVersion(version))
	.filter(version => binaryVersions(packument, version).length > 0)
	.filter(version => requiredVersions(packument, version).every(required => availableVersions.has(required)))
	.sort(compareVersions);

const latestVersion = completeStableVersions.at(-1);
if (!latestVersion) {
	fail('the private VS Code feed contains no stable Codex release with all platform binaries');
}

const checkedVersion = requestedVersion ?? latestVersion;
if (requestedVersion && availableVersions.has(requestedVersion) && binaryVersions(packument, requestedVersion).length === 0) {
	fail(`Codex ${requestedVersion} metadata declares no platform binary aliases, so its availability cannot be verified`);
}
const missingVersions = requiredVersions(packument, checkedVersion).filter(version => !availableVersions.has(version));
const result = {
	feed: feedUrl,
	latestVersion,
	checkedVersion,
	available: missingVersions.length === 0,
	missingVersions,
};

if (format === 'json') {
	console.log(JSON.stringify(result, undefined, 2));
} else if (format === 'raw') {
	console.log(latestVersion);
} else if (requestedVersion) {
	if (result.available) {
		console.log(`Codex ${requestedVersion} is fully available from the private VS Code feed.`);
	} else {
		console.log(`Codex ${requestedVersion} is not fully available from the private VS Code feed.`);
		console.log(`Missing: ${missingVersions.join(', ')}`);
		console.log(`Latest fully available stable version: ${latestVersion}`);
	}
} else {
	console.log(`Latest Codex stable fully available from the private VS Code feed: ${latestVersion}`);
}

if (requestedVersion && !result.available) {
	process.exitCode = 1;
}
