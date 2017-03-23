/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { IIdentifiedSingleEditOperation } from 'vs/editor/common/editorCommon';

export class EditOperation {

	public static insert(position: Position, text: string): IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			text: text,
			forceMoveMarkers: true
		};
	}

	public static delete(range: Range): IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: range,
			text: null,
			forceMoveMarkers: true
		};
	}

	public static replace(range: Range, text: string): IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: range,
			text: text,
			forceMoveMarkers: false
		};
	}

	public static replaceMove(range: Range, text: string): IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: range,
			text: text,
			forceMoveMarkers: true
		};
	}
}