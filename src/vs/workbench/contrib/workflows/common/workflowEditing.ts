/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { WorkflowCheckpoint, WorkflowCheckpointType, WorkflowDefinition } from '../../../../platform/workflow/common/workflow.js';
import { resolveWorkflowDefinition } from '../../../../platform/workflow/common/workflowValidation.js';

export function moveWorkflowCheckpoint(definition: WorkflowDefinition, id: string, to: number, types: readonly WorkflowCheckpointType[]): WorkflowDefinition {
	const from = definition.checkpoints.findIndex(checkpoint => checkpoint.id === id);
	if (from < 0 || to < 0 || to >= definition.checkpoints.length) {
		throw new Error(localize('workflow.invalidMove', "Choose a checkpoint position within this workflow."));
	}
	const checkpoints = [...definition.checkpoints];
	checkpoints.splice(to, 0, checkpoints.splice(from, 1)[0]);
	const result = { ...definition, checkpoints };
	resolveWorkflowDefinition(result, types);
	return result;
}

export function removeWorkflowCheckpoint(definition: WorkflowDefinition, id: string, types: readonly WorkflowCheckpointType[]): WorkflowDefinition {
	const result = { ...definition, checkpoints: definition.checkpoints.filter(checkpoint => checkpoint.id !== id) };
	resolveWorkflowDefinition(result, types);
	return result;
}

export function makeWorkflowLocalContract(definition: WorkflowDefinition, checkpoint: WorkflowCheckpoint, type: WorkflowCheckpointType): WorkflowCheckpoint {
	const id = `${definition.id}/${checkpoint.id}`;
	return {
		...checkpoint,
		type: `${id}@1`,
		localType: { ...structuredClone(type), id, version: 1, source: definition.source },
	};
}
