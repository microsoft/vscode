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

	export interface TextEditorLineRange {
		readonly startLineNumber: number;
		readonly endLineNumberExclusive: number;
	}

	export interface TextEditorChange {
		readonly original: TextEditorLineRange;
		readonly modified: TextEditorLineRange;
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

	/**
	 * A live, disposable view of the source control diff information of a resource
	 * that is not necessarily shown in a {@link TextEditor} (for example a document
	 * rendered by a custom editor).
	 */
	export interface SourceControlDiffInformationProvider extends Disposable {
		/**
		 * The current diff information for the resource, reflecting the primary
		 * source control provider (e.g. git), or `undefined` while it is unavailable
		 * (for example before the first diff has been computed or when the resource
		 * is not under source control).
		 */
		readonly diffInformation: TextEditorDiffInformation | undefined;

		/**
		 * An event that fires whenever {@link diffInformation} changes.
		 */
		readonly onDidChange: Event<void>;
	}

	export namespace window {
		export const onDidChangeTextEditorDiffInformation: Event<TextEditorDiffInformationChangeEvent>;

		/**
		 * Observe the source control diff information for a resource.
		 *
		 * Unlike {@link TextEditor.diffInformation}, this does not require the
		 * resource to be shown in a {@link TextEditor}; the resource only needs to be
		 * backed by an open {@link TextDocument}. This is useful for custom editors,
		 * which render their document in a webview rather than a text editor.
		 *
		 * The returned provider must be disposed once it is no longer needed.
		 *
		 * @param uri The resource to observe.
		 * @returns A live, disposable view of the resource's diff information.
		 */
		export function createSourceControlDiffInformation(uri: Uri): SourceControlDiffInformationProvider;
	}

}
