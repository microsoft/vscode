/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension } from '../../../../base/browser/dom.js';
import { Event } from '../../../../base/common/event.js';
import { readHotReloadableExport } from '../../../../base/common/hotReloadHelpers.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, ISettableObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { Range } from '../../../common/core/range.js';
import { DiffEditorViewMode, IDiffEditorOptions } from '../../../common/config/editorOptions.js';
import { IDiffEditor } from '../../../common/editorCommon.js';
import { IMultiDiffResourceId } from '../../../common/multiDiffEditor.js';
import { ICodeEditor } from '../../editorBrowser.js';
import { DiffEditorWidget } from '../diffEditor/diffEditorWidget.js';
import './colors.js';
import { DiffEditorItemTemplate } from './diffEditorItemTemplate.js';
import { IDocumentDiffItem, IMultiDiffEditorModel } from './model.js';
import { getMultiDiffEditorVariantConfiguration, IMultiDiffEditorWidgetOptions, MultiDiffEditorVariant } from './multiDiffEditorOptions.js';
import { MultiDiffEditorViewModel } from './multiDiffEditorViewModel.js';
import { IMultiDiffEditorLayoutDebugState, IMultiDiffEditorViewState, MultiDiffEditorWidgetImpl } from './multiDiffEditorWidgetImpl.js';
import { IWorkbenchUIElementFactory } from './workbenchUIElementFactory.js';

export class MultiDiffEditorWidget extends Disposable {
	private readonly _dimension = observableValue<Dimension | undefined>(this, undefined);
	private readonly _viewModel = observableValue<MultiDiffEditorViewModel | undefined>(this, undefined);
	private readonly _diffLayoutOptions = observableValue<IDiffEditorOptions | undefined>(this, undefined);
	private readonly _paddingBottomPx = observableValue<number>(this, 0);
	private _variant: MultiDiffEditorVariant;
	private readonly _widgetImplValue: ISettableObservable<MultiDiffEditorWidgetImpl>;
	private readonly _widgetImpl: IObservable<MultiDiffEditorWidgetImpl>;
	private readonly _widgetImplDisposable = this._register(new MutableDisposable<MultiDiffEditorWidgetImpl>());

	constructor(
		private readonly _element: HTMLElement,
		private readonly _workbenchUIElementFactory: IWorkbenchUIElementFactory,
		private readonly _options: IMultiDiffEditorWidgetOptions,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._variant = this._options.variant;
		const initialWidgetImpl = this._createWidgetImpl(MultiDiffEditorWidgetImpl);
		this._widgetImplDisposable.value = initialWidgetImpl;
		this._widgetImplValue = observableValue(this, initialWidgetImpl);
		this._widgetImpl = this._widgetImplValue;

		let isInitialHotReloadRun = true;
		this._register(autorun(reader => {
			readHotReloadableExport(DiffEditorItemTemplate, reader);
			const widgetImpl = readHotReloadableExport(MultiDiffEditorWidgetImpl, reader);
			if (isInitialHotReloadRun) {
				isInitialHotReloadRun = false;
				return;
			}
			this._replaceWidgetImpl(widgetImpl);
		}));
	}

	private _createWidgetImpl(widgetImpl: typeof MultiDiffEditorWidgetImpl): MultiDiffEditorWidgetImpl {
		return this._instantiationService.createInstance(
			widgetImpl,
			this._element,
			this._dimension,
			this._viewModel,
			this._workbenchUIElementFactory,
			getMultiDiffEditorVariantConfiguration(this._variant),
			this._diffLayoutOptions,
			this._options.diffEditorOptions,
			this._paddingBottomPx,
		);
	}

	private _replaceWidgetImpl(widgetImpl: typeof MultiDiffEditorWidgetImpl): void {
		const previousImpl = this._widgetImplValue.get();
		const viewState = previousImpl.getViewState();
		const viewModel = this._viewModel.get();
		const previousControl = previousImpl.activeControl.get();
		const focusedEditor = previousControl?.getOriginalEditor().hasTextFocus()
			? 'original'
			: previousControl?.getModifiedEditor().hasTextFocus()
				? 'modified'
				: undefined;

		this._viewModel.set(undefined, undefined);
		this._widgetImplDisposable.clear();
		const newImpl = this._createWidgetImpl(widgetImpl);
		this._widgetImplDisposable.value = newImpl;
		newImpl.setPreserveFocusOnLoad(true);
		transaction(tx => {
			newImpl.setViewState(viewState, tx);
			this._viewModel.set(viewModel, tx);
		});
		if (focusedEditor === 'original') {
			newImpl.activeControl.get()?.getOriginalEditor().focus();
		} else if (focusedEditor === 'modified') {
			newImpl.activeControl.get()?.getModifiedEditor().focus();
		}
		newImpl.setPreserveFocusOnLoad(false);
		this._widgetImplValue.set(newImpl, undefined);
	}

	public setVariant(variant: MultiDiffEditorVariant): void {
		if (this._variant === variant) {
			return;
		}
		this._variant = variant;
		this._replaceWidgetImpl(MultiDiffEditorWidgetImpl);
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
	 * `diffEditor.renderSideBySide` setting. Responsive inline fallback is disabled
	 * unless explicitly enabled.
	 */
	public setRenderSideBySide(renderSideBySide: boolean, options?: { readonly useInlineViewWhenSpaceIsLimited?: boolean }): void {
		this._updateDiffLayoutOptions({
			renderSideBySide,
			useInlineViewWhenSpaceIsLimited: options?.useInlineViewWhenSpaceIsLimited ?? false,
		});
	}

	public setViewMode(mode: DiffEditorViewMode): void {
		this.setDiffLayoutOptions(mode);
	}

	public setDiffLayoutOptions(mode: DiffEditorViewMode, diffWordWrap?: 'off' | 'on' | 'inherit'): void {
		const currentOptions = this._diffLayoutOptions.get();
		const wasAutomatic = currentOptions?.renderSideBySide === true && currentOptions.useInlineViewWhenSpaceIsLimited === true;
		this._updateDiffLayoutOptions({
			renderSideBySide: mode !== 'inline',
			useInlineViewWhenSpaceIsLimited: mode === 'automatic',
			...(diffWordWrap ? { diffWordWrap } : {}),
		});
		if (mode === 'automatic' && !wasAutomatic) {
			this.resetWidthBasedLayout();
		}
	}

	public toggleRenderSideBySide(): void {
		this.setRenderSideBySide(!(this._diffLayoutOptions.get()?.renderSideBySide ?? true));
	}

	public setDiffWordWrap(diffWordWrap: 'off' | 'on' | 'inherit'): void {
		this._updateDiffLayoutOptions({
			diffWordWrap,
		});
	}

	private _updateDiffLayoutOptions(options: IDiffEditorOptions): void {
		const currentOptions = this._diffLayoutOptions.get();
		const updatedOptions = { ...currentOptions, ...options };
		if (
			currentOptions?.renderSideBySide === updatedOptions.renderSideBySide
			&& currentOptions?.useInlineViewWhenSpaceIsLimited === updatedOptions.useInlineViewWhenSpaceIsLimited
			&& currentOptions?.diffWordWrap === updatedOptions.diffWordWrap
		) {
			return;
		}
		this._diffLayoutOptions.set(updatedOptions, undefined);
	}

	/** Reserves empty space below the last diff entry. */
	public setPaddingBottom(px: number): void {
		this._paddingBottomPx.set(px, undefined);
	}

	private readonly _activeControl = derived(this, (reader) => this._widgetImpl.read(reader).activeControl.read(reader));

	public getActiveControl(): DiffEditorWidget | undefined {
		return this._activeControl.get();
	}

	public readonly onDidChangeActiveControl = Event.fromObservableLight(this._activeControl);

	public focus(): boolean {
		return this._widgetImpl.get().focus();
	}

	public getViewState(): IMultiDiffEditorViewState {
		return this._widgetImpl.get().getViewState();
	}

	public getLayoutDebugState(): IObservable<IMultiDiffEditorLayoutDebugState> {
		return this._widgetImpl.get().layoutDebugState;
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

	public resetWidthBasedLayout(): void {
		this._widgetImpl.get().resetWidthBasedLayout();
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
