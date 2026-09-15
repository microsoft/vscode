/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const scenarioRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const extensionRoot = join(scenarioRoot, 'known-problem-extension');

/** Runs a command synchronously and throws when it does not exit successfully. */
function runChecked(command, args, options = {}, spawn = spawnSync) {
	const result = spawn(command, args, options);
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		const detail = typeof result.stderr === 'string' ? `: ${result.stderr.trim()}` : '';
		throw new Error(`${basename(command)} exited with status ${result.status}${detail}`);
	}
	return result;
}

/** Builds CLI and launch arguments for an isolated macOS demo profile. */
export function demoPlan(appPath, profilePath, vsixPath) {
	const appResources = join(appPath, 'Contents', 'Resources', 'app');
	return {
		cli: join(appResources, 'bin', 'code'),
		executable: join(appPath, 'Contents', 'MacOS', 'Electron'),
		installArguments: [
			`--user-data-dir=${join(profilePath, 'user-data')}`,
			`--extensions-dir=${join(profilePath, 'extensions')}`,
			'--install-extension',
			vsixPath,
			'--force',
		],
		launchArguments: [
			`--user-data-dir=${join(profilePath, 'user-data')}`,
			`--extensions-dir=${join(profilePath, 'extensions')}`,
			join(scenarioRoot, 'issue-wizard-extension-problem.code-workspace'),
		],
	};
}

/** Packages the transparent fixture extension into a local VSIX archive. */
export async function packageExtension(vsixPath) {
	const manifest = JSON.parse(await readFile(join(extensionRoot, 'package.json'), 'utf8'));
	const staging = await mkdtemp(join(tmpdir(), 'issue-wizard-vsix.'));
	try {
		await cp(extensionRoot, join(staging, 'extension'), { recursive: true });
		await writeFile(join(staging, 'extension.vsixmanifest'), `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
	<Metadata>
		<Identity Language="en-US" Id="${manifest.name}" Version="${manifest.version}" Publisher="${manifest.publisher}" />
		<DisplayName>${manifest.displayName}</DisplayName>
		<Description xml:space="preserve">${manifest.description}</Description>
	</Metadata>
	<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
	<Dependencies />
	<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" /></Assets>
</PackageManifest>
`);
		await writeFile(join(staging, '[Content_Types].xml'), `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
	<Default Extension="json" ContentType="application/json" />
	<Default Extension="cjs" ContentType="application/octet-stream" />
	<Override PartName="/extension.vsixmanifest" ContentType="text/xml" />
</Types>
`);
		runChecked('/usr/bin/zip', ['-q', '-r', vsixPath, '.'], { cwd: staging, stdio: 'inherit' });
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
}

/** Installs the fixture with the selected app bundle's CLI. */
export function installExtension(plan, spawn = spawnSync) {
	return runChecked(plan.cli, plan.installArguments, { encoding: 'utf8' }, spawn);
}

/** Packages, installs, and launches the isolated facilitator demo. */
async function main() {
	const appPath = resolve(process.argv[2] ?? '/Applications/Visual Studio Code - Insiders.app');
	const profilePath = await mkdtemp(join(tmpdir(), 'issue-wizard-extension.'));
	const vsixPath = join(profilePath, 'issue-wizard-known-problem.vsix');
	await mkdir(join(profilePath, 'extensions'), { recursive: true });
	await packageExtension(vsixPath);
	const plan = demoPlan(appPath, profilePath, vsixPath);

	console.log(`Installing the local fixture into ${profilePath}`);
	installExtension(plan);
	console.log(`Launching the isolated demo. Remove ${profilePath} after closing it.`);
	runChecked(plan.executable, plan.launchArguments, { stdio: 'inherit' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	await main();
}
