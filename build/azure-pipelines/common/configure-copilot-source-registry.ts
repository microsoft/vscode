/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';

export function sourceNpmrc(registry: string): string {
	const url = new URL(registry);
	if (url.protocol !== 'https:') {
		throw new Error(`[copilot-source-registry] Registry must use HTTPS: ${registry}`);
	}
	return `registry=${registry}\nalways-auth=true\n`;
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
	console.log(`[copilot-source-registry] Configured ${registry}.`);
}

if (import.meta.main) {
	main();
}
