/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel, TrackedRangeStickiness } from '../../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { Range } from '../../../../../editor/common/core/range.js';

/**
 * Can add a range highlight decoration to a model.
 * It will automatically remove it when the model has its decorations changed.
 */

export class RangeHighlightDecorations implements IDisposable {

	private _decorationId: string | null = null;
	private _model: ITextModel | null = null;
	private readonly _modelDisposables = new DisposableStore();

	constructor(
		@IModelService private readonly _modelService: IModelService
	) {
	}

	removeHighlightRange() {
		if (this._model && this._decorationId) {
			const decorationId = this._decorationId;
			this._model.changeDecorations((accessor) => {
				accessor.removeDecoration(decorationId);
			});
		}
		this._decorationId = null;
	}

	highlightRange(resource: URI | ITextModel, range: Range, ownerId: number = 0): void {
		let model: ITextModel | null;
		if (URI.isUri(resource)) {
			model = this._modelService.getModel(resource);
		} else {
			model = resource;
		}

		if (model) {
			this.doHighlightRange(model, range);
		}
	}

	private doHighlightRange(model: ITextModel, range: Range) {
		this.removeHighlightRange();
		model.changeDecorations((accessor) => {
			this._decorationId = accessor.addDecoration(range, RangeHighlightDecorations._RANGE_HIGHLIGHT_DECORATION);
		});
		this.setModel(model);
	}

	private setModel(model: ITextModel) {
		if (this._model !== model) {
			this.clearModelListeners();
			this._model = model;
			this._modelDisposables.add(this._model.onDidChangeDecorations((e) => {
				this.clearModelListeners();
				this.removeHighlightRange();
				this._model = null;
			}));
			this._modelDisposables.add(this._model.onWillDispose(() => {
				this.clearModelListeners();
				this.removeHighlightRange();
				this._model = null;
			}));
		}
	}

	private clearModelListeners() {
		this._modelDisposables.clear();
	}

	dispose() {
		if (this._model) {
			this.removeHighlightRange();
			this._model = null;
		}
		this._modelDisposables.dispose();
	}

	private static readonly _RANGE_HIGHLIGHT_DECORATION = ModelDecorationOptions.register({
		description: 'search-range-highlight',
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		className: 'rangeHighlight',
		isWholeLine: true
	});
}
