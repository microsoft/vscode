/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { readHotReloadableExport } from '../../../../base/common/hotReloadHelpers.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived, observableValue, recomputeInitiallyAndOnChange, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { Range } from '../../../common/core/range.js';
import { IDiffEditorOptions } from '../../../common/config/editorOptions.js';
import { IDiffEditor } from '../../../common/editorCommon.js';
import { ICodeEditor } from '../../editorBrowser.js';
import { DiffEditorWidget } from '../diffEditor/diffEditorWidget.js';
import './colors.js';
import { DiffEditorItemTemplate } from './diffEditorItemTemplate.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from './model.js';
import { MultiDiffEditorViewModel } from './multiDiffEditorViewModel.js';
import { IMultiDiffEditorViewState, IMultiDiffResourceId, MultiDiffEditorWidgetImpl } from './multiDiffEditorWidgetImpl.js';
import { IWorkbenchUIElementFactory } from './workbenchUIElementFactory.js';

export class MultiDiffEditorWidget extends Disposable {
	private readonly _dimension = observableValue<Dimension | undefined>(this, undefined);
	private readonly _viewModel = observableValue<MultiDiffEditorViewModel | undefined>(this, undefined);
	private readonly _renderSideBySide = observableValue<boolean | undefined>(this, undefined);

	private readonly _widgetImpl = derived(this, (reader) => {
		readHotReloadableExport(DiffEditorItemTemplate, reader);
		return reader.store.add(this._instantiationService.createInstance((
			readHotReloadableExport(MultiDiffEditorWidgetImpl, reader)),
			this._element,
			this._dimension,
			this._viewModel,
			this._workbenchUIElementFactory,
			this._renderSideBySide,
			this._diffEditorOptions,
		));
	});

	constructor(
		private readonly _element: HTMLElement,
		private readonly _workbenchUIElementFactory: IWorkbenchUIElementFactory,
		private readonly _diffEditorOptions: IDiffEditorOptions | undefined,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._register(recomputeInitiallyAndOnChange(this._widgetImpl));
	}

	public reveal(resource: IMultiDiffResourceId, options?: RevealOptions): void {
		this._widgetImpl.get().reveal(resource, options);
	}

	public createViewModel(model: IMultiDiffEditorModel): MultiDiffEditorViewModel {
		return new MultiDiffEditorViewModel(model, this._instantiationService);
	}

	public setViewModel(viewModel: MultiDiffEditorViewModel | undefined, options?: { readonly preserveFocus?: boolean; readonly viewState?: IMultiDiffEditorViewState }): void {
		// `MultiDiffEditor.clearInput()` awaits `super.clearInput()` before it
		// calls `setViewModel(undefined)`; during that await the editor pane and
		// its scoped instantiation service can be disposed. Once this widget is
		// disposed the `_widgetImpl` derived is no longer observed, so reading it
		// here would re-create the impl via `createInstance` on the disposed
		// instantiation service and throw. Bail out instead.
		if (this._store.isDisposed) {
			return;
		}
		// An editor opened with `preserveFocus` (e.g. restored in the background
		// or on a session switch) must not have its automatic first-change
		// selection steal keyboard focus from elsewhere (such as the chat input).
		this._widgetImpl.get().setPreserveFocusOnLoad(!!options?.preserveFocus);

		// Apply the view model and the (optional) restored view state in a single
		// transaction so the widget's automatic first-change navigation, which runs
		// when the model is set, already sees the restored active item/collapsed
		// state instead of navigating to (and focusing) the first file. Without a
		// view state, clear any pending restoration state so the new model cannot
		// inherit the previous model's collapsed/selection/scroll state.
		transaction(tx => {
			this._viewModel.set(viewModel, tx);
			if (options?.viewState) {
				this._widgetImpl.get().setViewState(options.viewState, tx);
			} else {
				this._widgetImpl.get().clearPendingRestorationState();
			}
		});
	}

	public layout(dimension: Dimension): void {
		this._dimension.set(dimension, undefined);
	}

	/**
	 * Overrides whether the embedded diffs render side by side (`true`) or inline
	 * (`false`) as editor-local state, independent of the
	 * `diffEditor.renderSideBySide` setting. When left unset the setting applies.
	 */
	public setRenderSideBySide(renderSideBySide: boolean): void {
		this._renderSideBySide.set(renderSideBySide, undefined);
	}

	public toggleRenderSideBySide(): void {
		this._renderSideBySide.set(!(this._renderSideBySide.get() ?? true), undefined);
	}

	private readonly _activeControl = derived(this, (reader) => this._widgetImpl.read(reader).activeControl.read(reader));

	public getActiveControl(): DiffEditorWidget | undefined {
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

	public getRootElement(): HTMLElement {
		return this._widgetImpl.get().getRootElement();
	}

	public getContextKeyService(): IContextKeyService {
		return this._widgetImpl.get().getContextKeyService();
	}

	public getScopedInstantiationService(): IInstantiationService {
		return this._widgetImpl.get().getScopedInstantiationService();
	}

	public findDocumentDiffItem(resource: URI): IDocumentDiffItem | undefined {
		return this._widgetImpl.get().findDocumentDiffItem(resource);
	}

	public goToNextChange(): void {
		this._widgetImpl.get().goToNextChange();
	}

	public goToPreviousChange(): void {
		this._widgetImpl.get().goToPreviousChange();
	}
}

export interface RevealOptions {
	range?: Range;
	highlight: boolean;
}
