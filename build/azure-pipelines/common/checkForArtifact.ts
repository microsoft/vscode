/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { retry } from './retry.ts';

// Uses only Node built-ins, so jobs that don't install the build dependencies
// (such as the CLI jobs) can run it too
function getBuildsApiUrl(): string {
	const { BUILDS_API_URL, SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECT, BUILD_BUILDID } = process.env;

	if (BUILDS_API_URL) {
		return BUILDS_API_URL;
	}

	if (!SYSTEM_COLLECTIONURI || !SYSTEM_TEAMPROJECT || !BUILD_BUILDID) {
		throw new Error('Missing BUILDS_API_URL, or SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECT and BUILD_BUILDID');
	}

	return `${SYSTEM_COLLECTIONURI.replace(/\/?$/, '/')}${encodeURIComponent(SYSTEM_TEAMPROJECT)}/_apis/build/builds/${BUILD_BUILDID}/`;
}

async function getPipelineArtifacts(): Promise<{ readonly name: string }[]> {
	const token = process.env.SYSTEM_ACCESSTOKEN;

	if (!token) {
		throw new Error('Missing SYSTEM_ACCESSTOKEN');
	}

	const res = await fetch(`${getBuildsApiUrl()}artifacts?api-version=6.0`, {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(2 * 60 * 1000),
	});

	if (!res.ok) {
		throw new Error(`Unexpected status code: ${res.status}`);
	}

	const result = await res.json() as { readonly value: { readonly name: string }[] };
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

// Let Node exit on its own. Forcing an exit while fetch is still closing its
// connection crashes Node on Windows with a libuv assertion (src\win\async.c)
main(process.argv.slice(2)).catch(err => {
	console.error(err);
	process.exitCode = 1;
});
