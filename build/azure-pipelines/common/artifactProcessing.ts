/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface Timeline {
	readonly records: {
		readonly name: string;
		readonly type: string;
		readonly state: string;
		readonly result: string;
	}[];
}

export class ProducerStageError extends Error { }

export interface ArtifactProcessingOptions<T extends { readonly name: string }> {
	readonly stages: ReadonlySet<string>;
	readonly done: {
		readonly size: number;
		has(name: string): boolean;
		add(name: string): void;
	};
	readonly getState: () => Promise<{ timeline: Timeline; artifacts: readonly T[] }>;
	readonly prepareArtifact: (artifact: T) => Promise<string>;
	readonly publishArtifact: (artifact: T, filePath: string) => Promise<void>;
	readonly wait: () => Promise<void>;
	readonly log: (message: string) => void;
	readonly logError: (message: string, error: unknown) => void;
}

export async function processArtifacts<T extends { readonly name: string }>(options: ArtifactProcessingOptions<T>): Promise<Timeline> {
	const { stages, done, log } = options;
	const processing = new Set<string>();
	const operations: { name: string; operation: Promise<void> }[] = [];
	let resultPromise = Promise.resolve<PromiseSettledResult<void>[]>([]);
	let timeline: Timeline;

	while (true) {
		const state = await options.getState();
		timeline = state.timeline;
		const artifacts = state.artifacts;
		const stagesCompleted = new Set(timeline.records.filter(r => r.type === 'Stage' && r.state === 'completed' && stages.has(r.name)).map(r => r.name));
		const stagesInProgress = [...stages].filter(stage => !stagesCompleted.has(stage));
		const artifactsInProgress = artifacts.filter(artifact => processing.has(artifact.name));

		if (stagesInProgress.length === 0 && artifacts.length === done.size + processing.size) {
			break;
		} else if (stagesInProgress.length > 0) {
			log(`Stages in progress: ${stagesInProgress.join(', ')}`);
		} else if (artifactsInProgress.length > 0) {
			log(`Artifacts in progress: ${artifactsInProgress.map(artifact => artifact.name).join(', ')}`);
		} else {
			log(`Waiting for a total of ${artifacts.length}, ${done.size} done, ${processing.size} in progress...`);
		}

		for (const artifact of artifacts) {
			if (done.has(artifact.name) || processing.has(artifact.name)) {
				continue;
			}

			log(`[${artifact.name}] Found new artifact`);
			// Keep download/extraction serial to avoid Azure DevOps throttling; publication runs concurrently.
			const artifactFilePath = await options.prepareArtifact(artifact);
			processing.add(artifact.name);
			const operation = options.publishArtifact(artifact, artifactFilePath).then(() => {
				processing.delete(artifact.name);
				done.add(artifact.name);
				log(`\u2705 ${artifact.name} `);
			});
			operations.push({ name: artifact.name, operation });
			resultPromise = Promise.allSettled(operations.map(operation => operation.operation));
		}

		await options.wait();
	}

	log(`Discovered ${done.size + processing.size} artifacts, waiting for ${processing.size} artifacts to finish publishing...`);
	const artifactsInProgress = operations.filter(operation => processing.has(operation.name));
	if (artifactsInProgress.length > 0) {
		log(`Artifacts in progress: ${artifactsInProgress.map(operation => operation.name).join(', ')}`);
	}

	const results = await resultPromise;
	for (let i = 0; i < operations.length; i++) {
		const result = results[i];
		if (result.status === 'rejected') {
			options.logError(`[${operations[i].name}]`, result.reason);
		}
	}

	if (results.some(result => result.status === 'rejected')) {
		throw new Error('Some artifacts failed to publish');
	}

	return timeline;
}

export function validateProducerStages(timeline: Timeline, stages: ReadonlySet<string>): void {
	if (!timeline || !Array.isArray(timeline.records)) {
		throw new ProducerStageError('Invalid pipeline timeline; cannot validate producer stages.');
	}

	const failures: string[] = [];
	for (const stage of stages) {
		const record = timeline.records.find(record => record.name === stage && record.type === 'Stage');
		if (!record) {
			failures.push(`Stage ${stage} is missing from the timeline`);
		} else if (record.state !== 'completed') {
			failures.push(`Stage ${stage} has not completed: ${record.state}`);
		} else if (record.result !== 'succeeded' && record.result !== 'succeededWithIssues') {
			failures.push(`Stage ${stage} did not succeed: ${record.result}`);
		}
	}

	if (failures.length > 0) {
		throw new ProducerStageError(`Some stages did not succeed:\n${failures.join('\n')}`);
	}
}
