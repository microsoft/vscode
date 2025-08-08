/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	/**
	 * Represents the source of a line edit in a text document.
	 */
	export enum LineEditSource {
		/**
		 * The line edit source is undetermined.
		 */
		Undetermined = 0,

		/**
		 * The line edit was made by the user.
		 */
		User = 1,

		/**
		 * The line edit was made by AI/Copilot.
		 */
		AI = 2
	}

	/**
	 * An event describing changes to line edit sources in an editor.
	 */
	export interface LineEditSourcesChangeEvent {
		/**
		 * The editor in which the changes occurred.
		 */
		readonly editor: TextEditor;

		/**
		 * The changes that occurred, mapping line numbers to their edit sources.
		 */
		readonly changes: { [lineNumber: number]: LineEditSource };
	}

	/**
	 * Tracks the source of edits for lines in text documents.
	 */
	export interface LineEditTracker {
		/**
		 * An event that is emitted when line edit sources change.
		 */
		readonly onDidChangeLineEditSources: Event<LineEditSourcesChangeEvent>;

		/**
		 * Get the edit source for a specific line in a document.
		 *
		 * @param document The text document.
		 * @param lineNumber The line number (0-based).
		 * @returns The edit source for the line.
		 */
		getLineEditSource(document: TextDocument, lineNumber: number): Thenable<LineEditSource>;

		/**
		 * Get all line edit sources for a document.
		 *
		 * @param document The text document.
		 * @returns A mapping of line numbers to their edit sources.
		 */
		getAllLineEditSources(document: TextDocument): Thenable<{ [lineNumber: number]: LineEditSource }>;
	}

	export namespace window {
		/**
		 * The line edit tracker that tracks the source of edits for lines in text documents.
		 */
		export const lineEditTracker: LineEditTracker;
	}

}
