/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
type CompletionType = 'partial' | 'full';

export type SuggestionStatus = {
	compType: CompletionType;
	acceptedLength: number;
	acceptedLines: number; // Number of lines accepted in the current completion, used for partial acceptance
};


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
