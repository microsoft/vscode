/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { derivedWithStore, observableValue, recomputeInitiallyAndOnChange } from 'vs/base/common/observable';
import { readHotReloadableExport } from 'vs/editor/browser/widget/diffEditor/utils';
import { IMultiDocumentDiffEditorModel } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { MultiDiffEditorWidgetImpl } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidgetImpl';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import './colors';

export class MultiDiffEditorWidget extends Disposable {
	private readonly _dimension = observableValue<Dimension | undefined>(this, undefined);
	private readonly _model = observableValue<IMultiDocumentDiffEditorModel | undefined>(this, undefined);

	private readonly widgetImpl = derivedWithStore(this, (reader, store) => {
		return store.add(this._instantiationService.createInstance((
			readHotReloadableExport(MultiDiffEditorWidgetImpl, reader)),
			this._element,
			this._dimension,
			this._model,
		));
	});

	constructor(
		private readonly _element: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(recomputeInitiallyAndOnChange(this.widgetImpl));
	}

	public setModel(model: IMultiDocumentDiffEditorModel): void {
		this._model.set(model, undefined);
	}

	public layout(dimension: Dimension): void {
		this._dimension.set(dimension, undefined);
	}
}
