/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type RepoctxEvidenceStageId = 'context' | 'impact' | 'review' | 'gate' | 'audit';

export type RepoctxStageState = 'available' | 'running' | 'failed' | 'needs-request' | 'ready';

export interface IRepoctxStageStateOptions {
	readonly artifactPath: string | undefined;
	readonly isRunning: boolean;
	readonly hasFailed: boolean;
	readonly requiresTask: boolean;
	readonly hasTask: boolean;
}

export interface IRepoctxEvidenceStage {
	readonly id: RepoctxEvidenceStageId;
	readonly artifactPaths: readonly string[];
}

export type RepoctxEvidence = Record<RepoctxEvidenceStageId, string | undefined>;

export interface IRepoctxStageInvocation {
	readonly stageId: RepoctxEvidenceStageId;
	readonly title: string;
	readonly args: readonly string[];
	readonly artifactPath: string;
}

export const repoctxEvidenceStages: readonly IRepoctxEvidenceStage[] = [
	{
		id: 'context',
		artifactPaths: ['context-pack.md', 'context.json', 'index.json', 'report.md', 'harness.md'],
	},
	{
		id: 'impact',
		artifactPaths: ['impact.md', 'impact.json'],
	},
	{
		id: 'review',
		artifactPaths: ['pr-review.md', 'review.md', 'review.json'],
	},
	{
		id: 'gate',
		artifactPaths: ['gate.md', 'gate.json', 'pass.md', 'pass.json'],
	},
	{
		id: 'audit',
		artifactPaths: ['convergence.md', 'convergence.json', 'audit-ledger.md', 'audit-ledger.json'],
	},
];

export function getRepoctxStageState(options: IRepoctxStageStateOptions): RepoctxStageState {
	if (options.isRunning) {
		return 'running';
	}

	if (options.artifactPath) {
		return 'available';
	}

	if (options.hasFailed) {
		return 'failed';
	}

	if (options.requiresTask && !options.hasTask) {
		return 'needs-request';
	}

	return 'ready';
}

export async function findRepoctxEvidence(exists: (relativePath: string) => Promise<boolean>): Promise<RepoctxEvidence> {
	const entries = await Promise.all(repoctxEvidenceStages.map(async stage => {
		for (const artifactPath of stage.artifactPaths) {
			if (await exists(artifactPath)) {
				return [stage.id, artifactPath] as const;
			}
		}

		return [stage.id, undefined] as const;
	}));

	return Object.fromEntries(entries) as RepoctxEvidence;
}

export function getRepoctxStageInvocation(stageId: RepoctxEvidenceStageId, task: string): IRepoctxStageInvocation {
	const normalizedTask = task.trim();

	switch (stageId) {
		case 'context':
			return {
				stageId,
				title: 'Repoctx Context',
				args: ['context', normalizedTask, '--path', '.', '--out', '.dev-context/context-pack.md'],
				artifactPath: 'context-pack.md',
			};
		case 'impact':
			return {
				stageId,
				title: 'Repoctx Impact',
				args: ['impact', '.', normalizedTask, '--out', '.dev-context/impact.md'],
				artifactPath: 'impact.md',
			};
		case 'review':
			return {
				stageId,
				title: 'Repoctx Review',
				args: ['pr', '.', '--base', 'origin/main', '--out', '.dev-context/pr-review.md'],
				artifactPath: 'pr-review.md',
			};
		case 'gate':
			return {
				stageId,
				title: 'Repoctx Gate',
				args: ['gate', '.', '--base', 'origin/main', '--request', normalizedTask, '--out', '.dev-context/gate.md'],
				artifactPath: 'gate.md',
			};
		case 'audit':
			return {
				stageId,
				title: 'Repoctx Audit',
				args: ['converge', '.', normalizedTask, '--base', 'origin/main', '--out', '.dev-context/convergence.md'],
				artifactPath: 'convergence.md',
			};
	}
}
