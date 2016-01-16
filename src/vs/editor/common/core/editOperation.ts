/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import {Range} from 'vs/editor/common/core/range';

export class EditOperation {

	public static insert(position:EditorCommon.IEditorPosition, text:string): EditorCommon.IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			text: text,
			forceMoveMarkers: true
		};
	}

	public static delete(range:EditorCommon.IEditorRange): EditorCommon.IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: range,
			text: null,
			forceMoveMarkers: true
		};
	}

	public static replace(range:EditorCommon.IEditorRange, text:string): EditorCommon.IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: range,
			text: text,
			forceMoveMarkers: false
		};
	}

	public static replaceMove(range:EditorCommon.IEditorRange, text:string): EditorCommon.IIdentifiedSingleEditOperation {
		return {
			identifier: null,
			range: range,
			text: text,
			forceMoveMarkers: true
		};
	}
}