/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import findWorkspaceRoot = require('../node_modules/find-yarn-workspace-root');
import findUp from 'find-up';
import * as path from 'path';
import whichPM from 'which-pm';
import { Uri, workspace } from 'vscode';

interface PreferredProperties {
	isPreferred: boolean;
	hasLockfile: boolean;
}

type PreferredPMResult = { name: string; multipleLockFilesDetected: boolean };

const SUPPORTED_PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

const preferredPMCache = new Map<string, Promise<PreferredPMResult>>();

async function pathExists(filePath: string) {
	try {
		await workspace.fs.stat(Uri.file(filePath));
	} catch {
		return false;
	}
	return true;
}

async function readPackageManagerField(packageJsonPath: string): Promise<string | undefined> {
	try {
		const bytes = await workspace.fs.readFile(Uri.file(packageJsonPath));
		const json = JSON.parse(new TextDecoder().decode(bytes));
		const value = json?.packageManager;
		if (typeof value !== 'string') {
			return undefined;
		}
		// Corepack format: "<name>@<version>[+<hash>]"
		const name = value.split('@', 1)[0].trim();
		return SUPPORTED_PACKAGE_MANAGERS.has(name) ? name : undefined;
	} catch {
		return undefined;
	}
}

async function findPackageManagerFromField(pkgPath: string): Promise<string | undefined> {
	let result: string | undefined;
	await findUp(async directory => {
		const candidate = path.join(directory, 'package.json');
		if (await pathExists(candidate)) {
			const name = await readPackageManagerField(candidate);
			if (name) {
				result = name;
				return candidate;
			}
		}
		return undefined;
	}, { cwd: pkgPath });
	return result;
}

async function isBunPreferred(pkgPath: string): Promise<PreferredProperties> {
	if (await pathExists(path.join(pkgPath, 'bun.lockb'))) {
		return { isPreferred: true, hasLockfile: true };
	}

	if (await pathExists(path.join(pkgPath, 'bun.lock'))) {
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

export function invalidatePreferredPMCache() {
	preferredPMCache.clear();
}

export function findPreferredPM(pkgPath: string): Promise<PreferredPMResult> {
	let cached = preferredPMCache.get(pkgPath);
	if (!cached) {
		cached = computePreferredPM(pkgPath);
		preferredPMCache.set(pkgPath, cached);
	}
	return cached;
}

async function computePreferredPM(pkgPath: string): Promise<PreferredPMResult> {
	const detectedPackageManagerNames: string[] = [];
	const detectedPackageManagerProperties: PreferredProperties[] = [];

	const fromField = await findPackageManagerFromField(pkgPath);
	if (fromField) {
		detectedPackageManagerNames.push(fromField);
		detectedPackageManagerProperties.push({ isPreferred: true, hasLockfile: false });
	}

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
