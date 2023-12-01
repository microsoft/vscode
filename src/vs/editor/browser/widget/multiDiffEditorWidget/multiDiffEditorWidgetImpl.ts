/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, getWindow, h, scheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { SmoothScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { findFirstMaxBy } from 'vs/base/common/arraysFind';
import { Disposable, IReference, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, autorun, derived, derivedObservableWithCache, derivedWithStore, observableFromEvent, observableValue } from 'vs/base/common/observable';
import { disposableObservableValue, globalTransaction, transaction } from 'vs/base/common/observableInternal/base';
import { Scrollable, ScrollbarVisibility } from 'vs/base/common/scrollable';
import 'vs/css!./style';
import { ObservableElementSizeObserver } from 'vs/editor/browser/widget/diffEditor/utils';
import { IWorkbenchUIElementFactory } from 'vs/editor/browser/widget/multiDiffEditorWidget/workbenchUIElementFactory';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DiffEditorItemTemplate, TemplateData } from './diffEditorItemTemplate';
import { DocumentDiffItemViewModel, MultiDiffEditorViewModel } from './multiDiffEditorViewModel';
import { ObjectPool } from './objectPool';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';

export class MultiDiffEditorWidgetImpl extends Disposable {
	private readonly _elements = h('div', {
		style: {
			overflowY: 'hidden',
		}
	}, [
		h('div@content', {
			style: {
				overflow: 'hidden',
			}
		}),
		h('div.monaco-editor@overflowWidgetsDomNode', {
		}),
	]);

	private readonly _sizeObserver = this._register(new ObservableElementSizeObserver(this._element, undefined));

	private readonly _objectPool = this._register(new ObjectPool<TemplateData, DiffEditorItemTemplate>((data) => {
		const template = this._instantiationService.createInstance(
			DiffEditorItemTemplate,
			this._elements.content,
			this._elements.overflowWidgetsDomNode,
			this._workbenchUIElementFactory
		);
		template.setData(data);
		return template;
	}));

	private readonly _scrollable = this._register(new Scrollable({
		forceIntegerValues: false,
		scheduleAtNextAnimationFrame: (cb) => scheduleAtNextAnimationFrame(getWindow(this._element), cb),
		smoothScrollDuration: 100,
	}));

	private readonly _scrollableElement = this._register(new SmoothScrollableElement(this._elements.root, {
		vertical: ScrollbarVisibility.Auto,
		horizontal: ScrollbarVisibility.Auto,
		className: 'monaco-component',
		useShadows: false,
	}, this._scrollable));

	public readonly scrollTop = observableFromEvent(this._scrollableElement.onScroll, () => /** @description scrollTop */ this._scrollableElement.getScrollPosition().scrollTop);
	public readonly scrollLeft = observableFromEvent(this._scrollableElement.onScroll, () => /** @description scrollLeft */ this._scrollableElement.getScrollPosition().scrollLeft);

	private readonly _viewItems = derivedWithStore<readonly VirtualizedViewItem[]>(this,
		(reader, store) => {
			const vm = this._viewModel.read(reader);
			if (!vm) {
				return [];
			}
			const items = vm.items.read(reader);
			return items.map(d => store.add(new VirtualizedViewItem(d, this._objectPool, this.scrollLeft)));
		}
	);

	private readonly _totalHeight = this._viewItems.map(this, (items, reader) => items.reduce((r, i) => r + i.contentHeight.read(reader), 0));
	public readonly activeDiffItem = derived(this, reader => this._viewItems.read(reader).find(i => i.template.read(reader)?.isFocused.read(reader)));
	public readonly lastActiveDiffItem = derivedObservableWithCache<VirtualizedViewItem | undefined>((reader, lastValue) => this.activeDiffItem.read(reader) ?? lastValue);
	public readonly activeControl = derived(this, reader => this.lastActiveDiffItem.read(reader)?.template.read(reader)?.editor);

	private readonly _contextKeyService = this._register(this._parentContextKeyService.createScoped(this._element));
	private readonly _instantiationService = this._parentInstantiationService.createChild(
		new ServiceCollection([IContextKeyService, this._contextKeyService])
	);

	constructor(
		private readonly _element: HTMLElement,
		private readonly _dimension: IObservable<Dimension | undefined>,
		private readonly _viewModel: IObservable<MultiDiffEditorViewModel | undefined>,
		private readonly _workbenchUIElementFactory: IWorkbenchUIElementFactory,
		@IContextKeyService private readonly _parentContextKeyService: IContextKeyService,
		@IInstantiationService private readonly _parentInstantiationService: IInstantiationService,
	) {
		super();

		this._contextKeyService.createKey(EditorContextKeys.inMultiDiffEditor.key, true);

		const ctxAllCollapsed = this._parentContextKeyService.createKey<boolean>(EditorContextKeys.multiDiffEditorAllCollapsed.key, false);
		this._register(autorun((reader) => {
			const viewModel = this._viewModel.read(reader);
			if (viewModel) {
				const allCollapsed = viewModel.items.read(reader).every(item => item.collapsed.read(reader));
				ctxAllCollapsed.set(allCollapsed);
			}
		}));

		this._register(autorun((reader) => {
			const lastActiveDiffItem = this.lastActiveDiffItem.read(reader);
			transaction(tx => {
				this._viewModel.read(reader)?.activeDiffItem.set(lastActiveDiffItem?.viewModel, tx);
			});
		}));

		this._register(autorun((reader) => {
			/** @description Update widget dimension */
			const dimension = this._dimension.read(reader);
			this._sizeObserver.observe(dimension);
		}));

		this._elements.content.style.position = 'relative';

		this._register(autorun((reader) => {
			/** @description Update scroll dimensions */
			const height = this._sizeObserver.height.read(reader);
			this._elements.root.style.height = `${height}px`;
			const totalHeight = this._totalHeight.read(reader);
			this._elements.content.style.height = `${totalHeight}px`;

			const width = this._sizeObserver.width.read(reader);

			let scrollWidth = width;
			const viewItems = this._viewItems.read(reader);
			const max = findFirstMaxBy(viewItems, i => i.maxScroll.read(reader).maxScroll);
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

		_element.replaceChildren(this._scrollableElement.getDomNode());
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

			itemHeightSumBefore += itemHeight;
			itemContentHeightSumBefore += itemContentHeight;
		}

		this._elements.content.style.transform = `translateY(${-(scrollTop + contentScrollOffsetToScrollOffset)}px)`;
	}
}

class VirtualizedViewItem extends Disposable {
	// TODO this should be in the view model
	private readonly _lastTemplateData = observableValue<{ contentHeight: number; maxScroll: { maxScroll: number; width: number } }>(
		this,
		{ contentHeight: 500, maxScroll: { maxScroll: 0, width: 0 }, }
	);
	private readonly _templateRef = this._register(disposableObservableValue<IReference<DiffEditorItemTemplate> | undefined>(this, undefined));

	public readonly contentHeight = derived(this, reader =>
		this._templateRef.read(reader)?.object.height?.read(reader) ?? this._lastTemplateData.read(reader).contentHeight
	);

	public readonly maxScroll = derived(this, reader => this._templateRef.read(reader)?.object.maxScroll.read(reader) ?? this._lastTemplateData.read(reader).maxScroll);

	public readonly template = derived(this, reader => this._templateRef.read(reader)?.object);
	private _isHidden = observableValue(this, false);

	constructor(
		public readonly viewModel: DocumentDiffItemViewModel,
		private readonly _objectPool: ObjectPool<TemplateData, DiffEditorItemTemplate>,
		private readonly _scrollLeft: IObservable<number>,
	) {
		super();

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

			transaction(tx => {
				this._lastTemplateData.set({
					contentHeight: ref.object.height.get(),
					maxScroll: { maxScroll: 0, width: 0, } // Reset max scroll
				}, tx);
				ref.object.hide();

				this._templateRef.set(undefined, tx);
			});
		}));
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}

	public override toString(): string {
		return `VirtualViewItem(${this.viewModel.entry.value!.title})`;
	}

	public hide(): void {
		this._isHidden.set(true, undefined);
	}

	public render(verticalSpace: OffsetRange, offset: number, width: number, viewPort: OffsetRange): void {
		this._isHidden.set(false, undefined);

		let ref = this._templateRef.get();
		if (!ref) {
			ref = this._objectPool.getUnusedObj(new TemplateData(this.viewModel));
			this._templateRef.set(ref, undefined);
		}
		ref.object.render(verticalSpace, width, offset, viewPort);
	}
}
