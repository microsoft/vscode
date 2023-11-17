/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { derivedWithStore, observableValue, recomputeInitiallyAndOnChange } from 'vs/base/common/observable';
import { readHotReloadableExport } from 'vs/editor/browser/widget/diffEditor/utils';
import { IMultiDiffEditorModel } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { MultiDiffEditorViewModel, MultiDiffEditorWidgetImpl } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidgetImpl';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import './colors';
import { DiffEditorItemTemplate } from 'vs/editor/browser/widget/multiDiffEditorWidget/diffEditorItemTemplate';
import { IWorkbenchUIElementFactory } from 'vs/editor/browser/widget/multiDiffEditorWidget/workbenchUIElementFactory';

export class MultiDiffEditorWidget extends Disposable {
	private readonly _dimension = observableValue<Dimension | undefined>(this, undefined);
	private readonly _viewModel = observableValue<MultiDiffEditorViewModel | undefined>(this, undefined);

	private readonly _widgetImpl = derivedWithStore(this, (reader, store) => {
		readHotReloadableExport(DiffEditorItemTemplate, reader);
		return store.add(this._instantiationService.createInstance((
			readHotReloadableExport(MultiDiffEditorWidgetImpl, reader)),
			this._element,
			this._dimension,
			this._viewModel,
			this._workbenchUIElementFactory,
		));
	});

	constructor(
		private readonly _element: HTMLElement,
		private readonly _workbenchUIElementFactory: IWorkbenchUIElementFactory,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(recomputeInitiallyAndOnChange(this._widgetImpl));
	}

	public createViewModel(model: IMultiDiffEditorModel): MultiDiffEditorViewModel {
		return this._widgetImpl.get().createViewModel(model);
	}

	public setViewModel(viewModel: MultiDiffEditorViewModel | undefined): void {
		this._viewModel.set(viewModel, undefined);
	}

	public layout(dimension: Dimension): void {
		this._dimension.set(dimension, undefined);
	}
}
