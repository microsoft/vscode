/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import { constants, statSync } from 'fs';
import { performance, PerformanceObserver } from 'perf_hooks';
import { additionalDeps } from './dep-lists';

const obs = new PerformanceObserver((items) => {
	const entries = items.getEntries();
	for (const entry of entries) {
		console.log(`${entry.name}: ${entry.duration}ms`);
	}
	performance.clearMarks();
	performance.clearMeasures();
	obs.disconnect();
});
obs.observe({ entryTypes: ['measure'] });

export function generatePackageDeps(files: string[]): Set<string>[] {
	const dependencies: Set<string>[] = files.map(file => calculatePackageDeps(file));
	const additionalDepsSet = new Set(additionalDeps);
	dependencies.push(additionalDepsSet);
	return dependencies;
}

// Based on https://source.chromium.org/chromium/chromium/src/+/main:chrome/installer/linux/rpm/calculate_package_deps.py.
function calculatePackageDeps(binaryPath: string): Set<string> {
	const markName = `calculatePackageDeps-${binaryPath}`;
	performance.mark(`${markName}-start`);

	try {
		if (!(statSync(binaryPath).mode & constants.S_IXUSR)) {
			throw new Error(`Binary ${binaryPath} needs to have an executable bit set.`);
		}
	} catch (e) {
		// The package might not exist. Don't re-throw the error here.
		console.error('Tried to stat ' + binaryPath + ' but failed.');
	}

	const findRequiresResult = spawnSync('/usr/lib/rpm/find-requires', { input: binaryPath + '\n' });
	if (findRequiresResult.status !== 0) {
		throw new Error(`find-requires failed with exit code ${findRequiresResult.status}.\nstderr: ${findRequiresResult.stderr}`);
	}

	const requires = new Set(findRequiresResult.stdout.toString('utf-8').trimEnd().split('\n'));

	performance.mark(`${markName}-end`);
	performance.measure(markName, `${markName}-start`, `${markName}-end`);

	return requires;
}
