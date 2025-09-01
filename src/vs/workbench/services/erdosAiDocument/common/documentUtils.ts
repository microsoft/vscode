/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/



export interface DocumentInfo {
	id: string;
	path: string;
	content: string;
	isActive: boolean;
	isSaved: boolean;
	metadata: {
		timestamp: string;
		lineCount: number;
		language: string;
		encoding?: string;
		dirty?: boolean;
		created?: number;
		lastContentUpdate?: number;
		lastKnownWriteTime?: number;
	};
}

export interface MatchOptions {
	caseSensitive?: boolean;
	wholeWord?: boolean;
	regex?: boolean;
}

export interface MatchResult {
	documentId: string;
	documentPath: string;
	line: number;
	column: number;
	matchText: string;
	contextBefore: string;
	contextAfter: string;
}


