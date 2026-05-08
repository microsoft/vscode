/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const BUILD_STAGINGDIRECTORY = process.env.BUILD_STAGINGDIRECTORY ?? fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-telemetry-'));
const BUILD_SOURCESDIRECTORY = process.env.BUILD_SOURCESDIRECTORY ?? path.resolve(import.meta.dirname, '..', '..', '..');

const extractionDir = path.join(BUILD_STAGINGDIRECTORY, 'extraction');
fs.mkdirSync(extractionDir, { recursive: true });

const repos = [
	'https://github.com/microsoft/vscode-extension-telemetry.git',
	'https://github.com/microsoft/vscode-chrome-debug-core.git',
	'https://github.com/microsoft/vscode-node-debug2.git',
	'https://github.com/microsoft/vscode-node-debug.git',
	'https://github.com/microsoft/vscode-html-languageservice.git',
	'https://github.com/microsoft/vscode-json-languageservice.git',
];

for (const repo of repos) {
	cp.execSync(`git clone --depth 1 ${repo}`, { cwd: extractionDir, stdio: 'inherit' });
}

const extractor = path.join(BUILD_SOURCESDIRECTORY, 'node_modules', '@vscode', 'telemetry-extractor', 'out', 'extractor.js');
const telemetryConfig = path.join(BUILD_SOURCESDIRECTORY, 'build', 'azure-pipelines', 'common', 'telemetry-config.json');

interface ITelemetryConfigEntry {
	eventPrefix: string;
	sourceDirs: string[];
	excludedDirs: string[];
	applyEndpoints: boolean;
	patchDebugEvents?: boolean;
}

const pipelineExtensionsPathPrefix = '../../s/extensions/';

const telemetryConfigEntries = JSON.parse(fs.readFileSync(telemetryConfig, 'utf8')) as ITelemetryConfigEntry[];
let hasLocalConfigOverrides = false;

const resolvedTelemetryConfigEntries = telemetryConfigEntries.map(entry => {
	const sourceDirs = entry.sourceDirs.map(sourceDir => {
		if (!sourceDir.startsWith(pipelineExtensionsPathPrefix)) {
			return sourceDir;
		}

		const sourceDirInExtractionDir = path.resolve(extractionDir, sourceDir);
		if (fs.existsSync(sourceDirInExtractionDir)) {
			return sourceDir;
		}

		const extensionRelativePath = sourceDir.slice(pipelineExtensionsPathPrefix.length);
		const sourceDirInWorkspace = path.join(BUILD_SOURCESDIRECTORY, 'extensions', extensionRelativePath);
		if (fs.existsSync(sourceDirInWorkspace)) {
			hasLocalConfigOverrides = true;
			return sourceDirInWorkspace;
		}

		return sourceDir;
	});

	return {
		...entry,
		sourceDirs,
	};
});

const telemetryConfigForExtraction = hasLocalConfigOverrides
	? path.join(extractionDir, 'telemetry-config.local.json')
	: telemetryConfig;

if (hasLocalConfigOverrides) {
	fs.writeFileSync(telemetryConfigForExtraction, JSON.stringify(resolvedTelemetryConfigEntries, null, '\t'));
}

try {
	cp.execSync(`node "${extractor}" --sourceDir "${BUILD_SOURCESDIRECTORY}" --excludedDir "${path.join(BUILD_SOURCESDIRECTORY, 'extensions')}" --outputDir . --applyEndpoints`, { cwd: extractionDir, stdio: 'inherit' });
	cp.execSync(`node "${extractor}" --config "${telemetryConfigForExtraction}" -o .`, { cwd: extractionDir, stdio: 'inherit' });
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Telemetry extraction failed: ${message}`);
	process.exit(1);
}

const telemetryDir = path.join(BUILD_SOURCESDIRECTORY, '.build', 'telemetry');
fs.mkdirSync(telemetryDir, { recursive: true });
fs.renameSync(path.join(extractionDir, 'declarations-resolved.json'), path.join(telemetryDir, 'telemetry-core.json'));
fs.renameSync(path.join(extractionDir, 'config-resolved.json'), path.join(telemetryDir, 'telemetry-extensions.json'));

fs.rmSync(extractionDir, { recursive: true, force: true });
