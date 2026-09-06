/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Artifact, requestAZDOAPI } from '../common/publish.ts';
import { retry } from '../common/retry.ts';

async function getPipelineArtifacts(): Promise<Artifact[]> {
	const result = await requestAZDOAPI<{ readonly value: Artifact[] }>('artifacts');
	return result.value.filter(a => !/sbom$/.test(a.name));
}

interface TimelineRecord {
	readonly name: string;
	readonly identifier?: string;
	readonly type: string;
	readonly state: string;
	readonly result: string;
}

interface Timeline {
	readonly records: TimelineRecord[];
}

async function getPipelineTimeline(): Promise<Timeline> {
	return await requestAZDOAPI<Timeline>('timeline');
}

class ProducerFailedError extends Error { }

// Determines whether the job that produces the given artifact has failed for good,
// matched by its display name or identifier. A producer counts as failed only when
// at least one of its records completed unsuccessfully and none of its records is
// still running or completed successfully. This guards against job retries, where an
// earlier failed attempt and a newer in-progress or successful attempt can both appear
// in the timeline. A producer that succeeded (even with issues) is expected to have
// uploaded its artifact, so it does not count as a failure here.
function findFailedProducer(timeline: Timeline, producer: string): TimelineRecord | undefined {
	const records = timeline.records.filter(r =>
		r.type === 'Job' && (r.name === producer || r.identifier === producer));

	if (records.length === 0) {
		return undefined;
	}

	// A still-running or successful attempt means the artifact may still be uploaded.
	if (records.some(r => r.state !== 'completed' || r.result === 'succeeded' || r.result === 'succeededWithIssues')) {
		return undefined;
	}

	return records[0];
}

// Parses the command line into the set of artifacts to wait for and an optional
// mapping from artifact name to the job that produces it. Producers are declared
// as `--producer=<artifactName>=<producerJob>` and let us short circuit as soon
// as a producer of a still-missing artifact fails, instead of waiting the full
// 60 minutes. Bare arguments are treated as artifact names without a producer.
function parseArgs(args: string[]): { artifacts: string[]; producers: Map<string, string> } {
	const artifacts = new Set<string>();
	const producers = new Map<string, string>();

	for (const arg of args) {
		const match = /^--producer=(?<artifact>[^=]+)=(?<job>.+)$/.exec(arg);
		if (match) {
			const { artifact, job } = match.groups!;
			artifacts.add(artifact);
			producers.set(artifact, job);
		} else {
			artifacts.add(arg);
		}
	}

	return { artifacts: [...artifacts], producers };
}

async function main(args: string[]): Promise<void> {
	const { artifacts, producers } = parseArgs(args);

	if (artifacts.length === 0) {
		throw new Error(`Usage: node waitForArtifacts.ts [--producer=<artifactName>=<producerJob> ...] <artifactName1> <artifactName2> ...`);
	}

	// This loop will run for 60 minutes and waits to the x64 and arm64 artifacts
	// to be uploaded to the pipeline by the `macOS` and `macOSARM64` jobs. As soon
	// as these artifacts are found, the loop completes and the `macOSUnivesrsal`
	// job resumes.
	for (let index = 0; index < 120; index++) {
		try {
			console.log(`Waiting for artifacts (${artifacts.join(', ')}) to be uploaded (${index + 1}/120)...`);
			const allArtifacts = await retry(() => getPipelineArtifacts());
			console.log(`  * Artifacts attached to the pipelines: ${allArtifacts.length > 0 ? allArtifacts.map(a => a.name).join(', ') : 'none'}`);

			const foundArtifacts = allArtifacts.filter(a => artifacts.includes(a.name));
			console.log(`  * Found artifacts: ${foundArtifacts.length > 0 ? foundArtifacts.map(a => a.name).join(', ') : 'none'}`);

			if (foundArtifacts.length === artifacts.length) {
				console.log(`  * All artifacts were found`);
				return;
			}

			// Short circuit if a producer of a still-missing artifact has already
			// completed without success, since that artifact will never be uploaded.
			const missingWithProducers = artifacts.filter(a => producers.has(a) && !foundArtifacts.some(f => f.name === a));
			if (missingWithProducers.length > 0) {
				const timeline = await retry(() => getPipelineTimeline());
				for (const artifact of missingWithProducers) {
					const producer = producers.get(artifact)!;
					const failed = findFailedProducer(timeline, producer);
					if (failed) {
						throw new ProducerFailedError(`Producer job "${failed.name}" ${failed.result} before uploading artifact "${artifact}". It will never be uploaded.`);
					}
				}
			}
		} catch (err) {
			if (err instanceof ProducerFailedError) {
				throw err;
			}

			console.error(`ERROR: Failed to get pipeline artifacts: ${err}`);
		}

		await new Promise(c => setTimeout(c, 30_000));
	}

	throw new Error(`ERROR: Artifacts (${artifacts.join(', ')}) were not uploaded within 60 minutes.`);
}

main(process.argv.splice(2)).catch(err => {
	console.error(err);
	process.exitCode = 1;
});
