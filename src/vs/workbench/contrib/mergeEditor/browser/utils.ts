/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayQueue, CompareResult } from 'vs/base/common/arrays';
import { onUnexpectedError } from 'vs/base/common/errors';
import { DisposableStore, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IObservable, autorunOpts } from 'vs/base/common/observable';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';

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
	d.add(autorunOpts({ debugName: () => `Apply decorations from ${decorations.debugName}` }, reader => {
		const d = decorations.read(reader);
		editor.changeDecorations(a => {
			decorationIds = a.deltaDecorations(decorationIds, d);
		});
	}));
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

export function* join<TLeft, TRight>(
	left: Iterable<TLeft>,
	right: readonly TRight[],
	compare: (left: TLeft, right: TRight) => CompareResult,
): IterableIterator<{ left?: TLeft; rights: TRight[] }> {
	const rightQueue = new ArrayQueue(right);
	for (const leftElement of left) {
		const skipped = rightQueue.takeWhile(rightElement => CompareResult.isGreaterThan(compare(leftElement, rightElement)));
		if (skipped) {
			yield { rights: skipped };
		}
		const equals = rightQueue.takeWhile(rightElement => CompareResult.isNeitherLessOrGreaterThan(compare(leftElement, rightElement)));
		yield { left: leftElement, rights: equals || [] };
	}
}

export function concatArrays<TArr extends any[]>(...arrays: TArr): TArr[number][number][] {
	return ([] as any[]).concat(...arrays);
}

export function elementAtOrUndefined<T>(arr: T[], index: number): T | undefined {
	return arr[index];
}

export function thenIfNotDisposed<T>(promise: Promise<T>, then: () => void): IDisposable {
	let disposed = false;
	promise.then(() => {
		if (disposed) {
			return;
		}
		then();
	});
	return toDisposable(() => {
		disposed = true;
	});
}

export function setFields<T extends {}>(obj: T, fields: Partial<T>): T {
	return Object.assign(obj, fields);
}

export function deepMerge<T extends {}>(source1: T, source2: Partial<T>): T {
	const result = {} as any as T;
	for (const key in source1) {
		result[key] = source1[key];
	}
	for (const key in source2) {
		const source2Value = source2[key];
		if (typeof result[key] === 'object' && source2Value && typeof source2Value === 'object') {
			result[key] = deepMerge<any>(result[key], source2Value);
		} else {
			result[key] = source2Value as any;
		}
	}
	return result;
}

export class PersistentStore<T> {
	private hasValue = false;
	private value: Readonly<T> | undefined = undefined;

	constructor(
		private readonly key: string,
		@IStorageService private readonly storageService: IStorageService
	) { }

	public get(): Readonly<T> | undefined {
		if (!this.hasValue) {
			const value = this.storageService.get(this.key, StorageScope.PROFILE);
			if (value !== undefined) {
				try {
					this.value = JSON.parse(value) as any;
				} catch (e) {
					onUnexpectedError(e);
				}
			}
			this.hasValue = true;
		}

		return this.value;
	}

	public set(newValue: T | undefined): void {
		this.value = newValue;

		this.storageService.store(
			this.key,
			JSON.stringify(this.value),
			StorageScope.PROFILE,
			StorageTarget.USER
		);
	}
}

