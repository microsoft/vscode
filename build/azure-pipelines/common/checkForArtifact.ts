/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Artifact, requestAZDOAPI } from './publish.ts';
import { retry } from './retry.ts';

async function getPipelineArtifacts(): Promise<Artifact[]> {
	const result = await requestAZDOAPI<{ readonly value: Artifact[] }>('artifacts');
	return result.value.filter(a => !/sbom$/.test(a.name));
}

async function main([variableName, artifactName]: string[]): Promise<void> {
	if (!variableName || !artifactName) {
		throw new Error(`Usage: node checkForArtifact.ts <variableName> <artifactName>`);
	}

	try {
		const artifacts = await retry(() => getPipelineArtifacts());
		const artifact = artifacts.find(a => a.name === artifactName);
		console.log(`##vso[task.setvariable variable=${variableName}]${artifact ? 'true' : 'false'}`);
	} catch (err) {
		console.error(`ERROR: Failed to get pipeline artifacts: ${err}`);
		console.log(`##vso[task.setvariable variable=${variableName}]false`);
	}
}

main(process.argv.slice(2))
	.then(() => {
		process.exit(0);
	}, err => {
		console.error(err);
		process.exit(1);
	});
