/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, getWindow, h, scheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { SmoothScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Disposable, IReference, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, autorun, constObservable, derived, derivedWithStore, observableFromEvent, observableValue } from 'vs/base/common/observable';
import { Scrollable, ScrollbarVisibility } from 'vs/base/common/scrollable';
import 'vs/css!./style';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { ObservableElementSizeObserver } from 'vs/editor/browser/widget/diffEditor/utils';
import { IDiffEntry, IMultiDocumentDiffEditorModel, LazyPromise } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IDiffEditorViewModel } from 'vs/editor/common/editorCommon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { DiffEditorItemTemplate, TemplateData } from './diffEditorItemTemplate';
import { ObjectPool } from './objectPool';
import { disposableObservableValue, globalTransaction, transaction } from 'vs/base/common/observableInternal/base';
import { IWorkbenchUIElementFactory } from 'vs/editor/browser/widget/multiDiffEditorWidget/workbenchUIElementFactory';

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
	private readonly _documentsObs = this._model.map(this, m => !m ? constObservable([]) : observableFromEvent(m.onDidChange, /** @description Documents changed */() => m.diffs));
	private readonly _documents = this._documentsObs.map(this, (m, reader) => m.read(reader));

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

	private readonly _hiddenContainer = document.createElement('div');

	private readonly _editor = this._register(this._instantiationService.createInstance(DiffEditorWidget, this._hiddenContainer, {
		hideUnchangedRegions: {
			enabled: true,
		},
	}, {}));

	private readonly _viewItems = derivedWithStore<DiffEditorItem[]>(this,
		(reader, store) => this._documents.read(reader).map(d => store.add(new DiffEditorItem(this._objectPool, d, this._editor)))
	);

	private readonly _totalHeight = this._viewItems.map(this, (items, reader) => items.reduce((r, i) => r + i.contentHeight.read(reader), 0));

	private readonly _scrollTop: IObservable<number>;

	constructor(
		private readonly _element: HTMLElement,
		private readonly _dimension: IObservable<Dimension | undefined>,
		private readonly _model: IObservable<IMultiDocumentDiffEditorModel | undefined>,
		private readonly _workbenchUIElementFactory: IWorkbenchUIElementFactory,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		//this._sizeObserver.setAutomaticLayout(true);

		this._register(autorun((reader) => {
			/** @description Update widget dimension */
			const dimension = this._dimension.read(reader);
			this._sizeObserver.observe(dimension);
		}));

		const scrollable = this._register(new Scrollable({
			forceIntegerValues: false,
			scheduleAtNextAnimationFrame: (cb) => scheduleAtNextAnimationFrame(getWindow(_element), cb),
			smoothScrollDuration: 100,
		}));

		this._elements.content.style.position = 'relative';

		const scrollableElement = this._register(new SmoothScrollableElement(this._elements.root, {
			vertical: ScrollbarVisibility.Auto,
			className: 'monaco-component',
			useShadows: false,
		}, scrollable));

		this._scrollTop = observableFromEvent(scrollableElement.onScroll, () => /** @description onScroll */ scrollableElement.getScrollPosition().scrollTop);

		this._register(autorun((reader) => {
			/** @description Update scroll dimensions */
			const height = this._sizeObserver.height.read(reader);
			this._elements.root.style.height = `${height}px`;
			const totalHeight = this._totalHeight.read(reader);
			this._elements.content.style.height = `${totalHeight}px`;
			scrollableElement.setScrollDimensions({
				width: _element.clientWidth,
				height: height,
				scrollHeight: totalHeight,
				scrollWidth: _element.clientWidth,
			});
		}));

		_element.replaceChildren(scrollableElement.getDomNode());
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

	private render(reader: IReader | undefined) {
		const scrollTop = this._scrollTop.read(reader);
		let contentScrollOffsetToScrollOffset = 0;
		let itemHeightSumBefore = 0;
		let itemContentHeightSumBefore = 0;
		const viewPortHeight = this._elements.root.clientHeight;
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

class DiffEditorItem extends Disposable {
	private readonly _lastTemplateHeight = observableValue(this, 500);
	private readonly _templateRef = this._register(disposableObservableValue<IReference<DiffEditorItemTemplate> | undefined>(this, undefined));
	private _vm: IDiffEditorViewModel | undefined;

	public readonly contentHeight = derived(this, reader =>
		this._templateRef.read(reader)?.object.height?.read(reader) ?? this._lastTemplateHeight.read(reader)
	);

	constructor(
		private readonly _objectPool: ObjectPool<TemplateData, DiffEditorItemTemplate>,
		private readonly _entry: LazyPromise<IDiffEntry>,
		baseDiffEditorWidget: DiffEditorWidget,
	) {
		super();

		this._vm = this._register(baseDiffEditorWidget.createViewModel({
			original: _entry.value!.original!,
			modified: _entry.value!.modified!,
		}));
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}

	public override toString(): string {
		return `ViewItem(${this._entry.value!.title})`;
	}

	public hide(): void {
		const ref = this._templateRef.get();
		transaction(tx => {
			if (ref) {
				this._lastTemplateHeight.set(ref.object.height.get(), tx);
				ref.object.hide();
			}
			this._templateRef.set(undefined, tx);
		});
	}

	public render(verticalSpace: OffsetRange, offset: number, width: number, viewPort: OffsetRange): void {
		let ref = this._templateRef.get();
		if (!ref) {
			ref = this._objectPool.getUnusedObj(new TemplateData(this._vm!, this._entry.value!));
			this._templateRef.set(ref, undefined);
		}
		ref.object.render(verticalSpace, width, offset, viewPort);
	}
}
