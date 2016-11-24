/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Model } from 'vs/editor/common/model/model';
import { IViewModelHelper } from 'vs/editor/common/controller/oneCursor';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';

export function withEditorModel(text: string[], callback: (model: Model) => void): void {
	var model = Model.createFromString(text.join('\n'));
	callback(model);
	model.dispose();
}

export function viewModelHelper(model): IViewModelHelper {
	return {
		viewModel: model,
		getCurrentCompletelyVisibleViewLinesRangeInViewport: () => { return null; },
		getCurrentCompletelyVisibleModelLinesRangeInViewport: () => { return null; },
		convertModelPositionToViewPosition: (lineNumber: number, column: number) => {
			return new Position(lineNumber, column);
		},
		convertModelRangeToViewRange: (modelRange: Range) => {
			return modelRange;
		},
		convertViewToModelPosition: (lineNumber: number, column: number) => {
			return new Position(lineNumber, column);
		},
		convertViewSelectionToModelSelection: (viewSelection: Selection) => {
			return viewSelection;
		},
		validateViewPosition: (viewPosition: Position, modelPosition: Position): Position => {
			return modelPosition;
		},
		validateViewRange: (viewRange: Range, modelRange: Range): Range => {
			return modelRange;
		}
	};
}
