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
import { IModel } from 'vs/editor/common/editorCommon';

export function withEditorModel(text: string[], callback: (model: Model) => void): void {
	var model = Model.createFromString(text.join('\n'));
	callback(model);
	model.dispose();
}

export function viewModelHelper(model: IModel): IViewModelHelper {
	return {
		viewModel: model,

		coordinatesConverter: {
			convertViewPositionToModelPosition: (viewPosition: Position): Position => {
				return viewPosition;
			},
			convertViewRangeToModelRange: (viewRange: Range): Range => {
				return viewRange;
			},
			convertViewSelectionToModelSelection: (viewSelection: Selection): Selection => {
				return viewSelection;
			},
			validateViewPosition: (viewPosition: Position, expectedModelPosition: Position): Position => {
				return expectedModelPosition;
			},
			validateViewRange: (viewRange: Range, modelRange: Range): Range => {
				return modelRange;
			},
			convertModelPositionToViewPosition: (modelPosition: Position): Position => {
				return modelPosition;
			},
			convertModelRangeToViewRange: (modelRange: Range): Range => {
				return modelRange;
			},
			convertModelSelectionToViewSelection: (modelSelection: Selection): Selection => {
				return modelSelection;
			},
			modelPositionIsVisible: (modelPosition: Position): boolean => {
				return true;
			},
		},

		getCompletelyVisibleViewRange: () => null,
	};
}
