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

/**
 * Sets each variable to whether its artifact already exists in this build, for
 * example because an earlier attempt of a retried job published it. Pipeline
 * artifacts are immutable, so publishing it again would fail the job.
 */
async function main(args: string[]): Promise<void> {
	if (args.length === 0 || args.length % 2 !== 0) {
		throw new Error(`Usage: node checkForArtifact.ts <variableName> <artifactName> [<variableName> <artifactName> ...]`);
	}

	const pairs: [variableName: string, artifactName: string][] = [];

	for (let i = 0; i < args.length; i += 2) {
		pairs.push([args[i], args[i + 1]]);
	}

	try {
		const artifacts = await retry(() => getPipelineArtifacts());
		const published = new Set(artifacts.map(a => a.name));

		for (const [variableName, artifactName] of pairs) {
			const isPublished = published.has(artifactName);
			console.log(`${artifactName}: ${isPublished ? 'already published' : 'not published yet'}`);
			console.log(`##vso[task.setvariable variable=${variableName}]${isPublished ? 'true' : 'false'}`);
		}
	} catch (err) {
		console.error(`ERROR: Failed to get pipeline artifacts: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);

		for (const [variableName] of pairs) {
			console.log(`##vso[task.setvariable variable=${variableName}]false`);
		}
	}
}

main(process.argv.slice(2))
	.then(() => {
		process.exit(0);
	}, err => {
		console.error(err);
		process.exit(1);
	});
