// Copyright (c) Son of Anton Contributors. All rights reserved.
// Licensed under the MIT License.

import {
	SyncCheckResult,
	SpecPipelineState,
	SpecPhaseState,
	TasksSpec,
	DesignSpec,
} from './types';

/**
 * Check whether a code file change affects any requirements in a spec.
 * Returns sync check results indicating which requirements may be out of date.
 */
export function checkCodeToSpecSync(
	changedFilePath: string,
	tasksSpec: TasksSpec,
	specDir: string,
): SyncCheckResult[] {
	const results: SyncCheckResult[] = [];

	for (const task of tasksSpec.tasks) {
		const matchesFile = task.files.some(f => {
			const normalisedTaskFile = normaliseFilePath(f);
			const normalisedChanged = normaliseFilePath(changedFilePath);
			return normalisedChanged.endsWith(normalisedTaskFile)
				|| normalisedTaskFile.endsWith(normalisedChanged);
		});

		if (matchesFile) {
			results.push({
				specFile: `${specDir}/tasks.md`,
				codeFile: changedFilePath,
				status: 'code_ahead',
				message: `Task ${task.id} ("${task.title}") references this file. ` +
					`Spec may need updating if the change affects requirement scope.`,
			});
		}
	}

	return results;
}

/**
 * Check whether a spec file change implies code changes are needed.
 * Returns sync check results indicating which code files may be out of date.
 */
export function checkSpecToCodeSync(
	changedSpecFile: string,
	designSpec: DesignSpec,
	specDir: string,
): SyncCheckResult[] {
	const results: SyncCheckResult[] = [];

	// If the design changed, all files in the file plan may need updating
	if (changedSpecFile.endsWith('design.md')) {
		for (const fileAction of designSpec.fileActions) {
			results.push({
				specFile: changedSpecFile,
				codeFile: fileAction.path,
				status: 'spec_ahead',
				message: `Design updated — ${fileAction.action} ${fileAction.path} ` +
					`may need to be ${fileAction.action === 'CREATE' ? 'created' : 'updated'}.`,
			});
		}
	}

	// If requirements changed, mark the design as potentially out of sync
	if (changedSpecFile.endsWith('requirements.md')) {
		results.push({
			specFile: changedSpecFile,
			codeFile: `${specDir}/design.md`,
			status: 'spec_ahead',
			message: 'Requirements changed — design document may need updating.',
		});
	}

	// If tasks changed, check the referenced files
	if (changedSpecFile.endsWith('tasks.md')) {
		results.push({
			specFile: changedSpecFile,
			codeFile: `${specDir}/requirements.md`,
			status: 'spec_ahead',
			message: 'Tasks changed — verify they still match the approved requirements.',
		});
	}

	return results;
}

/**
 * Compute the overall pipeline state for a feature.
 */
export function computePipelineState(
	featureName: string,
	specDir: string,
	fileExists: (path: string) => boolean,
	getModifiedTime: (path: string) => number | undefined,
): SpecPipelineState {
	return {
		featureName,
		specDir,
		requirements: computePhaseState(`${specDir}/requirements.md`, fileExists, getModifiedTime),
		design: computePhaseState(`${specDir}/design.md`, fileExists, getModifiedTime),
		tasks: computePhaseState(`${specDir}/tasks.md`, fileExists, getModifiedTime),
		properties: computePhaseState(`${specDir}/properties.test.ts`, fileExists, getModifiedTime),
	};
}

/**
 * Compute the state of a single pipeline phase based on file existence and metadata.
 */
function computePhaseState(
	filePath: string,
	fileExists: (path: string) => boolean,
	getModifiedTime: (path: string) => number | undefined,
): SpecPhaseState {
	if (!fileExists(filePath)) {
		return { status: 'missing' };
	}

	const lastModified = getModifiedTime(filePath);

	return {
		status: 'draft',
		lastModified,
	};
}

/**
 * Mark a phase as approved.
 */
export function approvePhase(phase: SpecPhaseState, approvedBy: string): SpecPhaseState {
	return {
		...phase,
		status: 'approved',
		approvedAt: Date.now(),
		approvedBy,
	};
}

/**
 * Mark a phase as out of sync.
 */
export function markOutOfSync(phase: SpecPhaseState): SpecPhaseState {
	return {
		...phase,
		status: 'out_of_sync',
	};
}

/**
 * Normalise a file path for comparison (remove leading slashes, ./ prefixes).
 */
function normaliseFilePath(filePath: string): string {
	return filePath
		.replace(/^\.\//, '')
		.replace(/^\//, '')
		.replace(/\\/g, '/');
}
