/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

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

function overwriteInstallerUtils(installerUtilsPath: string): void {
	const contents = fs.readFileSync(installerUtilsPath);
	const actualHash = createHash('sha256').update(contents).digest('hex');
	const localInstallerUtilsPath = path.join(import.meta.dirname, 'foundryLocalInstallUtils.cjs');
	const localContents = fs.readFileSync(localInstallerUtilsPath);
	const localHash = createHash('sha256').update(localContents).digest('hex');

	if (actualHash !== expectedInstallerUtilsHash && actualHash !== localHash) {
		throw new Error(`Unexpected ${packageName} installer utility hash ${actualHash}`);
	}

	fs.copyFileSync(localInstallerUtilsPath, installerUtilsPath);
	console.log(`Installed the repository-local ${packageName} installer utility`);
}

function runLifecycleScript(packageRoot: string, relativeScriptPath: string): void {
	execFileSync(process.execPath, [path.join(packageRoot, relativeScriptPath)], {
		cwd: packageRoot,
		stdio: 'inherit'
	});
}

export function installFoundryLocal(root = repositoryRoot): void {
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

	overwriteInstallerUtils(path.join(packageRoot, 'script', 'install-utils.cjs'));
	runLifecycleScript(packageRoot, 'script/preinstall.cjs');
	runLifecycleScript(packageRoot, 'script/install-standard.cjs');
}

if (import.meta.filename === process.argv[1]) {
	installFoundryLocal();
}
