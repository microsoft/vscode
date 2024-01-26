/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { derived, derivedWithStore, observableValue, recomputeInitiallyAndOnChange } from 'vs/base/common/observable';
import { readHotReloadableExport } from 'vs/editor/browser/widget/diffEditor/utils';
import { IMultiDiffEditorModel } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { IMultiDiffEditorViewState, MultiDiffEditorWidgetImpl } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidgetImpl';
import { MultiDiffEditorViewModel } from './multiDiffEditorViewModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import './colors';
import { DiffEditorItemTemplate } from 'vs/editor/browser/widget/multiDiffEditorWidget/diffEditorItemTemplate';
import { IWorkbenchUIElementFactory } from 'vs/editor/browser/widget/multiDiffEditorWidget/workbenchUIElementFactory';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IDiffEditor } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

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
		return new MultiDiffEditorViewModel(model, this._instantiationService);
	}

	public setViewModel(viewModel: MultiDiffEditorViewModel | undefined): void {
		this._viewModel.set(viewModel, undefined);
	}

	public layout(dimension: Dimension): void {
		this._dimension.set(dimension, undefined);
	}

	private readonly _activeControl = derived(this, (reader) => this._widgetImpl.read(reader).activeControl.read(reader));

	public getActiveControl(): any | undefined {
		return this._activeControl.get();
	}

	public readonly onDidChangeActiveControl = Event.fromObservableLight(this._activeControl);

	public getViewState(): IMultiDiffEditorViewState {
		return this._widgetImpl.get().getViewState();
	}

	public setViewState(viewState: IMultiDiffEditorViewState): void {
		this._widgetImpl.get().setViewState(viewState);
	}

	public tryGetCodeEditor(resource: URI): { diffEditor: IDiffEditor; editor: ICodeEditor } | undefined {
		return this._widgetImpl.get().tryGetCodeEditor(resource);
	}
}
