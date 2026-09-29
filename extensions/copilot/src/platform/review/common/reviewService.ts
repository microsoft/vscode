/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { TextDocumentSnapshot } from '../../editing/common/textDocumentSnapshot';

export const IReviewService = createServiceIdentifier<IReviewService>('IReviewService');

export interface ReviewDiagnosticCollection {
	get(uri: vscode.Uri): readonly vscode.Diagnostic[] | undefined;
	set(uri: vscode.Uri, diagnostics: readonly vscode.Diagnostic[] | undefined): void;
}

export interface ReviewRanges {
	uri: vscode.Uri;
	ranges: vscode.Range[];
}

export interface ReviewRequest {
	source: 'vscodeCopilotChat' | 'githubReviewAgent';
	promptCount: number;
	messageId: string;
	inputType: 'selection' | 'change';
	inputRanges: ReviewRanges[];
}

export interface ReviewSuggestionChange {
	range: vscode.Range;
	newText: string;
	oldText: string;
}

export interface ReviewSuggestion {
	markdown: string;
	edits: ReviewSuggestionChange[];
}

export interface ReviewComment {
	request: ReviewRequest;
	document: TextDocumentSnapshot;
	uri: vscode.Uri;
	languageId: string;
	range: vscode.Range;
	body: string | vscode.MarkdownString;
	kind: string;
	severity: string;
	originalIndex: number;
	actionCount: number;
	skipSuggestion?: boolean;
	suggestion?: ReviewSuggestion | Promise<ReviewSuggestion>;
}

export interface IReviewService {
	readonly _serviceBrand: undefined;
	updateContextValues(): void;
	isCodeFeedbackEnabled(): boolean;
	isReviewDiffEnabled(): boolean;
	isIntentEnabled(): boolean;
	getDiagnosticCollection(): ReviewDiagnosticCollection;
	getReviewComments(): ReviewComment[];
	addReviewComments(comments: ReviewComment[]): void;
	collapseReviewComment(comment: ReviewComment): void;
	removeReviewComments(comments: ReviewComment[]): void;
	updateReviewComment(comment: ReviewComment): void;
	findReviewComment(threadOrComment: vscode.CommentThread | vscode.Comment): ReviewComment | undefined;
	findCommentThread(comment: ReviewComment): vscode.CommentThread | undefined;
}
