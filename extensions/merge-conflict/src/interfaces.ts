/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

export interface IMergeRegion {
	name: string;
	header: vscode.Range;
	content: vscode.Range;
	decoratorContent: vscode.Range;
}

export enum CommitType {
	Current,
	Incoming,
	Both
}

export interface IExtensionConfiguration {
	enableCodeLens: boolean;
	enableDecorations: boolean;
	enableEditorOverview: boolean;
}

export interface IDocumentMergeConflict extends IDocumentMergeConflictDescriptor {
	commitEdit(type: CommitType, editor: vscode.TextEditor, edit?: vscode.TextEditorEdit);
	applyEdit(type: CommitType, editor: vscode.TextEditor, edit: vscode.TextEditorEdit);
}

export interface IDocumentMergeConflictDescriptor {
	range: vscode.Range;
	current: IMergeRegion;
	incoming: IMergeRegion;
	commonAncestors: IMergeRegion[];
	splitter: vscode.Range;
}

export interface IDocumentMergeConflictTracker {
	getConflicts(document: vscode.TextDocument): PromiseLike<IDocumentMergeConflict[]>;
	isPending(document: vscode.TextDocument): boolean;
	forget(document: vscode.TextDocument);
}

export interface IDocumentMergeConflictTrackerService {
	createTracker(origin: string): IDocumentMergeConflictTracker;
	forget(document: vscode.TextDocument);
}
