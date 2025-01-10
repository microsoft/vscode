/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getDomNodePagePosition, h, isSVGElement } from '../../../../../../base/browser/dom.js';
import { KeybindingLabel, unthemedKeybindingLabelOptions } from '../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { numberComparator } from '../../../../../../base/common/arrays.js';
import { findFirstMin } from '../../../../../../base/common/arraysFind.js';
import { BugIndicatingError } from '../../../../../../base/common/errors.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { derived, derivedObservableWithCache, IObservable, IReader, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { OS } from '../../../../../../base/common/platform.js';
import { getIndentationLength, splitLines } from '../../../../../../base/common/strings.js';
import { URI } from '../../../../../../base/common/uri.js';
import { MenuEntryActionViewItem } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { ObservableCodeEditor } from '../../../../../browser/observableCodeEditor.js';
import { Point } from '../../../../../browser/point.js';
import { Rect } from '../../../../../browser/rect.js';
import { EditorOption } from '../../../../../common/config/editorOptions.js';
import { LineRange } from '../../../../../common/core/lineRange.js';
import { OffsetRange } from '../../../../../common/core/offsetRange.js';
import { Position } from '../../../../../common/core/position.js';
import { Range } from '../../../../../common/core/range.js';
import { SingleTextEdit, TextEdit } from '../../../../../common/core/textEdit.js';
import { RangeMapping } from '../../../../../common/diff/rangeMapping.js';

export function maxContentWidthInRange(editor: ObservableCodeEditor, range: LineRange, reader: IReader): number {
	editor.layoutInfo.read(reader);
	editor.value.read(reader);

	const model = editor.model.read(reader);
	if (!model) { return 0; }
	let maxContentWidth = 0;

	editor.scrollTop.read(reader);
	for (let i = range.startLineNumber; i < range.endLineNumberExclusive; i++) {
		const column = model.getLineMaxColumn(i);
		let lineContentWidth = editor.editor.getOffsetForColumn(i, column);
		if (lineContentWidth === -1) {
			// approximation
			const typicalHalfwidthCharacterWidth = editor.editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
			const approximation = column * typicalHalfwidthCharacterWidth;
			lineContentWidth = approximation;
		}
		maxContentWidth = Math.max(maxContentWidth, lineContentWidth);
	}
	const lines = range.mapToLineArray(l => model.getLineContent(l));

	if (maxContentWidth < 5 && lines.some(l => l.length > 0) && model.uri.scheme !== 'file') {
		console.error('unexpected width');
	}
	return maxContentWidth;
}

export function getOffsetForPos(editor: ObservableCodeEditor, pos: Position, reader: IReader): number {
	editor.layoutInfo.read(reader);
	editor.value.read(reader);

	const model = editor.model.read(reader);
	if (!model) { return 0; }

	editor.scrollTop.read(reader);
	const lineContentWidth = editor.editor.getOffsetForColumn(pos.lineNumber, pos.column);

	return lineContentWidth;
}

export class StatusBarViewItem extends MenuEntryActionViewItem {
	protected readonly _updateLabelListener = this._register(this._contextKeyService.onDidChangeContext(() => {
		this.updateLabel();
	}));

	protected override updateLabel() {
		const kb = this._keybindingService.lookupKeybinding(this._action.id, this._contextKeyService, true);
		if (!kb) {
			return super.updateLabel();
		}
		if (this.label) {
			const div = h('div.keybinding').root;
			const keybindingLabel = this._register(new KeybindingLabel(div, OS, { disableTitle: true, ...unthemedKeybindingLabelOptions }));
			keybindingLabel.set(kb);
			this.label.textContent = this._action.label;
			this.label.appendChild(div);
			this.label.classList.add('inlineSuggestionStatusBarItemLabel');
		}
	}

	protected override updateTooltip(): void {
		// NOOP, disable tooltip
	}
}

export class UniqueUriGenerator {
	private static _modelId = 0;

	constructor(
		public readonly scheme: string
	) { }

	public getUniqueUri(): URI {
		return URI.from({ scheme: this.scheme, path: new Date().toString() + String(UniqueUriGenerator._modelId++) });
	}
}
export function applyEditToModifiedRangeMappings(rangeMapping: RangeMapping[], edit: TextEdit): RangeMapping[] {
	const updatedMappings: RangeMapping[] = [];
	for (const m of rangeMapping) {
		const updatedRange = edit.mapRange(m.modifiedRange);
		updatedMappings.push(new RangeMapping(m.originalRange, updatedRange));
	}
	return updatedMappings;
}


export function classNames(...classes: (string | false | undefined | null)[]) {
	return classes.filter(c => typeof c === 'string').join(' ');
}

function offsetRangeToRange(columnOffsetRange: OffsetRange, startPos: Position): Range {
	return new Range(
		startPos.lineNumber,
		startPos.column + columnOffsetRange.start,
		startPos.lineNumber,
		startPos.column + columnOffsetRange.endExclusive,
	);
}

export function createReindentEdit(text: string, range: LineRange): TextEdit {
	const newLines = splitLines(text);
	const edits: SingleTextEdit[] = [];
	const minIndent = findFirstMin(range.mapToLineArray(l => getIndentationLength(newLines[l - 1])), numberComparator)!;
	range.forEach(lineNumber => {
		edits.push(new SingleTextEdit(offsetRangeToRange(new OffsetRange(0, minIndent), new Position(lineNumber, 1)), ''));
	});
	return new TextEdit(edits);
}

export class PathBuilder {
	private _data: string = '';

	public moveTo(point: Point): this {
		this._data += `M ${point.x} ${point.y} `;
		return this;
	}

	public lineTo(point: Point): this {
		this._data += `L ${point.x} ${point.y} `;
		return this;
	}

	public curveTo(cp: Point, to: Point): this {
		this._data += `Q ${cp.x} ${cp.y} ${to.x} ${to.y} `;
		return this;
	}

	public curveTo2(cp1: Point, cp2: Point, to: Point): this {
		this._data += `C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${to.x} ${to.y} `;
		return this;
	}

	public build(): string {
		return this._data;
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

type DomTagCreateFn<TMap extends Record<string, any>> =
	<TTag extends keyof TMap>(
		tag: TTag,
		attributes: ElementAttributeKeys<TMap[TTag]> & { class?: ValueOrList<string | false | undefined>; ref?: IRef<TMap[TTag]> },
		children?: ChildNode,
	) => ObserverNode<TMap[TTag]>;

type DomCreateFn<TAttributes, TResult extends Element> =
	(
		attributes: ElementAttributeKeys<TAttributes> & { class?: ValueOrList<string | false | undefined>; ref?: IRef<TResult> },
		children?: ChildNode,
	) => ObserverNode<TResult>;

export type ChildNode = ValueOrList2<Element | string | ObserverNode | undefined>;

export namespace n {
	function nodeNs<TMap extends Record<string, any>>(elementNs: string | undefined = undefined): DomTagCreateFn<TMap> {
		return (tag, attributes, children) => {
			const className = attributes.class;
			delete attributes.class;
			const ref = attributes.ref;
			delete attributes.ref;

			return new ObserverNodeWithElement(tag as any, ref, elementNs, className, attributes, children);
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
		ns: string | undefined,
		className: ValueOrList<string | undefined | false> | undefined,
		attributes: ElementAttributeKeys<T>,
		children: ChildNode,
	) {
		this._element = (ns ? document.createElementNS(ns, tag) : document.createElement(tag)) as unknown as T;
		if (ref) {
			ref(this._element);
		}

		if (className) {
			if (hasObservable(className)) {
				this._deriveds.push(derived(this, reader => {
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
						this._deriveds.push(derived(this, reader => {
							this._element.style.setProperty(key, convertCssValue(cssValue.read(reader)));
						}));
					} else {
						this._element.style.setProperty(key, convertCssValue(cssValue));
					}
				}
			} else if (key === 'tabIndex') {
				if (isObservable(value)) {
					this._deriveds.push(derived(this, reader => {
						this._element.tabIndex = value.read(reader) as any;
					}));
				} else {
					this._element.tabIndex = value;
				}
			} else if (key.startsWith('on')) {
				(this._element as any)[key] = value;
			} else {
				if (isObservable(value)) {
					this._deriveds.push(derived(this, reader => {
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
		private readonly _disposable: IDisposable,
	) { }

	dispose() {
		this._disposable.dispose();
	}
}

export class ObserverNodeWithElement<T extends Element = Element> extends ObserverNode<T> {
	public get element() {
		return this._element;
	}

	public getIsHovered(store: DisposableStore): IObservable<boolean> {
		const hovered = observableValue<boolean>('hovered', false);
		store.add(addDisposableListener(this._element, 'mouseenter', () => hovered.set(true, undefined)));
		store.add(addDisposableListener(this._element, 'mouseleave', () => hovered.set(false, undefined)));
		return hovered;
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
	[K in keyof T]: T[K] extends Function
	? never
	: T[K] extends object
	? ElementAttributeKeys<T[K]>
	: Value<number | T[K] | undefined | null>
}>;

type RemoveFalsy<T> = T extends false | undefined | null ? never : T;
type Falsy<T> = T extends false | undefined | null ? T : never;

export function mapOutFalsy<T>(obs: IObservable<T>): IObservable<IObservable<RemoveFalsy<T>> | Falsy<T>> {
	const nonUndefinedObs = derivedObservableWithCache<T | undefined | null | false>(undefined, (reader, lastValue) => obs.read(reader) || lastValue);

	return derived(reader => {
		nonUndefinedObs.read(reader);
		const val = obs.read(reader);
		if (!val) {
			return undefined as Falsy<T>;
		}

		return nonUndefinedObs as IObservable<RemoveFalsy<T>>;
	});
}

export function observeElementPosition(element: HTMLElement, store: DisposableStore) {
	const topLeft = getDomNodePagePosition(element);
	const top = observableValue<number>('top', topLeft.top);
	const left = observableValue<number>('left', topLeft.left);

	const resizeObserver = new ResizeObserver(() => {
		transaction(tx => {
			const topLeft = getDomNodePagePosition(element);
			top.set(topLeft.top, tx);
			left.set(topLeft.left, tx);
		});
	});

	resizeObserver.observe(element);

	store.add(toDisposable(() => resizeObserver.disconnect()));

	return {
		top,
		left
	};
}

export function rectToProps(fn: (reader: IReader) => Rect) {
	return {
		left: derived(reader => fn(reader).left),
		top: derived(reader => fn(reader).top),
		width: derived(reader => fn(reader).right - fn(reader).left),
		height: derived(reader => fn(reader).bottom - fn(reader).top),
	};
}

export type FirstFnArg<T> = T extends (arg: infer U) => any ? U : never;
