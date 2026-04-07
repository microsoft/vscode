/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Copy of https://github.com/microsoft/vscode/blob/969b5714b4fc54992801dceefc3269ce4e07f8f7/src/vscode-dts/vscode.proposed.inlineCompletionsAdditions.d.ts#L75
// to avoid dependencies to vscode from lib
export enum PartialAcceptTriggerKind {
	Unknown = 0,
	Word = 1,
	Line = 2,
	Suggest = 3,
}

type CompletionType = 'partial' | 'full';

export type SuggestionStatus = {
	compType: CompletionType;
	acceptedLength: number;
	acceptedLines: number; // Number of lines accepted in the current completion, used for partial acceptance
};

export function computeCompCharLen(suggestionStatus: SuggestionStatus, completionText: string): number {
	return suggestionStatus.compType === 'partial' ? suggestionStatus.acceptedLength : completionText.length;
}

export function countLines(text: string): number {
	if (text.length === 0) { return 0; }

	return text.split('\n').length;
}

export function computeCompletionText(completionText: string, suggestionStatus: SuggestionStatus): string {
	if (suggestionStatus.compType === 'partial') {
		return completionText.substring(0, suggestionStatus.acceptedLength);
	}
	return completionText;
}
