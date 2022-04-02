/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/106744

	export namespace notebooks {
		/**
		 * @deprecated
		 */
		// todo@API really needed? we didn't find a user here
		export function createConcatTextDocument(notebook: NotebookDocument, selector?: DocumentSelector): NotebookConcatTextDocument;
	}

	export interface NotebookConcatTextDocument {
		readonly uri: Uri;
		readonly isClosed: boolean;
		dispose(): void;
		readonly onDidChange: Event<void>;
		readonly version: number;
		getText(): string;
		getText(range: Range): string;

		offsetAt(position: Position): number;
		positionAt(offset: number): Position;
		validateRange(range: Range): Range;
		validatePosition(position: Position): Position;

		locationAt(positionOrRange: Position | Range): Location;
		positionAt(location: Location): Position;
		contains(uri: Uri): boolean;
	}
}
