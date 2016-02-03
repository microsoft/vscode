/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IScrollable } from 'vs/base/common/scrollable';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Gesture } from 'vs/base/browser/touch';
import { IScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/impl/scrollableElement';
import { RangeMap } from './rangeMap';

export interface IScrollEvent {
	vertical: boolean;
	horizontal: boolean;
}

export interface IListDelegate<T> {
	getHeight(element: T): number;
	getTemplateId(element: T): string;
}

export interface IRenderer<TElement, TTemplateData> {
	templateId: string;
	renderTemplate(container: HTMLElement): TTemplateData;
	renderElement(element: TElement, templateData: TTemplateData): void;
	disposeTemplate(templateData: TTemplateData): void;
}

export class List<T> implements IScrollable {

	private rangeMap: RangeMap;
	private scrollTop: number;
	private viewHeight: number;

	private domNode: HTMLElement;
	private wrapper: HTMLElement;
	private gesture: Gesture;
	private rowsContainer: HTMLElement;
	private scrollableElement: IScrollableElement;

	private _onScroll = new Emitter<IScrollEvent>();
	onScroll: Event<IScrollEvent> = this._onScroll.event;

	constructor(container: HTMLElement, delegate: IListDelegate<T>, renderers: IRenderer<T, any>) {
		this.rangeMap = new RangeMap();

		this.domNode = document.createElement('div');
		this.domNode.className = 'monaco-list';
		this.domNode.tabIndex = 0;

		this.wrapper = document.createElement('div');
		this.wrapper.className = 'monaco-list-wrapper';
		this.scrollableElement = new ScrollableElement(this.wrapper, {
			forbidTranslate3dUse: true,
			scrollable: this,
			horizontal: 'hidden',
			vertical: 'auto',
			useShadows: true,
			saveLastScrollTimeOnClassName: 'monaco-list-row'
		});

		this.gesture = new Gesture(this.wrapper);

		this.rowsContainer = document.createElement('div');
		this.rowsContainer.className = 'monaco-list-rows';
	}

	// IScrollable

	getScrollHeight(): number {
		return this.rangeMap.size;
	}

	getScrollWidth(): number {
		return 0;
	}

	getScrollLeft(): number {
		return 0;
	}

	setScrollLeft(scrollLeft: number): void {
		// noop
	}

	getScrollTop(): number {
		return this.scrollTop;
	}

	setScrollTop(scrollTop: number): void {
		scrollTop = Math.min(scrollTop, this.getScrollHeight() - this.viewHeight);
		scrollTop = Math.max(scrollTop, 0);

		// this.render(scrollTop, this.viewHeight);
		this.scrollTop = scrollTop;

		this._onScroll.fire({ vertical: true, horizontal: false });
	}

	addScrollListener(callback: ()=>void): IDisposable {
		return this.onScroll(callback);
	}

	dispose() {
		if (this.domNode && this.domNode.parentElement) {
			this.domNode.parentNode.removeChild(this.domNode);
			this.domNode = null;
		}

		this.rangeMap = dispose(this.rangeMap);
		this.gesture = dispose(this.gesture);
		this.scrollableElement = dispose(this.scrollableElement);
		this._onScroll = dispose(this._onScroll);
	}
}
