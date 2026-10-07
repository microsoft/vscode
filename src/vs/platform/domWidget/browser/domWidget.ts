/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHotReloadEnabled } from '../../../base/common/hotReload.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { ISettableObservable, IObservable, autorun, constObservable, derived } from '../../../base/common/observable.js';
import { IInstantiationService, GetLeadingNonServiceArgs } from '../../instantiation/common/instantiation.js';

/**
 * The DomWidget class provides a standard to define reusable UI components.
 * It is disposable and defines a single root element of type HTMLElement.
 * It also provides static helper methods to create and append widgets to the DOM,
 * with support for hot module replacement during development.
*/
export abstract class DomWidget extends Disposable {
	/**
	 * Appends the widget to the provided DOM element.
	*/
	public static instantiateAppend<TArgs extends unknown[], T extends DomWidget>(this: DomWidgetCtor<TArgs, T>, instantiationService: IInstantiationService, dom: HTMLElement, store: DisposableStore, ...params: GetLeadingNonServiceArgs<TArgs>): void {
		if (!isHotReloadEnabled()) {
			const widget = instantiationService.createInstance(this as unknown as new (...args: unknown[]) => T, ...params);
			dom.appendChild(widget.element);
			store.add(widget);
			return;
		}

		const observable = this.instantiateObservable(instantiationService, store, ...params);
		let lastWidget: DomWidget | undefined = undefined;
		store.add(autorun((reader) => {
			const widget = observable.read(reader);
			if (lastWidget) {
				lastWidget.element.replaceWith(widget.element);
			} else {
				dom.appendChild(widget.element);
			}
			lastWidget = widget;

			reader.delayedStore.add(widget);
		}));
	}

	/**
	 * Creates the widget in a new div element with "display: contents".
	 * If possible, prefer `instantiateAppend`, as it avoids an extra div in the DOM.
	*/
	public static instantiateInContents<TArgs extends unknown[], T extends DomWidget>(this: DomWidgetCtor<TArgs, T>, instantiationService: IInstantiationService, store: DisposableStore, ...params: GetLeadingNonServiceArgs<TArgs>): HTMLDivElement {
		const div = document.createElement('div');
		div.style.display = 'contents';
		this.instantiateAppend(instantiationService, div, store, ...params);
		return div;
	}

	/**
	 * Creates an observable instance of the widget.
	 * The observable will change when hot module replacement occurs.
	*/
	public static instantiateObservable<TArgs extends unknown[], T extends DomWidget>(this: DomWidgetCtor<TArgs, T>, instantiationService: IInstantiationService, store: DisposableStore, ...params: GetLeadingNonServiceArgs<TArgs>): IObservable<T> {
		if (!isHotReloadEnabled()) {
			return constObservable(instantiationService.createInstance(this as unknown as new (...args: unknown[]) => T, ...params));
		}

		const id = (this as unknown as HotReloadable)[_hotReloadId];
		const observable = id ? hotReloadedWidgets.get(id) : undefined;

		if (!observable) {
			return constObservable(instantiationService.createInstance(this as unknown as new (...args: unknown[]) => T, ...params));
		}

		return derived(reader => {
			const Ctor = observable.read(reader);
			return instantiationService.createInstance(Ctor, ...params) as T;
		});
	}

	/** Always returns the same element. */
	abstract get element(): HTMLElement;
}

const _hotReloadId = Symbol('DomWidgetHotReloadId');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hotReloadedWidgets = new Map<string, ISettableObservable<new (...args: any[]) => DomWidget>>();

interface HotReloadable {
	[_hotReloadId]?: string;
}

type DomWidgetCtor<TArgs extends unknown[], T extends DomWidget> = {
	new(...args: TArgs): T;

	instantiateObservable(instantiationService: IInstantiationService, store: DisposableStore, ...params: GetLeadingNonServiceArgs<TArgs>): IObservable<T>;
	instantiateAppend(instantiationService: IInstantiationService, dom: HTMLElement, store: DisposableStore, ...params: GetLeadingNonServiceArgs<TArgs>): void;
};
