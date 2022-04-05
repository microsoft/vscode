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

	/** @deprecated */
	export interface NotebookConcatTextDocument {
		/** @deprecated */
		readonly uri: Uri;
		/** @deprecated */
		readonly isClosed: boolean;
		/** @deprecated */
		dispose(): void;
		/** @deprecated */
		readonly onDidChange: Event<void>;
		/** @deprecated */
		readonly version: number;
		/** @deprecated */
		getText(): string;
		/** @deprecated */
		getText(range: Range): string;

		offsetAt(position: Position): number;
		/** @deprecated */
		positionAt(offset: number): Position;
		/** @deprecated */
		validateRange(range: Range): Range;
		/** @deprecated */
		validatePosition(position: Position): Position;

		/** @deprecated */
		locationAt(positionOrRange: Position | Range): Location;
		/** @deprecated */
		positionAt(location: Location): Position;
		/** @deprecated */
		contains(uri: Uri): boolean;
	}
}
