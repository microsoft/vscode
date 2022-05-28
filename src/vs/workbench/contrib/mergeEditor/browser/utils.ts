/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CompareResult, ArrayQueue } from 'vs/base/common/arrays';
import { BugIndicatingError } from 'vs/base/common/errors';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { IObservable, autorun } from 'vs/workbench/contrib/audioCues/browser/observable';
import { IDisposable } from 'xterm';

export class ReentrancyBarrier {
	private isActive = false;

	public runExclusively(fn: () => void): void {
		if (this.isActive) {
			return;
		}
		this.isActive = true;
		try {
			fn();
		} finally {
			this.isActive = false;
		}
	}

	public runExclusivelyOrThrow(fn: () => void): void {
		if (this.isActive) {
			throw new BugIndicatingError();
		}
		this.isActive = true;
		try {
			fn();
		} finally {
			this.isActive = false;
		}
	}
}

export function n<TTag extends string>(tag: TTag): never;
export function n<TTag extends string, T extends any[]>(
	tag: TTag,
	children: T
): (ArrayToObj<T> & Record<'root', TagToElement<TTag>>) extends infer Y ? { [TKey in keyof Y]: Y[TKey] } : never;
export function n<TTag extends string, TId extends string>(
	tag: TTag,
	attributes: { $: TId }
): Record<TId, TagToElement<TTag>>;
export function n<TTag extends string, TId extends string, T extends any[]>(
	tag: TTag,
	attributes: { $: TId },
	children: T
): (ArrayToObj<T> & Record<TId, TagToElement<TTag>>) extends infer Y ? { [TKey in keyof Y]: Y[TKey] } : never;
export function n(tag: string, ...args: [] | [attributes: { $: string } | Record<string, any>, children?: any[]] | [children: any[]]): Record<string, HTMLElement> {
	let attributes: Record<string, any>;
	let children: (Record<string, HTMLElement> | HTMLElement)[] | undefined;

	if (Array.isArray(args[0])) {
		attributes = {};
		children = args[0];
	} else {
		attributes = args[0] as any || {};
		children = args[1];
	}

	const [tagName, className] = tag.split('.');
	const el = document.createElement(tagName);
	if (className) {
		el.className = className;
	}

	const result: Record<string, HTMLElement> = {};

	if (children) {
		for (const c of children) {
			if (c instanceof HTMLElement) {
				el.appendChild(c);
			} else {
				Object.assign(result, c);
				el.appendChild(c.root);
			}
		}
	}

	result['root'] = el;

	for (const [key, value] of Object.entries(attributes)) {
		if (key === '$') {
			result[value] = el;
			continue;
		}
		el.setAttribute(key, value);
	}

	return result;
}

type RemoveHTMLElement<T> = T extends HTMLElement ? never : T;

type ArrayToObj<T extends any[]> = UnionToIntersection<RemoveHTMLElement<T[number]>>;


type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

type HTMLElementsByTagName = {
	div: HTMLDivElement;
	span: HTMLSpanElement;
	a: HTMLAnchorElement;
};

type TagToElement<T> = T extends `${infer TStart}.${string}`
	? TStart extends keyof HTMLElementsByTagName
	? HTMLElementsByTagName[TStart]
	: HTMLElement
	: T extends keyof HTMLElementsByTagName
	? HTMLElementsByTagName[T]
	: HTMLElement;

export function setStyle(
	element: HTMLElement,
	style: {
		width?: number | string;
		height?: number | string;
		left?: number | string;
		top?: number | string;
	}
): void {
	Object.entries(style).forEach(([key, value]) => {
		element.style.setProperty(key, toSize(value));
	});
}

function toSize(value: number | string): string {
	return typeof value === 'number' ? `${value}px` : value;
}

export function applyObservableDecorations(editor: CodeEditorWidget, decorations: IObservable<IModelDeltaDecoration[]>): IDisposable {
	const d = new DisposableStore();
	let decorationIds: string[] = [];
	d.add(autorun(reader => {
		const d = decorations.read(reader);
		editor.changeDecorations(a => {
			decorationIds = a.deltaDecorations(decorationIds, d);
		});
	}, 'Update Decorations'));
	d.add({
		dispose: () => {
			editor.changeDecorations(a => {
				decorationIds = a.deltaDecorations(decorationIds, []);
			});
		}
	});
	return d;
}

export function* leftJoin<TLeft, TRight>(
	left: Iterable<TLeft>,
	right: readonly TRight[],
	compare: (left: TLeft, right: TRight) => CompareResult,
): IterableIterator<{ left: TLeft; rights: TRight[] }> {
	const rightQueue = new ArrayQueue(right);
	for (const leftElement of left) {
		rightQueue.takeWhile(rightElement => CompareResult.isGreaterThan(compare(leftElement, rightElement)));
		const equals = rightQueue.takeWhile(rightElement => CompareResult.isNeitherLessOrGreaterThan(compare(leftElement, rightElement)));
		yield { left: leftElement, rights: equals || [] };
	}
}
