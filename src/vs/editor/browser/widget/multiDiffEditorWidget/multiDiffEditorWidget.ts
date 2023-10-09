/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { h } from 'vs/base/browser/dom';
import { Disposable, DisposableMap, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, constObservable } from 'vs/base/common/observable';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';

export class MultiDiffEditorWidgetImpl extends Disposable {
	private readonly _elements = h('div', {
		style: {
			border: 'solid 1px red',
			overflowY: 'scroll',
		}
	}, [
		h('div@content', {
			style: {
				background: 'blue',
				overflow: 'hidden',
			}
		})
	]);

	private readonly _viewItems = [
		new ViewItem(this._elements.content, 100, 'green'),
		new ViewItem(this._elements.content, 100, 'orange'),
		new ViewItem(this._elements.content, 1000, 'red'),
		new ViewItem(this._elements.content, 2000, 'green'),
		new ViewItem(this._elements.content, 300, 'yellow'),
	];

	constructor(private readonly _element: HTMLElement) {
		super();

		_element.replaceChildren(this._elements.root);

		this._register(toDisposable(() => {
			_element.replaceChildren();
		}));

		this._elements.root.style.height = '500px';


		const heightSum = this._viewItems.reduce((r, i) => r + i.height.get(), 0);
		this._elements.content.style.height = `${heightSum}px`;
		this._elements.content.style.position = 'relative';

		this._elements.root.onscroll = () => {
			this.render();
		};
		this.render();
	}

	private render() {

		let offset = 0;
		for (const v of this._viewItems) {
			v.render(
				offset,
				OffsetRange.ofStartAndLength(this._elements.root.scrollTop, this._elements.root.clientHeight),
				this._elements.content.clientWidth
			);
			offset += v.height.get();
		}
	}
}



class ViewItem {
	public readonly height: IObservable<number> = constObservable(this._height);
	//public readonly maxScrollTop: IObservable<number>;
	//public readonly scrollTop: IObservable<number>;

	private readonly _domNode: HTMLElement = h('div', {
		style: {
			background: this._color,
		}
	}, ['hello']).root;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _height: number,
		private readonly _color: string,
	) {
		this._container.appendChild(this._domNode);
	}

	public hide(): void {
		this._domNode.style.display = 'none';
	}

	public render(topOffset: number, verticalViewPort: OffsetRange, width: number): void {
		const itemRange = OffsetRange.ofStartAndLength(topOffset, this._height);
		let range: OffsetRange;
		const maxLength = Math.min(itemRange.length, verticalViewPort.length);
		if (itemRange.start < verticalViewPort.start) {
			if (itemRange.endExclusive > verticalViewPort.endExclusive) {
				range = verticalViewPort;
			} else {
				range = OffsetRange.ofStartAndLength(itemRange.endExclusive - maxLength, maxLength);
			}
		} else {
			if (itemRange.endExclusive > verticalViewPort.endExclusive) {
				range = OffsetRange.ofStartAndLength(itemRange.start, maxLength);
			} else {
				range = itemRange;
			}
		}


		this._domNode.style.display = 'block';
		this._domNode.style.top = `${range.start}px`;
		this._domNode.style.height = `${range.length}px`;
		this._domNode.style.width = `${width}px`;
		this._domNode.style.position = 'absolute';

		this._domNode.innerText = `topOffset: ${topOffset}, verticalViewPort: ${verticalViewPort}`;
	}
}

interface IMultiDocumentDiffEditorModel {
	diffs: LazyPromise<IDiffEntry>[];
	onDidChange: Event;
}

interface LazyPromise<T> {
	request(): Promise<T>;
	value: T | undefined;
	onDidChange: Event;
}

interface IDiffEntry {
	original: ITextModel | undefined; // undefined if the file was created.
	modified: ITextModel | undefined; // undefined if the file was deleted.
}
