/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../base/common/jsonSchema.js';
import { localize } from '../../../nls.js';
import { WorkflowCheckpoint, WorkflowCheckpointType, WorkflowDefinition, WorkflowSource } from './workflow.js';

const source: WorkflowSource = { kind: 'builtin', id: 'vscode.workflow', label: localize('workflows.builtin', "Built-in") };
const uriSchema: IJSONSchema = { type: 'string', format: 'uri', minLength: 1, maxLength: 2_048 };
const commitSchema: IJSONSchema = { type: 'string', minLength: 40, maxLength: 64 };
const repositoryInputSchema: IJSONSchema = {
	type: 'object',
	properties: { repository: uriSchema },
	required: ['repository'],
	additionalProperties: false,
};
const pullRequestInputSchema: IJSONSchema = {
	type: 'object',
	properties: { repository: uriSchema, pullRequest: uriSchema },
	required: ['repository', 'pullRequest'],
	additionalProperties: false,
};
const resourceProofSchema: IJSONSchema = {
	type: 'object',
	properties: { uri: uriSchema },
	required: ['uri'],
	additionalProperties: false,
};
const pullRequestOutputSchema: IJSONSchema = {
	type: 'object',
	properties: { repository: uriSchema, pullRequest: uriSchema, headSha: commitSchema },
	required: ['repository', 'pullRequest', 'headSha'],
	additionalProperties: false,
};
const pullRequestCheckInputs = {
	repository: { input: 'repository' },
	pullRequest: { input: 'pullRequest' },
} as const;
const referencesSchema: IJSONSchema = {
	type: 'array',
	items: { type: 'string', minLength: 1, maxLength: 1_024 },
	minItems: 1,
	maxItems: 16,
};

export const builtinWorkflowCheckpointTypes: readonly WorkflowCheckpointType[] = [
	{
		id: 'vscode.workflow/plan',
		version: 1,
		label: localize('workflows.plan', "Plan"),
		description: localize('workflows.plan.description', "A saved plan in an allowed workspace or session resource."),
		instructions: localize('workflows.plan.instructions', "Create or update a plan for the assigned task using the available file tools. Save it inside the owning workspace or an explicitly allowed session resource. Submit its absolute resource URI as proof. The check establishes that the saved file exists; it does not assess the plan's quality."),
		proofSchema: resourceProofSchema,
		outputSchema: resourceProofSchema,
		completion: { kind: 'checked', check: { check: 'vscode.workspace/file-exists@1' } },
		source,
	},
	{
		id: 'vscode.workflow/implementation',
		version: 1,
		label: localize('workflows.implementation', "Implementation"),
		description: localize('workflows.implementation.description', "Reported implementation summary, changes, and validation references."),
		instructions: localize('workflows.implementation.instructions', "Implement the assigned task using the bound plan when provided, and validate the changes with appropriate existing tests. Report a concise summary, change references, and test or validation references. If a test cannot run, include its command and the reason in the test references. This completion is agent-reported, not an independent verification of implementation quality."),
		inputSchema: {
			type: 'object',
			properties: { plan: uriSchema },
			additionalProperties: false,
		},
		proofSchema: {
			type: 'object',
			properties: {
				summary: { type: 'string', minLength: 1, maxLength: 8_192 },
				changes: referencesSchema,
				tests: referencesSchema,
			},
			required: ['summary', 'changes', 'tests'],
			additionalProperties: false,
		},
		completion: { kind: 'reported' },
		source,
	},
	{
		id: 'vscode.workflow/draft-pr',
		version: 1,
		label: localize('workflows.draftPr', "Draft PR"),
		description: localize('workflows.draftPr.description', "The submitted pull request exists and is an open draft."),
		instructions: localize('workflows.draftPr.instructions', "Create or reuse the draft pull request for this task in the bound repository, using the available approved GitHub tools. Submit its canonical pull request URI. Do not create a duplicate pull request. Subsequent checkpoints are bound to this checked pull request."),
		inputSchema: repositoryInputSchema,
		proofSchema: resourceProofSchema,
		outputSchema: pullRequestOutputSchema,
		completion: {
			kind: 'checked',
			check: { check: 'vscode.github/pull-request-draft@1', inputs: { repository: { input: 'repository' } } },
		},
		source,
	},
	{
		id: 'vscode.workflow/draft-pr-ready',
		version: 1,
		label: localize('workflows.draftPrReady', "Draft PR ready"),
		description: localize('workflows.draftPrReady.description', "Current-head required checks pass, review threads are resolved, and there are no merge conflicts."),
		instructions: localize('workflows.draftPrReady.instructions', "Prepare the bound draft pull request for review. Address required CI failures, unresolved review threads, and merge conflicts using the available approved tools. Keep it a draft and submit the same pull request URI. Pending or incomplete GitHub facts cause a wait, not a successful completion."),
		inputSchema: pullRequestInputSchema,
		proofSchema: resourceProofSchema,
		outputSchema: pullRequestOutputSchema,
		completion: {
			kind: 'checked',
			check: { check: 'vscode.github/pull-request-ready@1', inputs: pullRequestCheckInputs },
		},
		source,
	},
	{
		id: 'vscode.workflow/pr-open',
		version: 1,
		label: localize('workflows.prOpen', "PR open"),
		description: localize('workflows.prOpen.description', "The same pull request is open and no longer a draft."),
		instructions: localize('workflows.prOpen.instructions', "Mark the bound pull request ready for review using the available approved GitHub tools. Submit that pull request's URI. Do not replace it with a different pull request."),
		inputSchema: pullRequestInputSchema,
		proofSchema: resourceProofSchema,
		outputSchema: pullRequestOutputSchema,
		completion: {
			kind: 'checked',
			check: { check: 'vscode.github/pull-request-open@1', inputs: pullRequestCheckInputs },
		},
		source,
	},
	{
		id: 'vscode.workflow/pr-merged',
		version: 1,
		label: localize('workflows.prMerged', "PR merged"),
		description: localize('workflows.prMerged.description', "GitHub confirms the merge and identifies its integrated commit."),
		instructions: localize('workflows.prMerged.instructions', "Complete the merge of the bound pull request using the available approved tools and existing repository rules, or report a blocker if that is not possible. Submit the same pull request URI. The check obtains the integrated commit from GitHub after the merge, including squash and rebase merges; do not supply or guess a replacement SHA."),
		inputSchema: pullRequestInputSchema,
		proofSchema: resourceProofSchema,
		outputSchema: {
			type: 'object',
			properties: { repository: uriSchema, pullRequest: uriSchema, headSha: commitSchema, integratedCommit: commitSchema },
			required: ['repository', 'pullRequest', 'headSha', 'integratedCommit'],
			additionalProperties: false,
		},
		completion: {
			kind: 'checked',
			check: { check: 'vscode.github/pull-request-merged@1', inputs: pullRequestCheckInputs },
		},
		source,
	},
	{
		id: 'vscode.workflow/pr-merged',
		version: 2,
		label: localize('workflows.prMerged', "PR merged"),
		description: localize('workflows.prMergedWithTime.description', "GitHub confirms the merge, its integrated commit, and its actual merge time."),
		instructions: localize('workflows.prMergedWithTime.instructions', "Complete the merge of the bound pull request using the available approved tools and existing repository rules, or report a blocker if that is not possible. Submit the same pull request URI. The check obtains the integrated commit and actual merge timestamp from GitHub, including squash and rebase merges; do not supply or guess a replacement SHA or date."),
		inputSchema: pullRequestInputSchema,
		proofSchema: resourceProofSchema,
		outputSchema: {
			type: 'object',
			properties: {
				repository: uriSchema, pullRequest: uriSchema, headSha: commitSchema, integratedCommit: commitSchema,
				mergedAt: { type: 'string', minLength: 20, maxLength: 35 },
			},
			required: ['repository', 'pullRequest', 'headSha', 'integratedCommit', 'mergedAt'],
			additionalProperties: false,
		},
		completion: {
			kind: 'checked',
			check: { check: 'vscode.github/pull-request-merged@2', inputs: pullRequestCheckInputs },
		},
		source,
	},
];

function pullRequestInputs(checkpoint: string): NonNullable<WorkflowCheckpoint['inputs']> {
	return {
		repository: { checkpoint, outputPointer: '/repository' },
		pullRequest: { checkpoint, outputPointer: '/pullRequest' },
	};
}

const featureCheckpoints: readonly WorkflowCheckpoint[] = [
	{ id: 'plan', type: 'vscode.workflow/plan@1' },
	{ id: 'implementation', type: 'vscode.workflow/implementation@1', inputs: { plan: { checkpoint: 'plan', outputPointer: '/uri' } } },
	{ id: 'draft-pr', type: 'vscode.workflow/draft-pr@1', inputs: { repository: { input: 'repository' } } },
	{ id: 'draft-pr-ready', type: 'vscode.workflow/draft-pr-ready@1', inputs: pullRequestInputs('draft-pr') },
	{ id: 'pr-open', type: 'vscode.workflow/pr-open@1', inputs: pullRequestInputs('draft-pr-ready') },
	{ id: 'pr-merged', type: 'vscode.workflow/pr-merged@2', inputs: pullRequestInputs('pr-open') },
];

export const builtinWorkflowDefinitions: readonly WorkflowDefinition[] = [
	{
		id: 'vscode.workflow/feature',
		version: 1,
		label: localize('workflows.feature', "Feature"),
		description: localize('workflows.feature.description', "Plan, implement, and merge a feature through a checked pull request."),
		inputSchema: repositoryInputSchema,
		checkpoints: featureCheckpoints,
		source,
	},
	{
		id: 'vscode.workflow/bug-fix',
		version: 1,
		label: localize('workflows.bugFix', "Bug Fix"),
		description: localize('workflows.bugFix.description', "Reproduce and repair a bug through a checked, merged pull request."),
		inputSchema: repositoryInputSchema,
		checkpoints: featureCheckpoints.map(checkpoint => checkpoint.id === 'implementation' ? {
			...checkpoint,
			instructions: localize('workflows.bugFix.implementation', "Use the bound plan to reproduce the reported bug, implement a focused fix, and add or update regression coverage. Report the behavior change, change references, and test or validation references. Explain any validation that could not run. Avoid unrelated changes; this completion is agent-reported."),
		} : checkpoint),
		source,
	},
];
