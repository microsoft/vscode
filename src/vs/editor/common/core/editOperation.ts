/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Range } from 'vs/editor/common/core/range';
import { IIdentifiedSingleEditOperation, IRange, IPosition } from 'vs/editor/common/editorCommon';

export class EditOperation {

	public static insert(position: IPosition, text: string): IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			text: text,
			forceMoveMarkers: true
		};
	}

	public static delete(range: IRange): IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: Range.lift(range),
			text: null,
			forceMoveMarkers: true
		};
	}

	public static replace(range: IRange, text: string): IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: Range.lift(range),
			text: text,
			forceMoveMarkers: false
		};
	}

	public static replaceMove(range: IRange, text: string): IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: Range.lift(range),
			text: text,
			forceMoveMarkers: true
		};
	}
}