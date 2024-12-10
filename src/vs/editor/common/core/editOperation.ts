/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from './position.js';
import { IRange, Range } from './range.js';

/**
 * A single edit operation, that acts as a simple replace.
 * i.e. Replace text at `range` with `text` in model.
 */
export interface ISingleEditOperation {
	/**
	 * The range to replace. This can be empty to emulate a simple insert.
	 */
	range: IRange;
	/**
	 * The text to replace with. This can be null to emulate a simple delete.
	 */
	text: string | null;
	/**
	 * This indicates that this operation has "insert" semantics.
	 * i.e. forceMoveMarkers = true => if `range` is collapsed, all markers at the position will be moved.
	 */
	forceMoveMarkers?: boolean;
}

export class EditOperation {

	public static insert(position: Position, text: string): ISingleEditOperation {
		return {
			range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			text: text,
			forceMoveMarkers: true
		};
	}

	public static delete(range: Range): ISingleEditOperation {
		return {
			range: range,
			text: null
		};
	}

	public static replace(range: Range, text: string | null): ISingleEditOperation {
		return {
			range: range,
			text: text
		};
	}

	public static replaceMove(range: Range, text: string | null): ISingleEditOperation {
		return {
			range: range,
			text: text,
			forceMoveMarkers: true
		};
	}
}
