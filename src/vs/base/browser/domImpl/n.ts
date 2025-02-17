/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../common/errors.js';
import { DisposableStore, IDisposable } from '../../common/lifecycle.js';
import { derived, derivedOpts, derivedWithStore, IObservable, IReader, observableValue } from '../../common/observable.js';
import { isSVGElement } from '../dom.js';

export namespace n {
	function nodeNs<TMap extends Record<string, any>>(elementNs: string | undefined = undefined): DomTagCreateFn<TMap> {
		return (tag, attributes, children) => {
			const className = attributes.class;
			delete attributes.class;
			const ref = attributes.ref;
			delete attributes.ref;
			const obsRef = attributes.obsRef;
			delete attributes.obsRef;

			return new ObserverNodeWithElement(tag as any, ref, obsRef, elementNs, className, attributes, children);
		};
	}

	function node<TMap extends Record<string, any>, TKey extends keyof TMap>(tag: TKey, elementNs: string | undefined = undefined): DomCreateFn<TMap[TKey], TMap[TKey]> {
		const f = nodeNs(elementNs) as any;
		return (attributes, children) => {
			return f(tag, attributes, children);
		};
	}

	export const div: DomCreateFn<HTMLDivElement, HTMLDivElement> = node<HTMLElementTagNameMap, 'div'>('div');

	export const elem = nodeNs<HTMLElementTagNameMap>(undefined);

	export const svg: DomCreateFn<SVGElementTagNameMap2['svg'], SVGElement> = node<SVGElementTagNameMap2, 'svg'>('svg', 'http://www.w3.org/2000/svg');

	export const svgElem = nodeNs<SVGElementTagNameMap2>('http://www.w3.org/2000/svg');

	export function ref<T = Element>(): IRefWithVal<T> {
		let value: T | undefined = undefined;
		const result: IRef<T> = function (val: T) {
			value = val;
		};
		Object.defineProperty(result, 'element', {
			get() {
				if (!value) {
					throw new BugIndicatingError('Make sure the ref is set before accessing the element. Maybe wrong initialization order?');
				}
				return value;
			}
		});
		return result as any;
	}
}

type Value<T> = T | IObservable<T>;
type ValueOrList<T> = Value<T> | ValueOrList<T>[];
type ValueOrList2<T> = ValueOrList<T> | ValueOrList<ValueOrList<T>>;
type Element = HTMLElement | SVGElement;
type SVGElementTagNameMap2 = {
	svg: SVGElement & {
		width: number;
		height: number;
		transform: string;
		viewBox: string;
		fill: string;
	};
	path: SVGElement & {
		d: string;
		stroke: string;
		fill: string;
	};
	linearGradient: SVGElement & {
		id: string;
		x1: string | number;
		x2: string | number;
	};
	stop: SVGElement & {
		offset: string;
	};
	rect: SVGElement & {
		x: number;
		y: number;
		width: number;
		height: number;
		fill: string;
	};
	defs: SVGElement;
};

type DomTagCreateFn<TMap extends Record<string, any>> = <TTag extends keyof TMap>(
	tag: TTag,
	attributes: ElementAttributeKeys<TMap[TTag]> & { class?: ValueOrList<string | false | undefined>; ref?: IRef<TMap[TTag]>; obsRef?: IRef<ObserverNodeWithElement<TMap[TTag]> | null> },
	children?: ChildNode
) => ObserverNode<TMap[TTag]>;

type DomCreateFn<TAttributes, TResult extends Element> = (
	attributes: ElementAttributeKeys<TAttributes> & { class?: ValueOrList<string | false | undefined>; ref?: IRef<TResult>; obsRef?: IRef<ObserverNodeWithElement<TResult> | null> },
	children?: ChildNode
) => ObserverNode<TResult>;

export type ChildNode = ValueOrList2<Element | string | ObserverNode | undefined>;

export type IRef<T> = (value: T) => void;

export interface IRefWithVal<T> extends IRef<T> {
	readonly element: T;
}

export abstract class ObserverNode<T extends Element = Element> {
	private readonly _deriveds: (IObservable<any>)[] = [];

	protected readonly _element: T;

	constructor(
		tag: string,
		ref: IRef<T> | undefined,
		obsRef: IRef<ObserverNodeWithElement<T> | null> | undefined,
		ns: string | undefined,
		className: ValueOrList<string | undefined | false> | undefined,
		attributes: ElementAttributeKeys<T>,
		children: ChildNode
	) {
		this._element = (ns ? document.createElementNS(ns, tag) : document.createElement(tag)) as unknown as T;
		if (ref) {
			ref(this._element);
		}
		if (obsRef) {
			this._deriveds.push(derivedWithStore((_reader, store) => {
				obsRef(this as unknown as ObserverNodeWithElement<T>);
				store.add({
					dispose: () => {
						obsRef(null);
					}
				});
			}));
		}

		if (className) {
			if (hasObservable(className)) {
				this._deriveds.push(derived(this, reader => {
					/** @description set.class */
					setClassName(this._element, getClassName(className, reader));
				}));
			} else {
				setClassName(this._element, getClassName(className, undefined));
			}
		}

		for (const [key, value] of Object.entries(attributes)) {
			if (key === 'style') {
				for (const [cssKey, cssValue] of Object.entries(value)) {
					const key = camelCaseToHyphenCase(cssKey);
					if (isObservable(cssValue)) {
						this._deriveds.push(derivedOpts({ owner: this, debugName: () => `set.style.${key}` }, reader => {
							this._element.style.setProperty(key, convertCssValue(cssValue.read(reader)));
						}));
					} else {
						this._element.style.setProperty(key, convertCssValue(cssValue));
					}
				}
			} else if (key === 'tabIndex') {
				if (isObservable(value)) {
					this._deriveds.push(derived(this, reader => {
						/** @description set.tabIndex */
						this._element.tabIndex = value.read(reader) as any;
					}));
				} else {
					this._element.tabIndex = value;
				}
			} else if (key.startsWith('on')) {
				(this._element as any)[key] = value;
			} else {
				if (isObservable(value)) {
					this._deriveds.push(derivedOpts({ owner: this, debugName: () => `set.${key}` }, reader => {
						setOrRemoveAttribute(this._element, key, value.read(reader));
					}));
				} else {
					setOrRemoveAttribute(this._element, key, value);
				}
			}
		}

		if (children) {
			function getChildren(reader: IReader | undefined, children: ValueOrList2<Element | string | ObserverNode | undefined>): (Element | string)[] {
				if (isObservable(children)) {
					return getChildren(reader, children.read(reader));
				}
				if (Array.isArray(children)) {
					return children.flatMap(c => getChildren(reader, c));
				}
				if (children instanceof ObserverNode) {
					if (reader) {
						children.readEffect(reader);
					}
					return [children._element];
				}
				if (children) {
					return [children];
				}
				return [];
			}

			const d = derived(this, reader => {
				/** @description set.children */
				this._element.replaceChildren(...getChildren(reader, children));
			});
			this._deriveds.push(d);
			if (!childrenIsObservable(children)) {
				d.get();
			}
		}
	}

	readEffect(reader: IReader | undefined): void {
		for (const d of this._deriveds) {
			d.read(reader);
		}
	}

	keepUpdated(store: DisposableStore): ObserverNodeWithElement<T> {
		derived(reader => {
			/** update */
			this.readEffect(reader);
		}).recomputeInitiallyAndOnChange(store);
		return this as unknown as ObserverNodeWithElement<T>;
	}

	/**
	 * Creates a live element that will keep the element updated as long as the returned object is not disposed.
	*/
	toDisposableLiveElement() {
		const store = new DisposableStore();
		this.keepUpdated(store);
		return new LiveElement(this._element, store);
	}
}

function setClassName(domNode: Element, className: string) {
	if (isSVGElement(domNode)) {
		domNode.setAttribute('class', className);
	} else {
		domNode.className = className;
	}
}

function resolve<T>(value: ValueOrList<T>, reader: IReader | undefined, cb: (val: T) => void): void {
	if (isObservable(value)) {
		cb(value.read(reader));
		return;
	}
	if (Array.isArray(value)) {
		for (const v of value) {
			resolve(v, reader, cb);
		}
		return;
	}
	cb(value as any);
}

function getClassName(className: ValueOrList<string | undefined | false> | undefined, reader: IReader | undefined): string {
	let result = '';
	resolve(className, reader, val => {
		if (val) {
			if (result.length === 0) {
				result = val;
			} else {
				result += ' ' + val;
			}
		}
	});
	return result;
}

function hasObservable(value: ValueOrList<unknown>): boolean {
	if (isObservable(value)) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.some(v => hasObservable(v));
	}
	return false;
}

function convertCssValue(value: any): string {
	if (typeof value === 'number') {
		return value + 'px';
	}
	return value;
}

function childrenIsObservable(children: ValueOrList2<Element | string | ObserverNode | undefined>): boolean {
	if (isObservable(children)) {
		return true;
	}
	if (Array.isArray(children)) {
		return children.some(c => childrenIsObservable(c));
	}
	return false;
}

export class LiveElement<T extends Element = HTMLElement> {
	constructor(
		public readonly element: T,
		private readonly _disposable: IDisposable
	) { }

	dispose() {
		this._disposable.dispose();
	}
}

export class ObserverNodeWithElement<T extends Element = Element> extends ObserverNode<T> {
	public get element() {
		return this._element;
	}

	private _isHovered: IObservable<boolean> | undefined = undefined;

	get isHovered(): IObservable<boolean> {
		if (!this._isHovered) {
			const hovered = observableValue<boolean>('hovered', false);
			this._element.addEventListener('mouseenter', (_e) => hovered.set(true, undefined));
			this._element.addEventListener('mouseleave', (_e) => hovered.set(false, undefined));
			this._isHovered = hovered;
		}
		return this._isHovered;
	}

	private _didMouseMoveDuringHover: IObservable<boolean> | undefined = undefined;

	get didMouseMoveDuringHover(): IObservable<boolean> {
		if (!this._didMouseMoveDuringHover) {
			let _hovering = false;
			const hovered = observableValue<boolean>('didMouseMoveDuringHover', false);
			this._element.addEventListener('mouseenter', (_e) => {
				_hovering = true;
			});
			this._element.addEventListener('mousemove', (_e) => {
				if (_hovering) {
					hovered.set(true, undefined);
				}
			});
			this._element.addEventListener('mouseleave', (_e) => {
				_hovering = false;
				hovered.set(false, undefined);
			});
			this._didMouseMoveDuringHover = hovered;
		}
		return this._didMouseMoveDuringHover;
	}
}

function setOrRemoveAttribute(element: Element, key: string, value: unknown) {
	if (value === null || value === undefined) {
		element.removeAttribute(camelCaseToHyphenCase(key));
	} else {
		element.setAttribute(camelCaseToHyphenCase(key), String(value));
	}
}

function camelCaseToHyphenCase(str: string) {
	return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function isObservable<T>(obj: any): obj is IObservable<T> {
	return obj && typeof obj === 'object' && obj['read'] !== undefined && obj['reportChanges'] !== undefined;
}

type ElementAttributeKeys<T> = Partial<{
	[K in keyof T]: T[K] extends Function ? never : T[K] extends object ? ElementAttributeKeys<T[K]> : Value<number | T[K] | undefined | null>;
}>;
