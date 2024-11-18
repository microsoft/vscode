/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/84899

	export enum TextEditorDiffKind {
		Addition = 1,
		Deletion = 2,
		Modification = 3
	}

	export interface TextEditorDiff {
		readonly originalStartLineNumber: number;
		readonly originalEndLineNumber: number;
		readonly modifiedStartLineNumber: number;
		readonly modifiedEndLineNumber: number;
		readonly kind: TextEditorDiffKind;
	}

	export interface TextEditorDiffInformation {
		readonly documentVersion: number;
		readonly original: Uri | undefined;
		readonly modified: Uri;
		readonly diff: readonly TextEditorDiff[];
		readonly isStale: boolean;
	}

	export interface TextEditorDiffInformationChangeEvent {
		readonly textEditor: TextEditor;
		readonly diffInformation: TextEditorDiffInformation | undefined;
	}

	export interface TextEditor {
		readonly diffInformation: TextEditorDiffInformation | undefined;
	}

	export namespace window {
		export const onDidChangeTextEditorDiffInformation: Event<TextEditorDiffInformationChangeEvent>;
	}

}
