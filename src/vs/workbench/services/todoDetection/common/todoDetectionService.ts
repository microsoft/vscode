/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { ITextModel } from '../../../../editor/common/model.js';

export const ITodoDetectionService = createDecorator<ITodoDetectionService>('todoDetectionService');

/**
 * Represents a detected TODO comment in the code
 */
export interface ITodoItem {
	/**
	 * The range of the TODO comment in the document
	 */
	range: IRange;
	/**
	 * The full text of the TODO comment
	 */
	text: string;
	/**
	 * The trigger keyword that was matched (e.g., "TODO", "FIXME")
	 */
	trigger: string;
	/**
	 * The line number (1-based) where the TODO was found
	 */
	lineNumber: number;
}

/**
 * Service for detecting TODO comments in code
 */
export interface ITodoDetectionService {
	readonly _serviceBrand: undefined;

	/**
	 * Detect TODO comments at a specific position in a text model
	 * @param model The text model to search
	 * @param lineNumber The line number to check (1-based)
	 * @returns The TODO item if found, undefined otherwise
	 */
	detectTodoAtLine(model: ITextModel, lineNumber: number): ITodoItem | undefined;

	/**
	 * Detect all TODO comments in a text model
	 * @param model The text model to search
	 * @returns Array of all TODO items found
	 */
	detectAllTodos(model: ITextModel): ITodoItem[];

	/**
	 * Check if a line contains a TODO comment
	 * @param model The text model
	 * @param lineNumber The line number to check (1-based)
	 * @returns True if the line contains a TODO comment
	 */
	hasTodoAtLine(model: ITextModel, lineNumber: number): boolean;
}
