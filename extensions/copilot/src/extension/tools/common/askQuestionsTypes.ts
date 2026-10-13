/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared types for the core `vscode_askQuestions` tool responses.
 * Used by any consumer that invokes the tool and needs to parse its result.
 */

export interface IQuestionAnswer {
	selected: string[];
	freeText: string | null;
	skipped: boolean;
}

export interface IAnswerResult {
	answers: Record<string, IQuestionAnswer>;
}
