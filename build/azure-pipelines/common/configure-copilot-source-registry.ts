/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

function registryUrl(registry: string): URL {
	const url = new URL(registry);
	if (url.protocol !== 'https:') {
		throw new Error(`[copilot-source-registry] Registry must use HTTPS: ${registry}`);
	}
	return url;
}

export function sourceNpmrc(registry: string): string {
	return `registry=${registryUrl(registry).href}\nalways-auth=true\n`;
}

export function corepackRegistry(registry: string): string {
	return registryUrl(registry).href.replace(/\/+$/, '');
}

function requiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`[copilot-source-registry] Missing required environment variable ${name}.`);
	}
	return value;
}

function main(): void {
	const registry = requiredEnv('COPILOT_SOURCE_REGISTRY');
	const npmrc = requiredEnv('COPILOT_SOURCE_NPMRC');
	fs.writeFileSync(npmrc, sourceNpmrc(registry));
	const corepack = corepackRegistry(registry);
	console.log(`##vso[task.setvariable variable=COPILOT_COREPACK_REGISTRY]${corepack}`);
	console.log(`[copilot-source-registry] Configured ${registryUrl(registry).href}.`);
}

if (import.meta.main) {
	main();
}
