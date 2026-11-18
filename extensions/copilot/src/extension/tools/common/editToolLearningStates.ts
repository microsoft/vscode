/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ToolName } from './toolNames';

export type EditTools = ToolName.ApplyPatch | ToolName.ReplaceString | ToolName.EditFile | ToolName.MultiReplaceString;


export interface IEditToolLearningData {
	state: State;
	tools: { [K in EditTools]?: ToolLearningData };
}

export const enum LearningConfig {
	/** Rolling window size for tracking recent edit successes/failures per tool */
	WINDOW_SIZE = 100,
	/** Maximum number of models to keep in memory cache before LRU eviction */
	CACHE_SIZE = 50,
	/** Minimum attempts before making state transition decisions */
	MIN_SAMPLE_SIZE = LearningConfig.WINDOW_SIZE * (2 / 3),
	/** Success rate threshold for considering replace_string to be a usable tool */
	SR_SUCCESS_THRESHOLD = 0.8,
	/** Failure rate threshold to disable replace_string */
	SR_FAILURE_THRESHOLD = 0.3,
	/** Success rate threshold for considering multi_replace_string to be a usable tool */
	MULTISR_SUCCESS_THRESHOLD = 0.7,
	/** Failure rate threshold to disable multi_replace_string */
	MULTISR_FAILURE_THRESHOLD = 0.4,
}

export const enum State {
	Initial,
	ReplaceStringForced,
	ReplaceStringMaybeMulti,
	EditFileOnly,
	ReplaceStringOnly,
	ReplaceStringWithMulti,
}


interface StateConfig {
	allowedTools: EditTools[];
	transitions?: { [K in State]?: (data: IEditToolLearningData) => boolean };
}


interface ToolLearningData {
	successBitset: bigint;
	attempts: number;
}

// Top-level helper functions
function getSuccessRate(successBitset: bigint, totalAttempts: number): number {
	if (totalAttempts === 0) {
		return 0;
	}

	const actualBits = Math.min(totalAttempts, LearningConfig.WINDOW_SIZE);
	let successCount = 0;

	for (let i = 0; i < actualBits; i++) {
		if ((successBitset >> BigInt(i)) & 1n) {
			successCount++;
		}
	}

	return successCount / actualBits;
}


function sampleSize(data: IEditToolLearningData, tool: EditTools): number {
	return Math.min(data.tools[tool]?.attempts || 0, LearningConfig.WINDOW_SIZE);
}

function successRate(data: IEditToolLearningData, tool: EditTools): number {
	const toolData = data.tools[tool];
	if (!toolData) { return 0; }
	return getSuccessRate(toolData.successBitset, toolData.attempts);
}

export const EDIT_TOOL_LEARNING_STATES: Record<State, StateConfig> = {
	[State.Initial]: {
		allowedTools: [ToolName.EditFile, ToolName.ReplaceString],
		transitions: {
			[State.ReplaceStringMaybeMulti]: d =>
				sampleSize(d, ToolName.ReplaceString) > LearningConfig.MIN_SAMPLE_SIZE &&
				successRate(d, ToolName.ReplaceString) > LearningConfig.SR_SUCCESS_THRESHOLD,
			[State.EditFileOnly]: d =>
				sampleSize(d, ToolName.ReplaceString) > LearningConfig.MIN_SAMPLE_SIZE &&
				successRate(d, ToolName.ReplaceString) < LearningConfig.SR_FAILURE_THRESHOLD,
			[State.ReplaceStringForced]: d => {
				// Models are instructed to prefer replace_string to insert_edit. If
				// this model is not doing that (more than 70% of edits are insert_edit),
				// force it to so we can get more data.
				const editFileAttempts = sampleSize(d, ToolName.EditFile);
				const replaceStringAttempts = sampleSize(d, ToolName.ReplaceString);
				return editFileAttempts > LearningConfig.MIN_SAMPLE_SIZE && editFileAttempts / (editFileAttempts + replaceStringAttempts) > 0.7;
			},
		},
	},
	[State.ReplaceStringForced]: {
		allowedTools: [ToolName.ReplaceString],
		transitions: {
			[State.ReplaceStringMaybeMulti]: d =>
				sampleSize(d, ToolName.ReplaceString) > LearningConfig.MIN_SAMPLE_SIZE &&
				successRate(d, ToolName.ReplaceString) > LearningConfig.SR_SUCCESS_THRESHOLD,
			[State.EditFileOnly]: d =>
				sampleSize(d, ToolName.ReplaceString) > LearningConfig.MIN_SAMPLE_SIZE &&
				successRate(d, ToolName.ReplaceString) < LearningConfig.SR_FAILURE_THRESHOLD,
		},
	},
	[State.ReplaceStringMaybeMulti]: {
		allowedTools: [ToolName.ReplaceString, ToolName.MultiReplaceString],
		transitions: {
			[State.ReplaceStringWithMulti]: d =>
				sampleSize(d, ToolName.MultiReplaceString) > LearningConfig.MIN_SAMPLE_SIZE &&
				successRate(d, ToolName.MultiReplaceString) > LearningConfig.MULTISR_SUCCESS_THRESHOLD,
			[State.ReplaceStringOnly]: d =>
				sampleSize(d, ToolName.MultiReplaceString) > LearningConfig.MIN_SAMPLE_SIZE &&
				successRate(d, ToolName.MultiReplaceString) < LearningConfig.MULTISR_FAILURE_THRESHOLD,
		},
	},

	// Terminal states have no transitions
	[State.EditFileOnly]: {
		allowedTools: [ToolName.EditFile],
	},
	[State.ReplaceStringOnly]: {
		allowedTools: [ToolName.ReplaceString],
	},
	[State.ReplaceStringWithMulti]: {
		allowedTools: [ToolName.ReplaceString, ToolName.MultiReplaceString],
	},
};
