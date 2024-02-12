/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import findWorkspaceRoot = require('../node_modules/find-yarn-workspace-root');
import * as findUp from 'find-up';
import * as path from 'path';
import * as whichPM from 'which-pm';
import { Uri, workspace } from 'vscode';

interface PreferredProperties {
	isPreferred: boolean;
	hasLockfile: boolean;
}

async function pathExists(filePath: string) {
	try {
		await workspace.fs.stat(Uri.file(filePath));
	} catch {
		return false;
	}
	return true;
}

async function isBunPreferred(pkgPath: string): Promise<PreferredProperties> {
	if (await pathExists(path.join(pkgPath, 'bun.lockb'))) {
		return { isPreferred: true, hasLockfile: true };
	}

	return { isPreferred: false, hasLockfile: false };
}

async function isPNPMPreferred(pkgPath: string): Promise<PreferredProperties> {
	if (await pathExists(path.join(pkgPath, 'pnpm-lock.yaml'))) {
		return { isPreferred: true, hasLockfile: true };
	}
	if (await pathExists(path.join(pkgPath, 'shrinkwrap.yaml'))) {
		return { isPreferred: true, hasLockfile: true };
	}
	if (await findUp('pnpm-lock.yaml', { cwd: pkgPath })) {
		return { isPreferred: true, hasLockfile: true };
	}

	return { isPreferred: false, hasLockfile: false };
}

async function isYarnPreferred(pkgPath: string): Promise<PreferredProperties> {
	if (await pathExists(path.join(pkgPath, 'yarn.lock'))) {
		return { isPreferred: true, hasLockfile: true };
	}

	try {
		if (typeof findWorkspaceRoot(pkgPath) === 'string') {
			return { isPreferred: true, hasLockfile: false };
		}
	} catch (err) { }

	return { isPreferred: false, hasLockfile: false };
}

async function isNPMPreferred(pkgPath: string): Promise<PreferredProperties> {
	const lockfileExists = await pathExists(path.join(pkgPath, 'package-lock.json'));
	return { isPreferred: lockfileExists, hasLockfile: lockfileExists };
}

export async function findPreferredPM(pkgPath: string): Promise<{ name: string; multipleLockFilesDetected: boolean }> {
	const detectedPackageManagerNames: string[] = [];
	const detectedPackageManagerProperties: PreferredProperties[] = [];

	const npmPreferred = await isNPMPreferred(pkgPath);
	if (npmPreferred.isPreferred) {
		detectedPackageManagerNames.push('npm');
		detectedPackageManagerProperties.push(npmPreferred);
	}

	const pnpmPreferred = await isPNPMPreferred(pkgPath);
	if (pnpmPreferred.isPreferred) {
		detectedPackageManagerNames.push('pnpm');
		detectedPackageManagerProperties.push(pnpmPreferred);
	}

	const yarnPreferred = await isYarnPreferred(pkgPath);
	if (yarnPreferred.isPreferred) {
		detectedPackageManagerNames.push('yarn');
		detectedPackageManagerProperties.push(yarnPreferred);
	}

	const bunPreferred = await isBunPreferred(pkgPath);
	if (bunPreferred.isPreferred) {
		detectedPackageManagerNames.push('bun');
		detectedPackageManagerProperties.push(bunPreferred);
	}

	const pmUsedForInstallation: { name: string } | null = await whichPM(pkgPath);

	if (pmUsedForInstallation && !detectedPackageManagerNames.includes(pmUsedForInstallation.name)) {
		detectedPackageManagerNames.push(pmUsedForInstallation.name);
		detectedPackageManagerProperties.push({ isPreferred: true, hasLockfile: false });
	}

	let lockfilesCount = 0;
	detectedPackageManagerProperties.forEach(detected => lockfilesCount += detected.hasLockfile ? 1 : 0);

	return {
		name: detectedPackageManagerNames[0] || 'npm',
		multipleLockFilesDetected: lockfilesCount > 1
	};
}
