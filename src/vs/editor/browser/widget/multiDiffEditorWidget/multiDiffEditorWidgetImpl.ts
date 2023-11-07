/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, getWindow, h, scheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { SmoothScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { Disposable, IReference, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, IReader, ISettableObservable, autorun, constObservable, observableFromEvent, observableValue } from 'vs/base/common/observable';
import { globalTransaction } from 'vs/base/common/observableInternal/base';
import { Scrollable, ScrollbarVisibility } from 'vs/base/common/scrollable';
import 'vs/css!./style';
import { DiffEditorWidget } from 'vs/editor/browser/widget/diffEditor/diffEditorWidget';
import { ObservableElementSizeObserver } from 'vs/editor/browser/widget/diffEditor/utils';
import { IDiffEntry, IMultiDocumentDiffEditorModel, LazyPromise } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { IDiffEditorViewModel } from 'vs/editor/common/editorCommon';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILabelService } from 'vs/platform/label/common/label';
import { ObjectPool } from './objectPool';

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
		})
	]);

	private readonly _sizeObserver = new ObservableElementSizeObserver(this._element, undefined);
	private readonly _documentsObs = this._model.map(this, m => !m ? constObservable([]) : observableFromEvent(m.onDidChange, /** @description Documents changed */() => m.diffs));
	private readonly _documents = this._documentsObs.map(this, (m, reader) => m.read(reader));

	private readonly _objectPool = new ObjectPool<DiffEditorItemTemplate>(() => this._instantiationService.createInstance(DiffEditorItemTemplate, this._elements.content));

	private readonly _hiddenContainer = document.createElement('div');

	private readonly _editor = this._register(this._instantiationService.createInstance(DiffEditorWidget, this._hiddenContainer, {
		hideUnchangedRegions: {
			enabled: true,
		},
	}, {}));

	private readonly _viewItems = this._documents.map(this,
		docs => docs.map(d => new DiffEditorItem(this._objectPool, d, this._editor))
	);

	private readonly _totalHeight = this._viewItems.map(this, (items, reader) => items.reduce((r, i) => r + i.contentHeight.read(reader), 0));

	private readonly scrollTop: IObservable<number>;

	constructor(
		private readonly _element: HTMLElement,
		private readonly _dimension: IObservable<Dimension | undefined>,
		private readonly _model: IObservable<IMultiDocumentDiffEditorModel | undefined>,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this._sizeObserver.setAutomaticLayout(true);

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
		}, scrollable));

		this.scrollTop = observableFromEvent(scrollableElement.onScroll, () => /** @description onScroll */ scrollableElement.getScrollPosition().scrollTop);

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
			this.render(reader);
		})));
	}

	private render(reader: IReader | undefined) {
		const scrollTop = this.scrollTop.read(reader);
		let contentScrollOffsetToScrollOffset = 0;
		let itemHeightSumBefore = 0;
		let itemContentHeightSumBefore = 0;
		const viewPortHeight = this._elements.root.clientHeight;
		const contentViewPort = OffsetRange.ofStartAndLength(scrollTop, viewPortHeight);

		const width = this._elements.content.clientWidth;

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
				v.render(itemRange, scroll, width);
				contentScrollOffsetToScrollOffset -= scroll;
			}

			itemHeightSumBefore += itemHeight;
			itemContentHeightSumBefore += itemContentHeight;
		}

		this._elements.content.style.transform = `translateY(${-(scrollTop + contentScrollOffsetToScrollOffset)}px)`;
	}
}

class DiffEditorItem {
	private readonly _height = observableValue(this, 500);
	public readonly contentHeight: IObservable<number> = this._height;
	private _templateRef: IReference<DiffEditorItemTemplate> | undefined;

	private _vm: IDiffEditorViewModel | undefined;

	constructor(
		private readonly _objectPool: ObjectPool<DiffEditorItemTemplate>,
		private readonly _entry: LazyPromise<IDiffEntry>,
		baseDiffEditorWidget: DiffEditorWidget,
	) {
		this._vm = baseDiffEditorWidget.createViewModel({
			original: _entry.value!.original!,
			modified: _entry.value!.modified!,
		});
	}

	public toString(): string {
		return `ViewItem(${this._entry.value!.title})`;
	}

	public hide(): void {
		this._templateRef?.object.hide();
		this._templateRef?.dispose();
		this._templateRef = undefined;
	}

	public render(verticalSpace: OffsetRange, offset: number, width: number): void {
		if (!this._templateRef) {
			this._templateRef = this._objectPool.getUnusedObj();
			this._templateRef.object.setData({ height: this._height, viewModel: this._vm!, entry: this._entry.value! });
		}
		this._templateRef.object.render(verticalSpace, width, offset);
	}
}

class DiffEditorItemTemplate extends Disposable {
	private _height: number = 500;
	private _heightObs: ISettableObservable<number> | undefined = undefined;

	private readonly _elements = h('div', {
		style: {
			display: 'flex',
			flexDirection: 'column',

		}
	}, [
		h('div', {
			style: {
				display: 'flex',
				flexDirection: 'column',

				flex: '1',
				border: '1px solid #4d4d4d',
				borderRadius: '5px',
				overflow: 'hidden',
				margin: '10px 10px 10px 10px',
			}
		}, [

			h('div', { style: { display: 'flex', alignItems: 'center', padding: '8px 5px', background: 'var(--vscode-multiDiffEditor-headerBackground)', color: 'black' } }, [
				//h('div.expand-button@collapseButton', { style: { margin: '0 5px' } }),
				h('div@title', { style: { fontSize: '14px' } }, ['Title'] as any),
			]),

			h('div', {
				style: {
					flex: '1',
					display: 'flex',
					flexDirection: 'column',
				}
			}, [
				h('div@editor', { style: { flex: '1' } }),
			])

		])
	]);

	private readonly editor = this._register(this._instantiationService.createInstance(DiffEditorWidget, this._elements.editor, {
		automaticLayout: true,
		scrollBeyondLastLine: false,
		hideUnchangedRegions: {
			enabled: true,
		},
		scrollbar: {
			vertical: 'hidden',
			handleMouseWheel: false,
		},
		renderOverviewRuler: false,
	}, {
		modifiedEditor: {
			contributions: [],
		},
		originalEditor: {
			contributions: [],
		}
	}));

	constructor(
		private readonly _container: HTMLElement,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILabelService private readonly _labelService: ILabelService,
	) {
		super();

		// TODO@hediet
		/*
		const btn = new Button(this._elements.collapseButton, {});
		btn.icon = Codicon.chevronDown;
		*/

		this._register(this.editor.onDidContentSizeChange(e => {
			this._height = e.contentHeight + this._elements.root.clientHeight - this._elements.editor.clientHeight;
			globalTransaction(tx => {
				this._heightObs?.set(this._height, tx);
			});
		}));

		this._container.appendChild(this._elements.root);
	}

	public setData(data: { height: ISettableObservable<number>; viewModel: IDiffEditorViewModel; entry: IDiffEntry }) {
		this._heightObs = data.height;
		globalTransaction(tx => {
			this.editor.setModel(data.viewModel, tx);
			this._heightObs!.set(this._height, tx);
		});
		this._elements.title.innerText = this._labelService.getUriLabel(data.viewModel.model.modified.uri, { relative: true }); // data.entry.title;
	}

	public hide(): void {
		this._elements.root.style.top = `-100000px`;
		this._elements.root.style.visibility = 'hidden'; // Some editor parts are still visible
	}

	public render(verticalRange: OffsetRange, width: number, editorScroll: number): void {
		this._elements.root.style.visibility = 'visible';
		this._elements.root.style.top = `${verticalRange.start}px`;
		this._elements.root.style.height = `${verticalRange.length}px`;
		this._elements.root.style.width = `${width}px`;
		this._elements.root.style.position = 'absolute';
		this.editor.getOriginalEditor().setScrollTop(editorScroll);
	}
}
