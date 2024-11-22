/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	// https://github.com/microsoft/vscode/issues/84899

	export enum TextEditorChangeKind {
		Addition = 1,
		Deletion = 2,
		Modification = 3
	}

	export interface TextEditorChange {
		readonly original: {
			readonly startLineNumber: number;
			readonly endLineNumberExclusive: number;
		};
		readonly modified: {
			readonly startLineNumber: number;
			readonly endLineNumberExclusive: number;
		};
		readonly kind: TextEditorChangeKind;
	}

	export interface TextEditorDiffInformation {
		readonly documentVersion: number;
		readonly original: Uri | undefined;
		readonly modified: Uri;
		readonly changes: readonly TextEditorChange[];
		readonly isStale: boolean;
	}

	export interface TextEditorDiffInformationChangeEvent {
		readonly textEditor: TextEditor;
		readonly diffInformation: TextEditorDiffInformation[] | undefined;
	}

	export interface TextEditor {
		readonly diffInformation: TextEditorDiffInformation[] | undefined;
	}

	export namespace window {
		export const onDidChangeTextEditorDiffInformation: Event<TextEditorDiffInformationChangeEvent>;
	}

}
