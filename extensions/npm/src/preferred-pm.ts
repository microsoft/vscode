/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import findUp from 'find-up';
import whichPM from 'which-pm';
import { Uri, workspace } from 'vscode';

async function pathExists(filePath: string) {
	try {
		await workspace.fs.stat(Uri.file(filePath));
	} catch {
		return false;
	}
	return true;
}

async function lockfileExists(lockfile: string, pkgPath: string) {
	const filePath = path.join(pkgPath, lockfile);
	const pkgExists = await pathExists(filePath);
	if (pkgExists) {
		return true;
	}
	const lockfileExists = await findUp(lockfile, { cwd: pkgPath });
	return !!lockfileExists;
}

/** Each entry: [pm name, lock file relative path] in detection priority order */
const LOCKFILE_CANDIDATES: [string, string][] = [
	['npm', 'package-lock.json'],
	['pnpm', 'pnpm-lock.yaml'],
	['pnpm', 'shrinkwrap.yaml'],
	['yarn', 'yarn.lock'],
	['bun', 'bun.lock'],
	['bun', 'bun.lockb'],
];

async function readPackageManagerField(pkgPath: string): Promise<string | void> {
	try {
		const pkgJsonPath = Uri.file(path.join(pkgPath, 'package.json'));
		const raw = await workspace.fs.readFile(pkgJsonPath);
		const json = JSON.parse(Buffer.from(raw).toString('utf8'));
		if (typeof json.packageManager === 'string' && json.packageManager.length > 0) {
			const pmName = json.packageManager.split('@')[0];
			if (LOCKFILE_CANDIDATES.some(([pm]) => pm === pmName)) {
				return pmName;
			}
		}
	} catch { }
}

export async function findPreferredPM(pkgPath: string): Promise<{ name: string; multipleLockFilesDetected: boolean }> {
	const declaredPM = await readPackageManagerField(pkgPath);

	const lockFiles: string[] = [];

	for (const [pmName, lockfile] of LOCKFILE_CANDIDATES) {
		if (await lockfileExists(lockfile, pkgPath)) {
			lockFiles.push(pmName);
			if (lockFiles.length > 1) {
				return {
					name: declaredPM ?? lockFiles[0],
					multipleLockFilesDetected: true
				};
			}
		}
	}

	if (declaredPM) {
		return {
			name: declaredPM,
			multipleLockFilesDetected: false
		};
	}

	if (lockFiles.length) {
		return {
			name: lockFiles[0],
			multipleLockFilesDetected: false
		};
	}

	const pmUsedForInstallation: { name: string } | null = await whichPM(pkgPath);

	return {
		name: pmUsedForInstallation?.name ?? 'npm',
		multipleLockFilesDetected: false
	};
}
