/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fetchCoreLibraries, getStandardArtifacts, type IFoundryDependencyVersions, requiredCoreLibraryNames, supportsCoreLibraryTarget, VSCODE_NUGET_FEED } from '../../dictation-runtime/nuget.ts';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const packageName = 'foundry-local-sdk';
const credentialTokenEnvironmentVariable = 'VSS_NUGET_ACCESSTOKEN';
const expectedInstallerUtilsHash = '0831c932b10389283e805f88a204b0f6a5a8053f2ee520e56a0f0adf1352aa8b';

type RootPackageJson = {
	dependencies?: Record<string, string>;
	allowScripts?: Record<string, boolean>;
};

type FoundryPackageJson = {
	version?: string;
	scripts?: Record<string, string>;
};

function readJson<T>(filePath: string): T {
	return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function getPinnedPackage(root: string): { packageJsonPath: string; packageJson: RootPackageJson; allowScripts: Record<string, boolean>; allowScriptsKey: string } {
	const packageJsonPath = path.join(root, 'package.json');
	const packageJson = readJson<RootPackageJson>(packageJsonPath);
	const allowScripts = packageJson.allowScripts;
	const version = packageJson.dependencies?.[packageName];
	const allowScriptsKey = version ? `${packageName}@${version}` : undefined;

	if (!allowScripts || !version || !allowScriptsKey || allowScripts[allowScriptsKey] !== true) {
		throw new Error(`Expected an approved, pinned ${packageName} install script in package.json`);
	}

	return { packageJsonPath, packageJson, allowScripts, allowScriptsKey };
}

export function disableFoundryLocalInstall(root = repositoryRoot): void {
	const { packageJsonPath, packageJson, allowScripts, allowScriptsKey } = getPinnedPackage(root);
	allowScripts[allowScriptsKey] = false;
	fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, undefined, 2)}\n`);
	console.log(`Disabled ${allowScriptsKey} install script for this CI job`);
}

function validateInstallerUtils(installerUtilsPath: string): void {
	const contents = fs.readFileSync(installerUtilsPath);
	const actualHash = createHash('sha256').update(contents).digest('hex');

	if (actualHash !== expectedInstallerUtilsHash) {
		throw new Error(`Unexpected ${packageName} installer utility hash ${actualHash}`);
	}
}

function runLifecycleScript(packageRoot: string, relativeScriptPath: string): void {
	execFileSync(process.execPath, [path.join(packageRoot, relativeScriptPath)], {
		cwd: packageRoot,
		stdio: 'inherit'
	});
}

export async function installFoundryLocal(root = repositoryRoot): Promise<void> {
	if (!process.env[credentialTokenEnvironmentVariable]) {
		throw new Error(`${credentialTokenEnvironmentVariable} was not set by NuGetAuthenticate`);
	}

	const rootPackageJson = readJson<RootPackageJson>(path.join(root, 'package.json'));
	const version = rootPackageJson.dependencies?.[packageName];
	const allowScriptsKey = version ? `${packageName}@${version}` : undefined;
	if (!version || !allowScriptsKey || rootPackageJson.allowScripts?.[allowScriptsKey] !== false) {
		throw new Error(`Expected the pinned ${packageName} install script to be disabled before installation`);
	}

	const packageRoot = path.join(root, 'node_modules', packageName);
	const packageJson = readJson<FoundryPackageJson>(path.join(packageRoot, 'package.json'));
	if (packageJson.version !== version) {
		throw new Error(`Expected ${packageName}@${version}, found ${packageJson.version ?? 'an unknown version'}`);
	}
	if (packageJson.scripts?.preinstall !== 'node script/preinstall.cjs' || packageJson.scripts.install !== 'node script/install-standard.cjs') {
		throw new Error(`Unexpected ${packageName}@${version} lifecycle scripts`);
	}

	validateInstallerUtils(path.join(packageRoot, 'script', 'install-utils.cjs'));
	runLifecycleScript(packageRoot, 'script/preinstall.cjs');

	const target = `${process.platform}-${process.arch}`;
	if (!supportsCoreLibraryTarget(target)) {
		console.warn(`[foundry-local] Unsupported platform: ${target}. Skipping.`);
		return;
	}

	const dependencies = readJson<IFoundryDependencyVersions>(path.join(packageRoot, 'deps_versions.json'));
	const artifacts = getStandardArtifacts(target, dependencies);
	const binDir = path.join(packageRoot, 'foundry-local-core', target);
	await fetchCoreLibraries(target, artifacts, binDir, { feeds: [VSCODE_NUGET_FEED], skipIfPresent: true });

	const missingFiles = requiredCoreLibraryNames(target).filter(file => !fs.existsSync(path.join(binDir, file)));
	if (missingFiles.length > 0) {
		throw new Error(`[foundry-local] Missing required native libraries for ${target}: ${missingFiles.join(', ')}`);
	}

	const coreVersion = dependencies['foundry-local-core'].nuget;
	const platformPackageJson = {
		name: `@foundry-local-core/${target}`,
		version: coreVersion,
		description: `Native binaries for Foundry Local SDK (${target})`,
		private: true,
	};
	fs.writeFileSync(path.join(binDir, 'package.json'), JSON.stringify(platformPackageJson, undefined, 2));
	console.log('[foundry-local] Installation complete.');
}

if (import.meta.filename === process.argv[1]) {
	await installFoundryLocal();
}
