/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface TimelineRecord {
	readonly name: string;
	readonly identifier?: string;
	readonly type: string;
	readonly state: string;
	readonly result: string;
}

export interface Timeline {
	readonly records: TimelineRecord[];
}

/**
 * Artifacts that can only be published once a job succeeded, by job name. The
 * platform test jobs run in parallel with the jobs that produce these artifacts
 * (see the platform-specific product-build job templates). The tests of a
 * platform can be sharded across several jobs named `<job name>_<shard>`, in
 * which case every shard must succeed.
 */
const artifactsByGatingJob: Readonly<Record<string, readonly string[]>> = {
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
 */
export function getGatingJob(timeline: Timeline, artifactName: string): IGatingJob | undefined {
	const name = Object.keys(artifactsByGatingJob).find(job => artifactsByGatingJob[job].includes(artifactName));

	if (!name) {
		return undefined;
	}

	// Job identifiers have the form `<stage>.<job>.__default`, and a retried job has a record for each attempt
	const attemptsByJob = new Map<string, TimelineRecord[]>();

	for (const record of timeline.records) {
		if (record.type !== 'Job') {
			continue;
		}

		const job = record.identifier?.split('.').find(part => part === name || part.startsWith(`${name}_`)) ?? (record.name === name ? name : undefined);

		if (job) {
			attemptsByJob.set(job, [...attemptsByJob.get(job) ?? [], record]);
		}
	}

	if (attemptsByJob.size === 0) {
		return { name, state: 'missing' };
	}

	const jobs: IGatingJob[] = [...attemptsByJob].map(([job, attempts]) => {
		if (attempts.some(r => r.state === 'completed' && (r.result === 'succeeded' || r.result === 'succeededWithIssues'))) {
			return { name: job, state: 'succeeded' };
		} else {
			return { name: job, state: attempts.some(r => r.state !== 'completed') ? 'pending' : 'failed' };
		}
	});

	return jobs.find(job => job.state === 'failed')
		?? jobs.find(job => job.state === 'pending')
		?? { name: jobs.map(job => job.name).join(', '), state: 'succeeded' };
}
