/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

//
// Copied from src/vs/workbench/services/languageRuntime/common/erdosUiComm.ts; do not edit.
//

/**
 * Editor metadata
 */
export interface EditorContext {
	/**
	 * Document metadata
	 */
	document: TextDocument;

	/**
	 * Document contents
	 */
	contents: Array<string>;

	/**
	 * The primary selection, i.e. selections[0]
	 */
	selection: Selection;

	/**
	 * The selections in this text editor.
	 */
	selections: Array<Selection>;

}

/**
 * Document metadata
 */
export interface TextDocument {
	/**
	 * URI of the resource viewed in the editor
	 */
	path: string;

	/**
	 * End of line sequence
	 */
	eol: string;

	/**
	 * Whether the document has been closed
	 */
	is_closed: boolean;

	/**
	 * Whether the document has been modified
	 */
	is_dirty: boolean;

	/**
	 * Whether the document is untitled
	 */
	is_untitled: boolean;

	/**
	 * Language identifier
	 */
	language_id: string;

	/**
	 * Number of lines in the document
	 */
	line_count: number;

	/**
	 * Version number of the document
	 */
	version: number;

}

/**
 * A line and character position, such as the position of the cursor.
 */
export interface Position {
	/**
	 * The zero-based character value, as a Unicode code point offset.
	 */
	character: number;

	/**
	 * The zero-based line value.
	 */
	line: number;

}

/**
 * Selection metadata
 */
export interface Selection {
	/**
	 * Position of the cursor.
	 */
	active: Position;

	/**
	 * Start position of the selection
	 */
	start: Position;

	/**
	 * End position of the selection
	 */
	end: Position;

	/**
	 * Text of the selection
	 */
	text: string;

}



