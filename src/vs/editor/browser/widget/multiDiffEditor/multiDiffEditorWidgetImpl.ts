/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, getWindow, h, scheduleAtNextAnimationFrame } from '../../../../base/browser/dom.js';
import { SmoothScrollableElement } from '../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { compareBy, numberComparator } from '../../../../base/common/arrays.js';
import { findFirstMax } from '../../../../base/common/arraysFind.js';
import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Disposable, IReference, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, IReader, ITransaction, autorun, autorunWithStore, derived, derivedWithStore, disposableObservableValue, globalTransaction, observableFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { Scrollable, ScrollbarVisibility } from '../../../../base/common/scrollable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ContextKeyValue, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ITextEditorOptions } from '../../../../platform/editor/common/editor.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { OffsetRange } from '../../../common/core/offsetRange.js';
import { IRange } from '../../../common/core/range.js';
import { ISelection, Selection } from '../../../common/core/selection.js';
import { IDiffEditor } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { ICodeEditor } from '../../editorBrowser.js';
import { ObservableElementSizeObserver } from '../diffEditor/utils.js';
import { DiffEditorItemTemplate, TemplateData } from './diffEditorItemTemplate.js';
import { IDocumentDiffItem } from './model.js';
import { DocumentDiffItemViewModel, MultiDiffEditorViewModel } from './multiDiffEditorViewModel.js';
import { RevealOptions } from './multiDiffEditorWidget.js';
import { ObjectPool } from './objectPool.js';
import './style.css';
import { IWorkbenchUIElementFactory } from './workbenchUIElementFactory.js';

export class MultiDiffEditorWidgetImpl extends Disposable {
	private readonly _scrollableElements = h('div.scrollContent', [
		h('div@content', {
			style: {
				overflow: 'hidden',
			}
		}),
		h('div.monaco-editor@overflowWidgetsDomNode', {
		}),
	]);

	private readonly _scrollable = this._register(new Scrollable({
		forceIntegerValues: false,
		scheduleAtNextAnimationFrame: (cb) => scheduleAtNextAnimationFrame(getWindow(this._element), cb),
		smoothScrollDuration: 100,
	}));

	private readonly _scrollableElement = this._register(new SmoothScrollableElement(this._scrollableElements.root, {
		vertical: ScrollbarVisibility.Auto,
		horizontal: ScrollbarVisibility.Auto,
		useShadows: false,
	}, this._scrollable));

	private readonly _elements = h('div.monaco-component.multiDiffEditor', {}, [
		h('div', {}, [this._scrollableElement.getDomNode()]),
		h('div.placeholder@placeholder', {}, [h('div')]),
	]);

	private readonly _sizeObserver = this._register(new ObservableElementSizeObserver(this._element, undefined));

	private readonly _objectPool = this._register(new ObjectPool<TemplateData, DiffEditorItemTemplate>((data) => {
		const template = this._instantiationService.createInstance(
			DiffEditorItemTemplate,
			this._scrollableElements.content,
			this._scrollableElements.overflowWidgetsDomNode,
			this._workbenchUIElementFactory
		);
		template.setData(data);
		return template;
	}));

	public readonly scrollTop = observableFromEvent(this, this._scrollableElement.onScroll, () => /** @description scrollTop */ this._scrollableElement.getScrollPosition().scrollTop);
	public readonly scrollLeft = observableFromEvent(this, this._scrollableElement.onScroll, () => /** @description scrollLeft */ this._scrollableElement.getScrollPosition().scrollLeft);

	private readonly _viewItemsInfo = derivedWithStore<{ items: readonly VirtualizedViewItem[]; getItem: (viewModel: DocumentDiffItemViewModel) => VirtualizedViewItem }>(this,
		(reader, store) => {
			const vm = this._viewModel.read(reader);
			if (!vm) {
				return { items: [], getItem: _d => { throw new BugIndicatingError(); } };
			}
			const viewModels = vm.items.read(reader);
			const map = new Map<DocumentDiffItemViewModel, VirtualizedViewItem>();
			const items = viewModels.map(d => {
				const item = store.add(new VirtualizedViewItem(d, this._objectPool, this.scrollLeft, delta => {
					this._scrollableElement.setScrollPosition({ scrollTop: this._scrollableElement.getScrollPosition().scrollTop + delta });
				}));
				const data = this._lastDocStates?.[item.getKey()];
				if (data) {
					transaction(tx => {
						item.setViewState(data, tx);
					});
				}
				map.set(d, item);
				return item;
			});
			return { items, getItem: d => map.get(d)! };
		}
	);

	private readonly _viewItems = this._viewItemsInfo.map(this, items => items.items);

	private readonly _spaceBetweenPx = 0;

	private readonly _totalHeight = this._viewItems.map(this, (items, reader) => items.reduce((r, i) => r + i.contentHeight.read(reader) + this._spaceBetweenPx, 0));
	public readonly activeControl = derived(this, reader => {
		const activeDiffItem = this._viewModel.read(reader)?.activeDiffItem.read(reader);
		if (!activeDiffItem) { return undefined; }
		const viewItem = this._viewItemsInfo.read(reader).getItem(activeDiffItem);
		return viewItem.template.read(reader)?.editor;
	});

	private readonly _contextKeyService = this._register(this._parentContextKeyService.createScoped(this._element));
	private readonly _instantiationService = this._register(this._parentInstantiationService.createChild(
		new ServiceCollection([IContextKeyService, this._contextKeyService])
	));

	constructor(
		private readonly _element: HTMLElement,
		private readonly _dimension: IObservable<Dimension | undefined>,
		private readonly _viewModel: IObservable<MultiDiffEditorViewModel | undefined>,
		private readonly _workbenchUIElementFactory: IWorkbenchUIElementFactory,
		@IContextKeyService private readonly _parentContextKeyService: IContextKeyService,
		@IInstantiationService private readonly _parentInstantiationService: IInstantiationService,
	) {
		super();

		this._register(autorunWithStore((reader, store) => {
			const viewModel = this._viewModel.read(reader);
			if (viewModel && viewModel.contextKeys) {
				for (const [key, value] of Object.entries(viewModel.contextKeys)) {
					const contextKey = this._contextKeyService.createKey<ContextKeyValue>(key, undefined);
					contextKey.set(value);
					store.add(toDisposable(() => contextKey.reset()));
				}
			}
		}));

		const ctxAllCollapsed = this._parentContextKeyService.createKey<boolean>(EditorContextKeys.multiDiffEditorAllCollapsed.key, false);
		this._register(autorun((reader) => {
			const viewModel = this._viewModel.read(reader);
			if (viewModel) {
				const allCollapsed = viewModel.items.read(reader).every(item => item.collapsed.read(reader));
				ctxAllCollapsed.set(allCollapsed);
			}
		}));

		this._register(autorun((reader) => {
			/** @description Update widget dimension */
			const dimension = this._dimension.read(reader);
			this._sizeObserver.observe(dimension);
		}));

		const placeholderMessage = derived(reader => {
			const items = this._viewItems.read(reader);
			if (items.length > 0) { return undefined; }

			const vm = this._viewModel.read(reader);
			return (!vm || vm.isLoading.read(reader))
				? localize('loading', 'Loading...')
				: localize('noChangedFiles', 'No Changed Files');
		});

		this._register(autorun((reader) => {
			const message = placeholderMessage.read(reader);
			this._elements.placeholder.innerText = message ?? '';
			this._elements.placeholder.classList.toggle('visible', !!message);
		}));

		this._scrollableElements.content.style.position = 'relative';

		this._register(autorun((reader) => {
			/** @description Update scroll dimensions */
			const height = this._sizeObserver.height.read(reader);
			this._scrollableElements.root.style.height = `${height}px`;
			const totalHeight = this._totalHeight.read(reader);
			this._scrollableElements.content.style.height = `${totalHeight}px`;

			const width = this._sizeObserver.width.read(reader);

			let scrollWidth = width;
			const viewItems = this._viewItems.read(reader);
			const max = findFirstMax(viewItems, compareBy(i => i.maxScroll.read(reader).maxScroll, numberComparator));
			if (max) {
				const maxScroll = max.maxScroll.read(reader);
				scrollWidth = width + maxScroll.maxScroll;
			}

			this._scrollableElement.setScrollDimensions({
				width: width,
				height: height,
				scrollHeight: totalHeight,
				scrollWidth,
			});
		}));

		_element.replaceChildren(this._elements.root);
		this._register(toDisposable(() => {
			_element.replaceChildren();
		}));

		this._register(this._register(autorun(reader => {
			/** @description Render all */
			globalTransaction(tx => {
				this.render(reader);
			});
		})));
	}

	public setScrollState(scrollState: { top?: number; left?: number }): void {
		this._scrollableElement.setScrollPosition({ scrollLeft: scrollState.left, scrollTop: scrollState.top });
	}

	public reveal(resource: IMultiDiffResourceId, options?: RevealOptions): void {
		const viewItems = this._viewItems.get();
		const index = viewItems.findIndex(
			(item) => item.viewModel.originalUri?.toString() === resource.original?.toString()
				&& item.viewModel.modifiedUri?.toString() === resource.modified?.toString()
		);
		if (index === -1) {
			throw new BugIndicatingError('Resource not found in diff editor');
		}
		const viewItem = viewItems[index];
		this._viewModel.get()!.activeDiffItem.setCache(viewItem.viewModel, undefined);

		let scrollTop = 0;
		for (let i = 0; i < index; i++) {
			scrollTop += viewItems[i].contentHeight.get() + this._spaceBetweenPx;
		}
		this._scrollableElement.setScrollPosition({ scrollTop });

		const diffEditor = viewItem.template.get()?.editor;
		const editor = 'original' in resource ? diffEditor?.getOriginalEditor() : diffEditor?.getModifiedEditor();
		if (editor && options?.range) {
			editor.revealRangeInCenter(options.range);
			highlightRange(editor, options.range);
		}
	}

	public getViewState(): IMultiDiffEditorViewState {
		return {
			scrollState: {
				top: this.scrollTop.get(),
				left: this.scrollLeft.get(),
			},
			docStates: Object.fromEntries(this._viewItems.get().map(i => [i.getKey(), i.getViewState()])),
		};
	}

	/** This accounts for documents that are not loaded yet. */
	private _lastDocStates: IMultiDiffEditorViewState['docStates'] = {};

	public setViewState(viewState: IMultiDiffEditorViewState): void {
		this.setScrollState(viewState.scrollState);

		this._lastDocStates = viewState.docStates;

		transaction(tx => {
			/** setViewState */
			if (viewState.docStates) {
				for (const i of this._viewItems.get()) {
					const state = viewState.docStates[i.getKey()];
					if (state) {
						i.setViewState(state, tx);
					}
				}
			}
		});
	}

	public findDocumentDiffItem(resource: URI): IDocumentDiffItem | undefined {
		const item = this._viewItems.get().find(v =>
			v.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString()
			|| v.viewModel.diffEditorViewModel.model.original.uri.toString() === resource.toString()
		);
		return item?.viewModel.documentDiffItem;
	}

	public tryGetCodeEditor(resource: URI): { diffEditor: IDiffEditor; editor: ICodeEditor } | undefined {
		const item = this._viewItems.get().find(v =>
			v.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString()
			|| v.viewModel.diffEditorViewModel.model.original.uri.toString() === resource.toString()
		);
		const editor = item?.template.get()?.editor;
		if (!editor) {
			return undefined;
		}

		if (item.viewModel.diffEditorViewModel.model.modified.uri.toString() === resource.toString()) {
			return { diffEditor: editor, editor: editor.getModifiedEditor() };
		} else {
			return { diffEditor: editor, editor: editor.getOriginalEditor() };
		}
	}

	private render(reader: IReader | undefined) {
		const scrollTop = this.scrollTop.read(reader);
		let contentScrollOffsetToScrollOffset = 0;
		let itemHeightSumBefore = 0;
		let itemContentHeightSumBefore = 0;
		const viewPortHeight = this._sizeObserver.height.read(reader);
		const contentViewPort = OffsetRange.ofStartAndLength(scrollTop, viewPortHeight);

		const width = this._sizeObserver.width.read(reader);

		for (const v of this._viewItems.read(reader)) {
			const itemContentHeight = v.contentHeight.read(reader);
			const itemHeight = Math.min(itemContentHeight, viewPortHeight);
			const itemRange = OffsetRange.ofStartAndLength(itemHeightSumBefore, itemHeight);
			const itemContentRange = OffsetRange.ofStartAndLength(itemContentHeightSumBefore, itemContentHeight);

			if (itemContentRange.isBefore(contentViewPort)) {
				contentScrollOffsetToScrollOffset -= itemContentHeight - itemHeight;
				v.hide();
			} else if (itemContentRange.isAfter(contentViewPort)) {
				v.hide();
			} else {
				const scroll = Math.max(0, Math.min(contentViewPort.start - itemContentRange.start, itemContentHeight - itemHeight));
				contentScrollOffsetToScrollOffset -= scroll;
				const viewPort = OffsetRange.ofStartAndLength(scrollTop + contentScrollOffsetToScrollOffset, viewPortHeight);
				v.render(itemRange, scroll, width, viewPort);
			}

			itemHeightSumBefore += itemHeight + this._spaceBetweenPx;
			itemContentHeightSumBefore += itemContentHeight + this._spaceBetweenPx;
		}

		this._scrollableElements.content.style.transform = `translateY(${-(scrollTop + contentScrollOffsetToScrollOffset)}px)`;
	}
}

function highlightRange(targetEditor: ICodeEditor, range: IRange) {
	const modelNow = targetEditor.getModel();
	const decorations = targetEditor.createDecorationsCollection([{ range, options: { description: 'symbol-navigate-action-highlight', className: 'symbolHighlight' } }]);
	setTimeout(() => {
		if (targetEditor.getModel() === modelNow) {
			decorations.clear();
		}
	}, 350);
}

export interface IMultiDiffEditorViewState {
	scrollState: { top: number; left: number };
	docStates?: Record<string, IMultiDiffDocState>;
}

interface IMultiDiffDocState {
	collapsed: boolean;
	selections?: ISelection[];
}

export interface IMultiDiffEditorOptions extends ITextEditorOptions {
	viewState?: IMultiDiffEditorOptionsViewState;
}

export interface IMultiDiffEditorOptionsViewState {
	revealData?: {
		resource: IMultiDiffResourceId;
		range?: IRange;
	};
}

export type IMultiDiffResourceId = { original: URI | undefined; modified: URI | undefined };

class VirtualizedViewItem extends Disposable {
	private readonly _templateRef = this._register(disposableObservableValue<IReference<DiffEditorItemTemplate> | undefined>(this, undefined));

	public readonly contentHeight = derived(this, reader =>
		this._templateRef.read(reader)?.object.contentHeight?.read(reader) ?? this.viewModel.lastTemplateData.read(reader).contentHeight
	);

	public readonly maxScroll = derived(this, reader => this._templateRef.read(reader)?.object.maxScroll.read(reader) ?? { maxScroll: 0, scrollWidth: 0 });

	public readonly template = derived(this, reader => this._templateRef.read(reader)?.object);
	private _isHidden = observableValue(this, false);

	private readonly _isFocused = derived(this, reader => this.template.read(reader)?.isFocused.read(reader) ?? false);

	constructor(
		public readonly viewModel: DocumentDiffItemViewModel,
		private readonly _objectPool: ObjectPool<TemplateData, DiffEditorItemTemplate>,
		private readonly _scrollLeft: IObservable<number>,
		private readonly _deltaScrollVertical: (delta: number) => void,
	) {
		super();

		this.viewModel.setIsFocused(this._isFocused, undefined);

		this._register(autorun((reader) => {
			const scrollLeft = this._scrollLeft.read(reader);
			this._templateRef.read(reader)?.object.setScrollLeft(scrollLeft);
		}));

		this._register(autorun(reader => {
			const ref = this._templateRef.read(reader);
			if (!ref) { return; }
			const isHidden = this._isHidden.read(reader);
			if (!isHidden) { return; }

			const isFocused = ref.object.isFocused.read(reader);
			if (isFocused) { return; }

			this._clear();
		}));
	}

	override dispose(): void {
		this._clear();
		super.dispose();
	}

	public override toString(): string {
		return `VirtualViewItem(${this.viewModel.documentDiffItem.modified?.uri.toString()})`;
	}

	public getKey(): string {
		return this.viewModel.getKey();
	}

	public getViewState(): IMultiDiffDocState {
		transaction(tx => {
			this._updateTemplateData(tx);
		});
		return {
			collapsed: this.viewModel.collapsed.get(),
			selections: this.viewModel.lastTemplateData.get().selections,
		};
	}

	public setViewState(viewState: IMultiDiffDocState, tx: ITransaction): void {
		this.viewModel.collapsed.set(viewState.collapsed, tx);

		this._updateTemplateData(tx);
		const data = this.viewModel.lastTemplateData.get();
		const selections = viewState.selections?.map(Selection.liftSelection);
		this.viewModel.lastTemplateData.set({
			...data,
			selections,
		}, tx);
		const ref = this._templateRef.get();
		if (ref) {
			if (selections) {
				ref.object.editor.setSelections(selections);
			}
		}
	}

	private _updateTemplateData(tx: ITransaction): void {
		const ref = this._templateRef.get();
		if (!ref) { return; }
		this.viewModel.lastTemplateData.set({
			contentHeight: ref.object.contentHeight.get(),
			selections: ref.object.editor.getSelections() ?? undefined,
		}, tx);
	}

	private _clear(): void {
		const ref = this._templateRef.get();
		if (!ref) { return; }
		transaction(tx => {
			this._updateTemplateData(tx);
			ref.object.hide();
			this._templateRef.set(undefined, tx);
		});
	}

	public hide(): void {
		this._isHidden.set(true, undefined);
	}

	public render(verticalSpace: OffsetRange, offset: number, width: number, viewPort: OffsetRange): void {
		this._isHidden.set(false, undefined);

		let ref = this._templateRef.get();
		if (!ref) {
			ref = this._objectPool.getUnusedObj(new TemplateData(this.viewModel, this._deltaScrollVertical));
			this._templateRef.set(ref, undefined);

			const selections = this.viewModel.lastTemplateData.get().selections;
			if (selections) {
				ref.object.editor.setSelections(selections);
			}
		}
		ref.object.render(verticalSpace, width, offset, viewPort);
	}
}
