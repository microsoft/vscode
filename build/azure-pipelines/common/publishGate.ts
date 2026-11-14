/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface TimelineRecord {
	readonly name: string;
	readonly identifier?: string;
	readonly type: string;
	readonly state: string;
	readonly result: string | null;
}

export interface Timeline {
	readonly records: TimelineRecord[];
}

const mobileArtifactName = 'vscode_web_linux_mobile_archive-unsigned';

/**
 * Whether the timeline record is the given stage. Stages are matched by their
 * YAML identifier, since the record name is the stage's display name when one
 * is set.
 */
export function isStage(record: TimelineRecord, stage: string): boolean {
	return record.type === 'Stage' && (record.identifier === stage || record.name === stage);
}

export function warnIfMobileArtifactMissing(timeline: Timeline, artifactNames: readonly string[]): void {
	if (timeline.records.some(record => isStage(record, 'Mobile') && record.state === 'completed') && !artifactNames.includes(mobileArtifactName)) {
		console.log(`##vso[task.logissue type=warning]Mobile was enabled but ${mobileArtifactName} was not produced. Check the Mobile stage; continuing the ordinary release.`);
	}
}

/** Mobile publication is best-effort; ordinary artifact failures still block release. */
export async function runArtifactPublishOperation<T>(name: string, operation: () => Promise<T>): Promise<{ succeeded: true; value: T } | { succeeded: false }> {
	try {
		return { succeeded: true, value: await operation() };
	} catch (error) {
		if (name !== mobileArtifactName) {
			throw error;
		}
		const message = `[${name}] Mobile publication failed; continuing the ordinary release: ${error}`;
		console.log(`##vso[task.logissue type=warning]${message.replaceAll('%', '%AZP25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);
		return { succeeded: false };
	}
}

/**
 * Artifacts that can only be published once a job succeeded, by job name. The
 * platform test jobs run in parallel with the jobs that produce these artifacts
 * (see the platform-specific product-build job templates). The tests of a
 * platform can be sharded across several jobs named `<job name>_<shard>`, in
 * which case every shard must succeed.
 */
export const artifactsByGatingJob: Readonly<Record<string, readonly string[]>> = {
	'Windows_x64_Test': [
		'vscode_client_win32_x64_setup',
		'vscode_client_win32_x64_user-setup',
		'vscode_client_win32_x64_archive',
		'vscode_server_win32_x64_archive',
		'vscode_web_win32_x64_archive',
		'vscode_cli_win32_x64_cli',
	],
	'Linux_x64_Test': [
		'vscode_client_linux_x64_archive-unsigned',
		'vscode_client_linux_x64_deb-package',
		'vscode_client_linux_x64_rpm-package',
		'vscode_client_linux_x64_snap',
		'vscode_server_linux_x64_archive-unsigned',
		'vscode_web_linux_x64_archive-unsigned',
		'vscode_cli_linux_x64_cli',
	],
	'macOS_arm64_Test': [
		'vscode_client_darwin_arm64_archive',
		'vscode_client_darwin_arm64_dmg',
		'vscode_server_darwin_arm64_archive',
		'vscode_web_darwin_arm64_archive',
		'vscode_cli_darwin_arm64_cli',
		'vscode_client_darwin_universal_archive',
		'vscode_client_darwin_universal_dmg',
	],
};

export interface IGatingJob {
	/** The job that blocks the publishing, or all gating jobs when none does. */
	readonly name: string;
	/** `missing` when the job is not part of the pipeline run, e.g. when tests are skipped. */
	readonly state: 'succeeded' | 'pending' | 'failed' | 'missing';
}

/**
 * Returns the job that gates the publishing of the artifact, if any, see
 * `artifactsByGatingJob`. When the tests are sharded, returns a failed shard,
 * else a pending one, else all shards once they all succeeded.
 *
 * Jobs are read from their `Phase` records, which exist for every job of the
 * run from the moment it is queued and reflect the job's latest attempt. A job
 * only gets a `Job` record once it is scheduled, so a test job that still waits
 * for its compile job, or that a stage retry reset, has none yet and must not
 * be mistaken for a job that isn't part of the run.
 */
export function getGatingJob(timeline: Timeline, artifactName: string): IGatingJob | undefined {
	const name = Object.keys(artifactsByGatingJob).find(job => artifactsByGatingJob[job].includes(artifactName));

	if (!name) {
		return undefined;
	}

	// Phase identifiers have the form `<stage>.<job>`
	const jobs: IGatingJob[] = timeline.records
		.filter(record => record.type === 'Phase')
		.flatMap((record): IGatingJob[] => {
			const job = record.identifier?.split('.').pop();

			if (!job || (job !== name && !job.startsWith(`${name}_`))) {
				return [];
			}

			if (record.state !== 'completed') {
				return [{ name: job, state: 'pending' }];
			}

			// Anything else, including `skipped` when the compile job failed, blocks the publishing
			return [{ name: job, state: record.result === 'succeeded' || record.result === 'succeededWithIssues' ? 'succeeded' : 'failed' }];
		});

	if (jobs.length === 0) {
		return { name, state: 'missing' };
	}

	return jobs.find(job => job.state === 'failed')
		?? jobs.find(job => job.state === 'pending')
		?? { name: jobs.map(job => job.name).join(', '), state: 'succeeded' };
}
