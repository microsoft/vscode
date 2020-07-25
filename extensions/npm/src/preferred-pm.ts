/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { findWorkspaceRoot } from 'find-yarn-workspace-root2';
import findUp from 'find-up';
import path from 'path';
import pathExists from 'path-exists';
import whichPM from 'which-pm';

const isPNPMPreferred = async (pkgPath: string) => {
	if (await pathExists(path.join(pkgPath, 'pnpm-lock.yaml'))) {
		return true;
	}
	if (await pathExists(path.join(pkgPath, 'shrinkwrap.yaml'))) {
		return true;
	}
	if (await findUp('pnpm-lock.yaml', { cwd: pkgPath })) {
		return true;
	}

	return false;
};

const isYarnPreferred = async (pkgPath: string) => {
	if (await pathExists(path.join(pkgPath, 'yarn.lock'))) {
		return true;
	}

	try {
		if (typeof findWorkspaceRoot(pkgPath) === 'string') {
			return true;
		}
	} catch (err) { }

	return false;
};

const isNPMPreferred = (pkgPath: string) => {
	return pathExists(path.join(pkgPath, 'package-lock.json'));
};

const findPreferredPM = async (pkgPath: string) => {
	const detectedPackageManagers = [];

	if (await isNPMPreferred(pkgPath)) {
		detectedPackageManagers.push('npm');
	}

	if (await isYarnPreferred(pkgPath)) {
		detectedPackageManagers.push('yarn');
	}

	if (await isPNPMPreferred(pkgPath)) {
		detectedPackageManagers.push('pnpm');
	}

	const { name: pmUsedForInstallation } = await whichPM(pkgPath);

	if (!detectedPackageManagers.includes(pmUsedForInstallation)) {
		detectedPackageManagers.push(pmUsedForInstallation);
	}

	const multiplePMDetected = detectedPackageManagers.length > 1;

	return {
		name: detectedPackageManagers[0] || 'npm',
		multiplePMDetected
	};
};

export default findPreferredPM;
