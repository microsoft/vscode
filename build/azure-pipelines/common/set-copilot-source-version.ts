/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

const NUMERIC_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const BUILD_ID = /^(?:0|[1-9]\d*)$/;

export function copilotSourceVersion(vscodeVersion: string, buildId: string): string {
	if (!NUMERIC_VERSION.test(vscodeVersion)) {
		throw new Error(`[copilot-source-version] Invalid VS Code package version "${vscodeVersion}". Expected a numeric major.minor.patch version.`);
	}
	if (!BUILD_ID.test(buildId)) {
		throw new Error(`[copilot-source-version] Invalid Azure Pipelines build ID "${buildId}". Expected a non-negative integer.`);
	}
	return `0.0.0-vscode.${vscodeVersion}.${buildId}`;
}

function main(): void {
	const root = path.join(import.meta.dirname, '../../..');
	const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version?: string };
	const version = copilotSourceVersion(packageJson.version ?? '', process.env['BUILD_BUILDID'] ?? '');
	console.log(`##vso[task.setvariable variable=COPILOT_SOURCE_VERSION]${version}`);
	console.log(`[copilot-source-version] Publishing Copilot source packages as ${version}.`);
}

if (import.meta.main) {
	main();
}
