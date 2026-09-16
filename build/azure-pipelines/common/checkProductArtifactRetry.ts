/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { e, requestAZDOAPI } from './azureDevOps.ts';
import { retry } from './retry.ts';

interface AssociatedArtifact {
	readonly id: number;
	readonly name: string;
	readonly source?: string | null;
}

function isAssociatedArtifact(value: unknown): value is AssociatedArtifact {
	return typeof value === 'object' && value !== null
		&& 'id' in value && typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0
		&& 'name' in value && typeof value.name === 'string' && value.name.length > 0
		&& (!('source' in value) || value.source === null || typeof value.source === 'string');
}

function isArtifactList(value: unknown): value is { readonly value: readonly AssociatedArtifact[] } {
	return typeof value === 'object' && value !== null && 'value' in value
		&& Array.isArray(value.value) && value.value.every(isAssociatedArtifact);
}

export async function checkProductArtifactRetry(
	jobAttempt: number,
	artifactNames: readonly string[],
	getArtifacts: () => Promise<unknown> = () => requestAZDOAPI('artifacts'),
): Promise<void> {
	if (!Number.isSafeInteger(jobAttempt) || jobAttempt < 1) {
		throw new Error('System.JobAttempt must be a positive integer.');
	}
	if (artifactNames.length === 0 || artifactNames.some(name => !name.trim())) {
		throw new Error('Expected the canonical product artifact names for this job.');
	}
	if (jobAttempt === 1) {
		return;
	}

	const response = await retry(getArtifacts);
	if (!isArtifactList(response)) {
		throw new Error('Invalid build artifacts response; cannot determine whether this product job can be retried.');
	}

	const names = new Set(artifactNames.map(name => name.toLowerCase()));
	const published = response.value.filter(artifact => names.has(artifact.name.toLowerCase()));
	if (published.length === 0) {
		return;
	}

	const details = published.map(artifact =>
		`${artifact.name} (artifact ${artifact.id}, ${artifact.source ? `producer job ${artifact.source}` : 'producer job not recorded'})`);
	throw new Error(
		`Cannot rebuild product job attempt ${jobAttempt}: canonical artifacts are already associated with this build:\n`
		+ details.map(detail => `  ${detail}`).join('\n')
		+ '\nRebuilding and signing may produce different bytes under these immutable names. '
		+ 'Stop retrying this producer job and ask the release owner to assess the existing outputs and downstream assets. '
		+ 'No artifacts have been reused, overwritten, or deleted by this check.'
	);
}

if (import.meta.main) {
	console.log('##vso[task.setvariable variable=PRODUCT_ARTIFACT_RETRY_CHECK_FAILED]true');
	checkProductArtifactRetry(Number(e('SYSTEM_JOBATTEMPT')), process.argv.slice(2)).then(() => {
		console.log('No existing product artifact associations prevent this job attempt. Final publication still validates the association.');
		console.log('##vso[task.setvariable variable=PRODUCT_ARTIFACT_RETRY_CHECK_FAILED]false');
	}, err => {
		console.error(err);
		process.exitCode = 1;
	});
}
