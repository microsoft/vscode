/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface NotebookPromptPriority {
	/**
	 * Core information for notebook, e.g., custom rules for Jupyter Notebook.
	 */
	core?: number;
	context?: number;
	/*
	 * The priority for runtime core states, e.g., variables.
	 */
	runtimeCore?: number;
	/**
	 * The priority for Conversation History.
	 */
	history?: number;
	/*
	 * The priority for the rest, should be dropped first.
	 */
	other?: number;
}

export const promptPriorities: NotebookPromptPriority = {
	core: 1000,
	context: 800,
	runtimeCore: 600,
	history: 500,
	other: 100
};