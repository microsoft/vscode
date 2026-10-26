/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotShimPackageFormat, ICopilotShimFixtureManifest } from './copilotShimFixtures.js';

export interface ICopilotShimTestRuntime {
	fixtures: ICopilotShimFixtureManifest;
	format: CopilotShimPackageFormat;
	grep: string;
	timeout: number;
}

let runtime: ICopilotShimTestRuntime | undefined;

/**
 * Sets the dedicated package-lifecycle runner configuration before Mocha loads the suite.
 */
export function setCopilotShimTestRuntime(value: ICopilotShimTestRuntime): void {
	if (runtime) {
		throw new Error('The Copilot shim package-lifecycle runtime was configured more than once.');
	}
	runtime = value;
}

/**
 * Returns the dedicated package-lifecycle runner configuration.
 */
export function getCopilotShimTestRuntime(): ICopilotShimTestRuntime {
	if (!runtime) {
		throw new Error('Copilot shim package-lifecycle tests must be launched through copilotShimIndex.ts.');
	}
	return runtime;
}
