/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import type { ReadableStream } from 'stream/web';
import { pipeline } from 'node:stream/promises';
import { retry } from './retry';

function e(name: string): string {
	const result = process.env[name];

	if (typeof result !== 'string') {
		throw new Error(`Missing env: ${name}`);
	}

	return result;
}

const azdoFetchOptions = { headers: { Authorization: `Bearer ${e('SYSTEM_ACCESSTOKEN')}` } };

async function requestAZDOAPI<T>(path: string): Promise<T> {
	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), 2 * 60 * 1000);

	try {
		const res = await fetch(`${e('BUILDS_API_URL')}${path}?api-version=6.0`, { ...azdoFetchOptions, signal: abortController.signal });

		if (!res.ok) {
			throw new Error(`Unexpected status code: ${res.status}`);
		}

		return await res.json();
	} finally {
		clearTimeout(timeout);
	}
}

interface Artifact {
	readonly name: string;
	readonly resource: {
		readonly downloadUrl: string;
		readonly properties: {
			readonly artifactsize: number;
		};
	};
}

async function getPipelineArtifacts(): Promise<Artifact[]> {
	const result = await requestAZDOAPI<{ readonly value: Artifact[] }>('artifacts');
	return result.value.filter(a => /^vscode_/.test(a.name) && !/sbom$/.test(a.name));
}

async function downloadArtifact(artifact: Artifact, downloadPath: string): Promise<void> {
	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), 4 * 60 * 1000);

	try {
		const res = await fetch(artifact.resource.downloadUrl, { ...azdoFetchOptions, signal: abortController.signal });

		if (!res.ok) {
			throw new Error(`Unexpected status code: ${res.status}`);
		}

		await pipeline(Readable.fromWeb(res.body as ReadableStream), fs.createWriteStream(downloadPath));
	} finally {
		clearTimeout(timeout);
	}
}


async function main() {
	const artifacts = await retry(() => getPipelineArtifacts());

	for (const artifact of artifacts) {
		const artifactZipPath = path.join(e('AGENT_TEMPDIRECTORY'), `${artifact.name}.zip`);

		console.log(`Downloading ${artifact.name}...`);
		const start = Date.now();
		await downloadArtifact(artifact, artifactZipPath);
		const archiveSize = fs.statSync(artifactZipPath).size;
		const downloadDurationS = (Date.now() - start) / 1000;
		const downloadSpeedKBS = Math.round((archiveSize / 1024) / downloadDurationS);
		console.log(`Successfully downloaded ${artifact.name} in ${Math.floor(downloadDurationS)} seconds (${downloadSpeedKBS} KB/s).`);
	}
}

if (require.main === module) {
	main().then(() => {
		process.exit(0);
	}, err => {
		console.error(err);
		process.exit(1);
	});
}
