/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './wrappedList.css';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../common/lifecycle.js';
import * as dom from '../../dom.js';
import { IListRenderer } from './list.js';
import { DomScrollableElement } from '../scrollbar/scrollableElement.js';

export interface IWrappedListVirtualDelegate<T> {
	getDimension(element: T): dom.Dimension;
	getTemplateId(element: T): string;
}

export class WrappedList<T> extends Disposable implements IDisposable {

	private readonly element: HTMLElement;
	private readonly rowsElement: HTMLElement;
	private readonly disposableStore: DisposableStore;
	private readonly scrollableElement: DomScrollableElement;

	private height: number | undefined;

	constructor(
		user: string,
		container: HTMLElement,
		private readonly virtualDelegate: IWrappedListVirtualDelegate<T>,
		private readonly renderer: IListRenderer<T, any>,
	) {
		super();
		this.element = dom.append(container, dom.$('.monaco-list.monaco-wrapped-list'));
		this.rowsElement = dom.$('.monaco-list-rows');

		this.scrollableElement = this._register(new DomScrollableElement(this.rowsElement, { useShadows: false }));
		this.element.appendChild(this.scrollableElement.getDomNode());

		this.disposableStore = this._register(new DisposableStore());
	}

	public set(elements: T[]): void {
		dom.clearNode(this.rowsElement);
		this.disposableStore.clear();
		for (let index = 0; index < elements.length; index++) {
			this.renderElement(elements[index], index);
		}
		this.layout(this.height);
	}

	layout(height?: number, width?: number): void {
		this.height = height;
		this.scrollableElement.scanDomNode();
	}

	private renderElement(element: T, index: number): void {
		const elementContainer = dom.append(this.rowsElement, dom.$('.monaco-list-row'));
		const dimension = this.virtualDelegate.getDimension(element);
		elementContainer.style.height = `${dimension.height}px`;
		elementContainer.style.width = `${dimension.width}px`;
		elementContainer.setAttribute('tabindex', '0');

		const template = this.renderer.renderTemplate(dom.append(dom.append(elementContainer, dom.$('.monaco-tl-row', undefined)), dom.$('.monaco-tl-contents')));
		this.disposableStore.add(toDisposable(() => this.renderer.disposeTemplate(template)));
		this.renderer.renderElement(element, index, template, undefined);
	}
}
